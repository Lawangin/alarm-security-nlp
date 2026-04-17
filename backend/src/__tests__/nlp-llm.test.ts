import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Intent } from '../types.js';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk before importing LlmStrategy
// ---------------------------------------------------------------------------
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('../config.js', () => ({
  config: {
    LLM_API_KEY: 'test-api-key',
    LLM_MODEL: 'claude-opus-4-6',
  },
}));

// Import after mocks are set up
const { LlmStrategy } = await import('../nlp/llmStrategy.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate a well-formed LLM response for a given JSON payload. */
function mockLlmResponse(json: object): void {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(json) }],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LlmStrategy', () => {
  let strategy: InstanceType<typeof LlmStrategy>;

  beforeEach(async () => {
    mockCreate.mockReset();
    strategy = new LlmStrategy();
    await strategy.initialize();
  });

  // ── isReady ────────────────────────────────────────────────────────────────
  describe('isReady', () => {
    it('returns false before initialize()', () => {
      const fresh = new LlmStrategy();
      expect(fresh.isReady()).toBe(false);
    });

    it('returns true after initialize()', () => {
      expect(strategy.isReady()).toBe(true);
    });
  });

  // ── Happy-path intent parsing ──────────────────────────────────────────────
  describe('parse — happy path', () => {
    it('returns ARM_SYSTEM intent', async () => {
      mockLlmResponse({
        intent: 'ARM_SYSTEM',
        confidence: 0.99,
        entities: { mode: 'away', permissions: ['arm', 'disarm'] },
      });

      const cmd = await strategy.parse('arm the system in away mode');
      expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
      expect(cmd.confidence).toBeCloseTo(0.99);
      expect(cmd.entities.mode).toBe('away');
      expect(cmd.source).toBe('llm');
      expect(cmd.rawText).toBe('arm the system in away mode');
    });

    it('returns DISARM_SYSTEM intent', async () => {
      mockLlmResponse({ intent: 'DISARM_SYSTEM', confidence: 0.98, entities: {} });

      const cmd = await strategy.parse('turn off the alarm');
      expect(cmd.intent).toBe(Intent.DISARM_SYSTEM);
      expect(cmd.source).toBe('llm');
    });

    it('returns ADD_USER with extracted entities', async () => {
      mockLlmResponse({
        intent: 'ADD_USER',
        confidence: 0.97,
        entities: {
          name: 'Sarah',
          pin: '4321',
          startTime: '2026-04-14T17:00:00.000Z',
          endTime: '2026-04-15T10:00:00.000Z',
          permissions: ['arm', 'disarm'],
        },
      });

      const cmd = await strategy.parse('add user Sarah with pin 4321 from today 5pm to tomorrow 10am');
      expect(cmd.intent).toBe(Intent.ADD_USER);
      expect(cmd.entities.name).toBe('Sarah');
      expect(cmd.entities.pin).toBe('4321');
      expect(cmd.entities.startTime).toBeTruthy();
      expect(cmd.entities.endTime).toBeTruthy();
    });

    it('returns REMOVE_USER with name', async () => {
      mockLlmResponse({ intent: 'REMOVE_USER', confidence: 0.98, entities: { name: 'John' } });

      const cmd = await strategy.parse('remove user John');
      expect(cmd.intent).toBe(Intent.REMOVE_USER);
      expect(cmd.entities.name).toBe('John');
    });

    it('returns LIST_USERS', async () => {
      mockLlmResponse({ intent: 'LIST_USERS', confidence: 0.99, entities: {} });

      const cmd = await strategy.parse('who has access');
      expect(cmd.intent).toBe(Intent.LIST_USERS);
    });

    it('returns UNKNOWN for unrecognised input', async () => {
      mockLlmResponse({ intent: 'UNKNOWN', confidence: 0.05, entities: {} });

      const cmd = await strategy.parse('order pizza');
      expect(cmd.intent).toBe(Intent.UNKNOWN);
    });
  });

  // ── Malformed JSON handling ────────────────────────────────────────────────
  describe('parse — malformed JSON response', () => {
    it('throws when the model returns plain text (not JSON)', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Sorry, I cannot help with that.' }],
      });

      await expect(strategy.parse('arm the system')).rejects.toThrow();
    });

    it('throws when the model returns broken JSON', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"intent":"ARM_SYSTEM","confidence":' }],
      });

      await expect(strategy.parse('arm the system')).rejects.toThrow();
    });

    it('strips markdown code fences before parsing', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '```json\n{"intent":"DISARM_SYSTEM","confidence":0.95,"entities":{}}\n```',
          },
        ],
      });

      const cmd = await strategy.parse('disarm');
      expect(cmd.intent).toBe(Intent.DISARM_SYSTEM);
    });
  });

  // ── Network / API failure ──────────────────────────────────────────────────
  describe('parse — network failure', () => {
    it('propagates the error so the hybrid strategy can catch it', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(strategy.parse('arm the system')).rejects.toThrow('Network timeout');
    });
  });

  // ── Entity validation ──────────────────────────────────────────────────────
  describe('entity validation', () => {
    it('defaults permissions to ["arm","disarm"] when omitted', async () => {
      mockLlmResponse({ intent: 'ARM_SYSTEM', confidence: 0.9, entities: {} });

      const cmd = await strategy.parse('arm');
      expect(cmd.entities.permissions).toEqual(['arm', 'disarm']);
    });

    it('clamps confidence to [0, 1]', async () => {
      mockLlmResponse({ intent: 'ARM_SYSTEM', confidence: 1.5, entities: {} });
      const high = await strategy.parse('arm');
      expect(high.confidence).toBeLessThanOrEqual(1);

      mockLlmResponse({ intent: 'ARM_SYSTEM', confidence: -0.3, entities: {} });
      const low = await strategy.parse('arm');
      expect(low.confidence).toBeGreaterThanOrEqual(0);
    });

    it('falls back to UNKNOWN for an unrecognised intent string', async () => {
      mockLlmResponse({ intent: 'EXPLODE_EVERYTHING', confidence: 0.99, entities: {} });

      const cmd = await strategy.parse('arm');
      expect(cmd.intent).toBe(Intent.UNKNOWN);
    });

    it('ignores invalid mode values', async () => {
      mockLlmResponse({ intent: 'ARM_SYSTEM', confidence: 0.9, entities: { mode: 'turbo' } });

      const cmd = await strategy.parse('arm the system in turbo mode');
      expect(cmd.entities.mode).toBeUndefined();
    });
  });
});
