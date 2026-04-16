import { config } from '../config.js';
import type { NlpStrategy } from './nlpStrategy.js';
import { RuleBasedStrategy } from './ruleBasedStrategy.js';

export function createNlpStrategy(): NlpStrategy {
  switch (config.NLP_STRATEGY) {
    case 'llm':
    case 'hybrid':
      // Phase 9: LLM and hybrid strategies — fall through to rule-based for now
      return new RuleBasedStrategy();
    case 'rule-based':
    default:
      return new RuleBasedStrategy();
  }
}
