import { config } from '../config.js';
import type { NlpStrategy } from './nlpStrategy.js';
import type { ParsedCommand } from '../types.js';
import { RuleBasedStrategy } from './ruleBasedStrategy.js';
import { LlmStrategy } from './llmStrategy.js';

export class HybridStrategy implements NlpStrategy {
  private ruleBased: RuleBasedStrategy;
  private llm: LlmStrategy;
  private ready = false;

  // Accepts injected strategies to make unit testing easy (avoids real API calls).
  constructor(ruleBased?: RuleBasedStrategy, llm?: LlmStrategy) {
    this.ruleBased = ruleBased ?? new RuleBasedStrategy();
    this.llm = llm ?? new LlmStrategy();
  }

  async initialize(): Promise<void> {
    await this.ruleBased.initialize();
    await this.llm.initialize();
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async parse(text: string): Promise<ParsedCommand> {
    const ruleResult = await this.ruleBased.parse(text);

    const shouldEscalate =
      // Low intent confidence
      ruleResult.confidence < config.CONFIDENCE_THRESHOLD ||
      // chrono-node returns a *wrong* date (not missing — wrong) for expressions
      // like "first weekend of May". Confidence is irrelevant here; detect the
      // pattern and always hand it to the LLM.
      this.hasComplexTemporalPattern(text) ||
      // Simpler temporal language where chrono-node produced nothing at all
      (this.hasTemporalLanguage(text) && !ruleResult.entities.startTime && !ruleResult.entities.endTime);

    if (!shouldEscalate) {
      return ruleResult;
    }

    try {
      return await this.llm.parse(text);
    } catch {
      return { ...ruleResult, source: 'rule-based-fallback' };
    }
  }

  /**
   * Patterns chrono-node actively mis-parses — it produces a date, just the
   * wrong one. Must escalate even when startTime/endTime are already set.
   *   "first weekend of may"  → chrono picks current weekend
   *   "last monday of june"   → chrono picks last monday
   *   "for/in may"            → chrono picks something in current week
   */
  private hasComplexTemporalPattern(text: string): boolean {
    return (
      /\b(first|second|third|fourth|last|1st|2nd|3rd|4th)\s+(weekend|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text) ||
      /\b(weekend|week)\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text) ||
      /\b(for|in|of)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text)
    );
  }

  /** Broad temporal language — only escalates when chrono-node extracted nothing. */
  private hasTemporalLanguage(text: string): boolean {
    return /\b(january|february|march|april|may|june|july|august|september|october|november|december|weekend|weekday|weekdays)\b/i.test(text);
  }
}
