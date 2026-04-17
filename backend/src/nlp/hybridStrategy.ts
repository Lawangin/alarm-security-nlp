import { config } from '../shared/config.js';
import type { NlpStrategy } from './nlpStrategy.js';
import { Intent } from '../shared/types.js';
import type { ParsedCommand } from '../shared/types.js';
import { RuleBasedStrategy } from './ruleBasedStrategy.js';
import { LlmStrategy } from './llmStrategy.js';

// Inputs longer than this are likely conversational — entity extraction via
// regex becomes unreliable, so we let the LLM handle the full sentence.
// Tunable: lower = more LLM calls, higher = more missed names/entities.
const COMPLEX_INPUT_LENGTH = 90;

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
      // Long/conversational input — regex entity extraction becomes unreliable
      text.length > COMPLEX_INPUT_LENGTH ||
      // Intent is clear but a required entity couldn't be extracted
      // (only for inputs long enough to reasonably contain one)
      this.isMissingRequiredEntities(ruleResult, text) ||
      // chrono-node returns a *wrong* date (not missing — wrong) for expressions
      // like "first weekend of May". Confidence is irrelevant here; detect the
      // pattern and always hand it to the LLM.
      this.hasComplexTemporalPattern(text) ||
      // Simpler temporal language where chrono-node produced nothing at all
      (this.hasTemporalLanguage(text) && !ruleResult.entities.startTime && !ruleResult.entities.endTime) ||
      // Relational phrases ("my brother Ahmed") cause the rule-based extractor to
      // grab the relation word instead of the actual name
      this.hasRelationalLanguage(text);

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
   * Returns true when the intent requires entities that are absent, suggesting
   * the sentence was too conversational for regex to extract them reliably.
   * Guarded by a minimum length to avoid escalating genuinely incomplete
   * short commands like "add user" (those should get a clarification prompt).
   */
  private isMissingRequiredEntities(result: ParsedCommand, text: string): boolean {
    if (text.length < 30) return false;
    if (result.intent === Intent.ADD_USER) {
      return !result.entities.name || !result.entities.pin;
    }
    if (result.intent === Intent.REMOVE_USER) {
      return !result.entities.name && !result.entities.pin;
    }
    return false;
  }

  /**
   * Patterns chrono-node actively mis-parses — it produces a date, just the
   * wrong one. Must escalate even when startTime/endTime are already set.
   *   "first weekend of may"  → chrono picks current weekend
   *   "last monday of june"   → chrono picks last monday
   *   "for/in may"            → chrono picks something in current week
   */
  private hasComplexTemporalPattern(text: string): boolean {
    const day = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun';
    return (
      new RegExp(`\\b(first|second|third|fourth|last|1st|2nd|3rd|4th)\\s+(weekend|week|${day})\\b`, 'i').test(text) ||
      /\b(weekend|week)\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text) ||
      /\b(for|in|of)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text)
    );
  }

  /** Broad temporal language — only escalates when chrono-node extracted nothing. */
  private hasTemporalLanguage(text: string): boolean {
    return /\b(january|february|march|april|may|june|july|august|september|october|november|december|weekend|weekday|weekdays)\b/i.test(text);
  }

  /**
   * Relational/possessive phrases like "my brother Ahmed" or "my friend Sarah"
   * confuse the rule-based name extractor — it grabs the possessive ("my") or
   * the relation word ("brother") instead of the actual name. The LLM handles
   * these naturally.
   */
  private hasRelationalLanguage(text: string): boolean {
    return /\bmy\s+(brother|sister|husband|wife|partner|friend|colleague|coworker|co-worker|roommate|neighbor|neighbour|son|daughter|dad|mom|father|mother|uncle|aunt|cousin|guest|cleaner|nanny|babysitter|contractor|tenant)\b/i.test(text);
  }
}
