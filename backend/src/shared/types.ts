export enum Intent {
  ARM_SYSTEM = 'ARM_SYSTEM',
  DISARM_SYSTEM = 'DISARM_SYSTEM',
  ADD_USER = 'ADD_USER',
  REMOVE_USER = 'REMOVE_USER',
  LIST_USERS = 'LIST_USERS',
  UNKNOWN = 'UNKNOWN',
}

export type ArmMode = 'away' | 'home' | 'stay';

export interface ParsedCommand {
  intent: Intent;
  confidence: number;
  entities: {
    mode?: ArmMode;
    name?: string;
    pin?: string;
    startTime?: string;
    endTime?: string;
    permissions?: string[];
  };
  rawText: string;
  source: 'rule-based' | 'llm' | 'rule-based-fallback';
}
