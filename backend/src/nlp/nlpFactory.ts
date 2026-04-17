import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import type { NlpStrategy } from './nlpStrategy.js';
import { RuleBasedStrategy } from './ruleBasedStrategy.js';
import { LlmStrategy } from './llmStrategy.js';
import { HybridStrategy } from './hybridStrategy.js';

export function createNlpStrategy(strategyOverride?: string): NlpStrategy {
  switch (strategyOverride ?? config.NLP_STRATEGY) {
    case 'llm': {
      if (!config.LLM_API_KEY) {
        logger.warn('NLP_STRATEGY=llm but LLM_API_KEY is not set — falling back to rule-based');
        return new RuleBasedStrategy();
      }
      return new LlmStrategy();
    }
    case 'hybrid': {
      if (!config.LLM_API_KEY) {
        logger.warn('NLP_STRATEGY=hybrid but LLM_API_KEY is not set — falling back to rule-based');
        return new RuleBasedStrategy();
      }
      return new HybridStrategy();
    }
    case 'rule-based':
    default:
      return new RuleBasedStrategy();
  }
}
