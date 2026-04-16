import type { ParsedCommand } from '../types.js';

export interface NlpStrategy {
  initialize(): Promise<void>;
  parse(text: string): Promise<ParsedCommand>;
  isReady(): boolean;
}
