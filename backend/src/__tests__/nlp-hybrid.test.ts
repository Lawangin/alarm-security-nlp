import { vi, describe, it, expect } from 'vitest';
import { Intent, type ParsedCommand } from '../types.js';

// ---------------------------------------------------------------------------
// Config mock — sets CONFIDENCE_THRESHOLD to 0.85 (project default)
// ---------------------------------------------------------------------------
vi.mock('../config.js', () => ({
  config: {
    LLM_API_KEY: 'test-api-key',
    LLM_MODEL: 'claude-opus-4-6',
    CONFIDENCE_THRESHOLD: 0.85,
  },
}));

// Also mock the SDK so LlmStrategy can be constructed inside HybridStrategy
// without a real API key (we inject mock strategies anyway, but the import
// of llmStrategy.ts still runs the Anthropic constructor at module level).
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}));

const { HybridStrategy } = await import('../nlp/hybridStrategy.js');

// ---------------------------------------------------------------------------
// Helpers — minimal NlpStrategy stubs
// ---------------------------------------------------------------------------

function makeRuleBased(result: Partial<ParsedCommand>): { parse: ReturnType<typeof vi.fn>; initialize: ReturnType<typeof vi.fn>; isReady: () => boolean } {
  const base: ParsedCommand = {
    intent: Intent.UNKNOWN,
    confidence: 0,
    entities: {},
    rawText: '',
    source: 'rule-based',
  };
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    isReady: () => true,
    parse: vi.fn().mockResolvedValue({ ...base, ...result }),
  };
}

function makeLlm(result?: Partial<ParsedCommand>, error?: Error): { parse: ReturnType<typeof vi.fn>; initialize: ReturnType<typeof vi.fn>; isReady: () => boolean } {
  const base: ParsedCommand = {
    intent: Intent.UNKNOWN,
    confidence: 0,
    entities: {},
    rawText: '',
    source: 'llm',
  };
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    isReady: () => true,
    parse: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({ ...base, ...result }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HybridStrategy', () => {
  // ── High confidence rule-based → LLM is NOT called ─────────────────────
  describe('high confidence rule-based result', () => {
    it('returns rule-based result without calling LLM', async () => {
      const ruleResult: Partial<ParsedCommand> = {
        intent: Intent.ARM_SYSTEM,
        confidence: 0.95, // above threshold 0.85
        source: 'rule-based',
      };
      const rb = makeRuleBased(ruleResult);
      const llm = makeLlm();

      const strategy = new HybridStrategy(rb as never, llm as never);
      await strategy.initialize();

      const cmd = await strategy.parse('arm the system');

      expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
      expect(cmd.source).toBe('rule-based');
      expect(llm.parse).not.toHaveBeenCalled();
    });

    it('returns rule-based result at the exact threshold boundary', async () => {
      const rb = makeRuleBased({ intent: Intent.DISARM_SYSTEM, confidence: 0.85, source: 'rule-based' });
      const llm = makeLlm();

      const strategy = new HybridStrategy(rb as never, llm as never);
      await strategy.initialize();

      const cmd = await strategy.parse('disarm');
      expect(cmd.source).toBe('rule-based');
      expect(llm.parse).not.toHaveBeenCalled();
    });
  });

  // ── Low confidence rule-based → LLM IS called and its result is returned ──
  describe('low confidence rule-based result', () => {
    it('escalates to LLM and returns LLM result', async () => {
      const rb = makeRuleBased({ intent: Intent.UNKNOWN, confidence: 0.4, source: 'rule-based' });
      const llmResult: Partial<ParsedCommand> = {
        intent: Intent.ADD_USER,
        confidence: 0.93,
        entities: { name: 'Alice', pin: '1234' },
        source: 'llm',
      };
      const llm = makeLlm(llmResult);

      const strategy = new HybridStrategy(rb as never, llm as never);
      await strategy.initialize();

      const cmd = await strategy.parse('add alice with code 1234');
      expect(cmd.intent).toBe(Intent.ADD_USER);
      expect(cmd.source).toBe('llm');
      expect(llm.parse).toHaveBeenCalledOnce();
    });

    it('sets source to "llm" on the returned result', async () => {
      const rb = makeRuleBased({ confidence: 0.3, source: 'rule-based' });
      const llm = makeLlm({ intent: Intent.LIST_USERS, confidence: 0.97, source: 'llm' });

      const strategy = new HybridStrategy(rb as never, llm as never);
      await strategy.initialize();

      const cmd = await strategy.parse('who can arm the system');
      expect(cmd.source).toBe('llm');
    });
  });

  // ── Low confidence + LLM failure → rule-based result with fallback source ──
  describe('LLM failure fallback', () => {
    it('returns rule-based result with source "rule-based-fallback" when LLM throws', async () => {
      const rb = makeRuleBased({ intent: Intent.ARM_SYSTEM, confidence: 0.5, source: 'rule-based' });
      const llm = makeLlm(undefined, new Error('Network timeout'));

      const strategy = new HybridStrategy(rb as never, llm as never);
      await strategy.initialize();

      const cmd = await strategy.parse('arm');
      expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
      expect(cmd.source).toBe('rule-based-fallback');
    });

    it('still returns a valid ParsedCommand even when LLM times out', async () => {
      const rb = makeRuleBased({ intent: Intent.UNKNOWN, confidence: 0.2, source: 'rule-based' });
      const llm = makeLlm(undefined, new Error('Request timed out'));

      const strategy = new HybridStrategy(rb as never, llm as never);
      await strategy.initialize();

      const cmd = await strategy.parse('something ambiguous');
      expect(cmd).toHaveProperty('intent');
      expect(cmd).toHaveProperty('confidence');
      expect(cmd).toHaveProperty('entities');
      expect(cmd.source).toBe('rule-based-fallback');
    });
  });

  // ── Temporal language escalation ──────────────────────────────────────────
  // Even when intent confidence is high, escalate to LLM if the text contains
  // temporal language but rule-based extracted no times.
  describe('temporal language escalation', () => {
    it('escalates when text has "first weekend of may" even though chrono-node extracted a wrong date', async () => {
      const rb = makeRuleBased({
        intent: Intent.ADD_USER,
        confidence: 1.0, // 100% — threshold check would never fire
        entities: {
          name: 'Zmarak',
          pin: '3354',
          // chrono-node returned SOMETHING — just the wrong weekend
          startTime: '2026-04-19T00:00:00.000Z',
          endTime: '2026-04-20T23:59:59.000Z',
        },
        source: 'rule-based',
      });
      const llm = makeLlm({
        intent: Intent.ADD_USER,
        confidence: 0.97,
        entities: {
          name: 'Zmarak',
          pin: '3354',
          startTime: '2026-05-02T00:00:00.000Z',
          endTime: '2026-05-03T23:59:59.999Z',
        },
        source: 'llm',
      });

      const strategy = new HybridStrategy(rb as never, llm as never);
      await strategy.initialize();

      const cmd = await strategy.parse('add Zmarak to the system with pin 3354 for the first weekend of may');
      expect(cmd.source).toBe('llm');
      expect(cmd.entities.startTime).toBeTruthy();
      expect(llm.parse).toHaveBeenCalledOnce();
    });

    it('does NOT escalate when temporal language is present and times were already extracted', async () => {
      const rb = makeRuleBased({
        intent: Intent.ADD_USER,
        confidence: 0.95,
        entities: {
          name: 'Sarah',
          pin: '5678',
          startTime: '2026-04-16T17:00:00.000Z',
          endTime: '2026-04-17T10:00:00.000Z',
        },
        source: 'rule-based',
      });
      const llm = makeLlm();

      const strategy = new HybridStrategy(rb as never, llm as never);
      await strategy.initialize();

      // chrono-node handled this fine — no escalation needed
      const cmd = await strategy.parse('add user Sarah pin 5678 from today 5pm to tomorrow 10am');
      expect(cmd.source).toBe('rule-based');
      expect(llm.parse).not.toHaveBeenCalled();
    });
  });

  // ── isReady ────────────────────────────────────────────────────────────────
  describe('isReady', () => {
    it('returns false before initialize()', () => {
      const rb = makeRuleBased({});
      const llm = makeLlm({});
      const strategy = new HybridStrategy(rb as never, llm as never);
      expect(strategy.isReady()).toBe(false);
    });

    it('returns true after initialize()', async () => {
      const rb = makeRuleBased({});
      const llm = makeLlm({});
      const strategy = new HybridStrategy(rb as never, llm as never);
      await strategy.initialize();
      expect(strategy.isReady()).toBe(true);
    });
  });
});
