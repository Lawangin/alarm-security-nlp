import { createRequire } from 'node:module';
import * as chrono from 'chrono-node';
import { Intent, type ArmMode, type ParsedCommand } from '../types.js';
import type { NlpStrategy } from './nlpStrategy.js';

// CJS interop for nlp.js (no ESM exports)
const require = createRequire(import.meta.url);
const { Nlp } = require('@nlpjs/nlp') as { Nlp: new (opts: Record<string, unknown>) => NlpInstance };
const { LangEn } = require('@nlpjs/lang-en') as { LangEn: unknown };

interface NlpResult {
  intent: string;
  score: number;
}

interface NlpInstance {
  use(plugin: unknown): void;
  addDocument(lang: string, text: string, intent: string): void;
  train(): Promise<void>;
  process(lang: string, text: string): Promise<NlpResult>;
}

// Minimum confidence to accept a classified intent; below this → UNKNOWN
const INTENT_CONFIDENCE_THRESHOLD = 0.7;

export class RuleBasedStrategy implements NlpStrategy {
  private nlp: NlpInstance;
  private ready = false;

  constructor() {
    this.nlp = new Nlp({ languages: ['en'], nlu: { log: false }, log: false, autoSave: false });
    this.nlp.use(LangEn);
    this.addUtterances();
  }

  private addUtterances(): void {
    const n = this.nlp;

    // ARM_SYSTEM
    n.addDocument('en', 'arm the system', Intent.ARM_SYSTEM);
    n.addDocument('en', 'activate the alarm', Intent.ARM_SYSTEM);
    n.addDocument('en', 'lock it down', Intent.ARM_SYSTEM);
    n.addDocument('en', 'enable security', Intent.ARM_SYSTEM);
    n.addDocument('en', 'set alarm to stay mode', Intent.ARM_SYSTEM);
    n.addDocument('en', 'arm it', Intent.ARM_SYSTEM);
    n.addDocument('en', 'turn on the alarm', Intent.ARM_SYSTEM);
    n.addDocument('en', 'arm away', Intent.ARM_SYSTEM);
    n.addDocument('en', 'arm home', Intent.ARM_SYSTEM);
    n.addDocument('en', 'arm stay', Intent.ARM_SYSTEM);
    n.addDocument('en', 'set the alarm', Intent.ARM_SYSTEM);
    n.addDocument('en', 'activate security system', Intent.ARM_SYSTEM);

    // DISARM_SYSTEM
    n.addDocument('en', 'disarm the system', Intent.DISARM_SYSTEM);
    n.addDocument('en', 'turn off the alarm', Intent.DISARM_SYSTEM);
    n.addDocument('en', 'deactivate', Intent.DISARM_SYSTEM);
    n.addDocument('en', 'unlock', Intent.DISARM_SYSTEM);
    n.addDocument('en', 'disarm', Intent.DISARM_SYSTEM);
    n.addDocument('en', 'sesame open', Intent.DISARM_SYSTEM);
    n.addDocument('en', 'turn off security', Intent.DISARM_SYSTEM);
    n.addDocument('en', 'deactivate the alarm', Intent.DISARM_SYSTEM);
    n.addDocument('en', 'disable the alarm', Intent.DISARM_SYSTEM);
    n.addDocument('en', 'disable security', Intent.DISARM_SYSTEM);

    // ADD_USER
    n.addDocument('en', 'add user', Intent.ADD_USER);
    n.addDocument('en', 'create user', Intent.ADD_USER);
    n.addDocument('en', 'add a temporary user', Intent.ADD_USER);
    n.addDocument('en', 'give access to', Intent.ADD_USER);
    n.addDocument('en', 'make sure she can arm and disarm', Intent.ADD_USER);
    n.addDocument('en', 'add a new user', Intent.ADD_USER);
    n.addDocument('en', 'create a new user', Intent.ADD_USER);
    n.addDocument('en', 'grant access to', Intent.ADD_USER);
    n.addDocument('en', 'add temp user', Intent.ADD_USER);

    // REMOVE_USER
    n.addDocument('en', 'remove user', Intent.REMOVE_USER);
    n.addDocument('en', 'delete user', Intent.REMOVE_USER);
    n.addDocument('en', 'revoke access', Intent.REMOVE_USER);
    n.addDocument('en', 'remove access for', Intent.REMOVE_USER);
    n.addDocument('en', 'delete access for', Intent.REMOVE_USER);
    n.addDocument('en', 'remove john from the system', Intent.REMOVE_USER);
    n.addDocument('en', 'delete sarah from the system', Intent.REMOVE_USER);
    n.addDocument('en', 'take away access from user', Intent.REMOVE_USER);

    // LIST_USERS
    n.addDocument('en', 'show me all users', Intent.LIST_USERS);
    n.addDocument('en', 'list users', Intent.LIST_USERS);
    n.addDocument('en', 'who has access', Intent.LIST_USERS);
    n.addDocument('en', 'list all users', Intent.LIST_USERS);
    n.addDocument('en', 'show users', Intent.LIST_USERS);
    n.addDocument('en', 'who can arm the system', Intent.LIST_USERS);
    n.addDocument('en', 'show all users', Intent.LIST_USERS);
  }

  async initialize(): Promise<void> {
    await this.nlp.train();
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async parse(text: string): Promise<ParsedCommand> {
    const result = await this.nlp.process('en', text);

    const intent =
      result.score >= INTENT_CONFIDENCE_THRESHOLD
        ? this.mapIntent(result.intent)
        : Intent.UNKNOWN;

    const confidence = result.score ?? 0;

    return {
      intent,
      confidence,
      entities: {
        mode: this.extractMode(text),
        name: this.extractName(text),
        pin: this.extractPin(text),
        permissions: ['arm', 'disarm'],
        ...this.extractTimes(text),
      },
      rawText: text,
      source: 'rule-based',
    };
  }

  private mapIntent(nlpIntent: string): Intent {
    switch (nlpIntent) {
      case 'ARM_SYSTEM':
        return Intent.ARM_SYSTEM;
      case 'DISARM_SYSTEM':
        return Intent.DISARM_SYSTEM;
      case 'ADD_USER':
        return Intent.ADD_USER;
      case 'REMOVE_USER':
        return Intent.REMOVE_USER;
      case 'LIST_USERS':
        return Intent.LIST_USERS;
      default:
        return Intent.UNKNOWN;
    }
  }

  private extractMode(text: string): ArmMode | undefined {
    const lower = text.toLowerCase();
    if (/\baway\b/.test(lower)) return 'away';
    if (/\bhome\b/.test(lower)) return 'home';
    if (/\bstay\b/.test(lower)) return 'stay';
    return undefined;
  }

  private extractName(text: string): string | undefined {
    const stopWords = new Set([
      'with', 'pin', 'from', 'to', 'at', 'the', 'a', 'an', 'temp', 'temporary',
      'new', 'please', 'user', 'access', 'system',
    ]);

    const tryExtract = (match: RegExpMatchArray | null): string | undefined => {
      if (!match) return undefined;
      const candidate = match[1];
      return stopWords.has(candidate.toLowerCase()) ? undefined : candidate;
    };

    // "user [Name]" — e.g. "add user John", "remove user Alice"
    const userMatch = text.match(/\buser\s+([A-Za-z][a-zA-Z]*)\b/i);
    const fromUser = tryExtract(userMatch);
    if (fromUser) return fromUser;

    // "access to/for [Name]" — e.g. "give access to Alice"
    const accessMatch = text.match(/\b(?:access\s+to|access\s+for|for)\s+([A-Za-z][a-zA-Z]*)\b/i);
    const fromAccess = tryExtract(accessMatch);
    if (fromAccess) return fromAccess;

    // "remove/delete [Name]" — e.g. "remove Alice from the system", "delete Bob"
    const removeMatch = text.match(/\b(?:remove|delete)\s+([A-Za-z][a-zA-Z]*)\b/i);
    const fromRemove = tryExtract(removeMatch);
    if (fromRemove) return fromRemove;

    return undefined;
  }

  private extractPin(text: string): string | undefined {
    // Explicit "pin XXXX" or "pin: XXXX" takes precedence
    const pinMatch = text.match(/\bpin\s*:?\s*(\d{4,6})\b/i);
    if (pinMatch) return pinMatch[1];

    // Fall back: any standalone sequence of digits (validation is the service's job)
    const genericMatch = text.match(/\b(\d+)\b/);
    if (genericMatch) return genericMatch[1];

    return undefined;
  }

  private extractTimes(text: string): { startTime?: string; endTime?: string } {
    // "weekdays" is not recognized by chrono-node — detect it first
    if (/\bweekdays?\b/i.test(text) && !/\bweekend\b/i.test(text)) {
      return this.weekdayRange();
    }

    const parsed = chrono.parse(text);
    if (parsed.length === 0) return {};

    const first = parsed[0];
    const startDate = first.start?.date();
    if (!startDate) return {};

    // chrono-node already found a range (e.g. "from 5pm to Sunday 10am")
    if (first.end) {
      return {
        startTime: startDate.toISOString(),
        endTime: first.end.date().toISOString(),
      };
    }

    // "weekend" — chrono-node returns Saturday as start, no end
    if (/\bweekend\b/i.test(text)) {
      return this.weekendRange(startDate);
    }

    // "day after tomorrow" must be checked before "tomorrow"
    if (/\bday after tomorrow\b/i.test(text)) {
      return this.fullDayRange(startDate);
    }

    if (/\btomorrow\b/i.test(text)) {
      return this.fullDayRange(startDate);
    }

    if (/\btoday\b/i.test(text)) {
      return this.fullDayRange(startDate);
    }

    return { startTime: startDate.toISOString() };
  }

  /** Saturday 00:00 → Sunday 23:59:59 */
  private weekendRange(saturday: Date): { startTime: string; endTime: string } {
    const start = new Date(saturday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1); // Sunday
    end.setHours(23, 59, 59, 999);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  /** Midnight → 23:59:59 on the given date */
  private fullDayRange(date: Date): { startTime: string; endTime: string } {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  /**
   * Monday 00:00 → Friday 23:59:59.
   * Uses the current week if today is Mon–Fri, next week if today is Sat/Sun.
   */
  private weekdayRange(): { startTime: string; endTime: string } {
    const now = new Date();
    const day = now.getDay(); // 0=Sun 1=Mon … 6=Sat

    const monday = new Date(now);
    if (day >= 1 && day <= 5) {
      monday.setDate(now.getDate() - (day - 1)); // back to this week's Monday
    } else {
      monday.setDate(now.getDate() + (day === 0 ? 1 : 2)); // Sat→+2, Sun→+1
    }
    monday.setHours(0, 0, 0, 0);

    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);

    return { startTime: monday.toISOString(), endTime: friday.toISOString() };
  }
}
