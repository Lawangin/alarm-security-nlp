import Anthropic from '@anthropic-ai/sdk';
import { Intent, type ArmMode, type ParsedCommand } from '../types.js';
import type { NlpStrategy } from './nlpStrategy.js';
import { config } from '../config.js';

// Stable system prompt — cached on first request, reused on subsequent calls
const SYSTEM_PROMPT = `You are a security system command parser. Parse the user's natural language input and return ONLY a JSON object — no markdown, no explanation.

Intents:
- ARM_SYSTEM: arm/activate/enable/lock the security system
- DISARM_SYSTEM: disarm/deactivate/disable/turn off the security system
- ADD_USER: add/create/grant access to a user
- REMOVE_USER: remove/delete/revoke access for a user
- LIST_USERS: list/show/display all users with access
- UNKNOWN: intent cannot be determined

Entities (include only if present in the input):
- mode: arm mode — "away", "home", or "stay" (ARM_SYSTEM only)
- name: user's first name (ADD_USER / REMOVE_USER)
- pin: 4–6 digit PIN as a string (ADD_USER)
- startTime: ISO 8601 datetime for access start (ADD_USER with time window)
- endTime: ISO 8601 datetime for access end (ADD_USER with time window)
- permissions: array of strings, default ["arm", "disarm"]

Time window rules:
- Contiguous ranges like "from Monday to Friday" or "this weekend" → use startTime + endTime.
- Non-contiguous day lists like "Tuesday and Thursday" or "Monday, Wednesday, Friday" are NOT supported. Return UNKNOWN for these.

Examples:
Input: "arm the system in away mode"
{"intent":"ARM_SYSTEM","confidence":0.99,"entities":{"mode":"away","permissions":["arm","disarm"]}}

Input: "add user Sarah with pin 4321 from today 5pm to tomorrow 10am"
{"intent":"ADD_USER","confidence":0.97,"entities":{"name":"Sarah","pin":"4321","startTime":"<ISO>","endTime":"<ISO>","permissions":["arm","disarm"]}}

Input: "give Ted access from friday to monday with pin 3333"
{"intent":"ADD_USER","confidence":0.97,"entities":{"name":"Ted","pin":"3333","startTime":"<ISO friday>","endTime":"<ISO monday>","permissions":["arm","disarm"]}}

Input: "add user Sarah on Tuesday and Thursday with pin 4321"
{"intent":"UNKNOWN","confidence":0.0,"entities":{"permissions":["arm","disarm"]}}

Input: "remove user John"
{"intent":"REMOVE_USER","confidence":0.98,"entities":{"name":"John","permissions":["arm","disarm"]}}

Input: "who has access"
{"intent":"LIST_USERS","confidence":0.99,"entities":{"permissions":["arm","disarm"]}}

Input: "order pizza"
{"intent":"UNKNOWN","confidence":0.05,"entities":{"permissions":["arm","disarm"]}}

Return ONLY the JSON object, nothing else.`;

const LLM_TIMEOUT_MS = 5000;

export class LlmStrategy implements NlpStrategy {
  private client: Anthropic;
  private ready = false;

  constructor() {
    this.client = new Anthropic({ apiKey: config.LLM_API_KEY });
  }

  async initialize(): Promise<void> {
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async parse(text: string): Promise<ParsedCommand> {
    const response = await this.client.messages.create(
      {
        model: config.LLM_MODEL,
        max_tokens: 512,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            // Cache the stable system prompt — saves tokens on repeated calls
            cache_control: { type: 'ephemeral' },
          },
          {
            // Injected per-request so the LLM can resolve relative time expressions
            // ("tomorrow", "today at 5pm"). Not cached — changes every day.
            type: 'text',
            text: `Current date and time: ${new Date().toISOString()} (UTC)`,
          },
        ],
        messages: [{ role: 'user', content: text }],
      },
      { timeout: LLM_TIMEOUT_MS },
    );

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      throw new Error('Unexpected response type from LLM');
    }

    const parsed = this.parseJson(block.text);
    return { ...parsed, rawText: text, source: 'llm' };
  }

  private parseJson(raw: string): Omit<ParsedCommand, 'rawText' | 'source'> {
    // Strip markdown code fences if the model wraps its output
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let data: unknown;
    try {
      data = JSON.parse(cleaned);
    } catch {
      throw new Error(`LLM returned invalid JSON: ${raw}`);
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('LLM response is not an object');
    }

    const obj = data as Record<string, unknown>;
    return {
      intent: this.validateIntent(obj.intent),
      confidence: this.validateConfidence(obj.confidence),
      entities: this.validateEntities(obj.entities),
    };
  }

  private validateIntent(raw: unknown): Intent {
    if (typeof raw === 'string' && (Object.values(Intent) as string[]).includes(raw)) {
      return raw as Intent;
    }
    return Intent.UNKNOWN;
  }

  private validateConfidence(raw: unknown): number {
    if (typeof raw === 'number' && isFinite(raw)) {
      return Math.min(1, Math.max(0, raw));
    }
    return 0.9; // sensible default when the model omits it
  }

  private validateEntities(raw: unknown): ParsedCommand['entities'] {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const e = raw as Record<string, unknown>;
    return {
      mode: this.validateMode(e.mode),
      name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : undefined,
      pin: typeof e.pin === 'string' && e.pin.trim() ? e.pin.trim() : undefined,
      startTime: typeof e.startTime === 'string' ? e.startTime : undefined,
      endTime: typeof e.endTime === 'string' ? e.endTime : undefined,
      permissions: Array.isArray(e.permissions)
        ? (e.permissions as unknown[]).filter((p): p is string => typeof p === 'string')
        : ['arm', 'disarm'],
    };
  }

  private validateMode(raw: unknown): ArmMode | undefined {
    if (raw === 'away' || raw === 'home' || raw === 'stay') return raw;
    return undefined;
  }
}
