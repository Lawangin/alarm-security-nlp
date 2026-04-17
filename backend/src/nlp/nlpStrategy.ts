import type { ParsedCommand } from '../shared/types.js';

export interface NlpStrategy {
  initialize(): Promise<void>;
  parse(text: string): Promise<ParsedCommand>;
  isReady(): boolean;
}
