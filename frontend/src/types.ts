export interface SystemState {
  armed: boolean;
  mode: 'away' | 'home' | 'stay' | null;
}

export interface Interpretation {
  intent: string;
  confidence: number;
  entities: Record<string, unknown>;
  source: 'rule-based' | 'llm' | 'rule-based-fallback';
}

export interface NlData {
  input: string;
  interpretation: Interpretation;
  apiCall: string;
  result: Record<string, unknown>;
}

export interface NlResponse {
  success: true;
  data: NlData;
  correlationId: string;
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    errorCode: string;
  };
  correlationId: string;
}

export interface HealthzData {
  status: string;
  uptime: number;
  version: string;
  nlpStrategy: string;
  nlpReady: boolean;
  llmAvailable: boolean;
  systemState: SystemState;
  userCount: number;
}

export interface HistoryEntry {
  id: string;
  text: string;
  response: NlResponse | null;
  error: string | null;
  timestamp: Date;
}
