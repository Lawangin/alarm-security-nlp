import { AppError } from './middleware/errorHandler.js';

export const NLP_ERROR_INTENTS = [
  'UNSUPPORTED_SCHEDULE',
  'ADD_USER_MISSING_NAME',
  'ADD_USER_MISSING_PIN',
  'REMOVE_USER_MISSING_TARGET',
] as const;

export type NlpErrorIntent = (typeof NLP_ERROR_INTENTS)[number];

export function isNlpErrorIntent(s: string): s is NlpErrorIntent {
  return (NLP_ERROR_INTENTS as readonly string[]).includes(s);
}

// Regex for validating day-range patterns (used by the rule-based routing path)
const DAY_PART = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun';
const DAY_NAMES = new RegExp(`\\b(${DAY_PART})\\b`, 'gi');
const FROM_TO_RANGE = /\bfrom\s+\w.*?\bto\b/i;
const DAY_TO_DAY_RANGE = new RegExp(`\\b(${DAY_PART})\\s+to\\s+(${DAY_PART})\\b`, 'i');

// "every" uses a lookahead for whitespace/end-of-string to exclude "everyone", "everywhere", etc.
const ITERATIVE_WORDS = /\b(?:every(?=\s|$)|each|repeat(?:ing)?|recurring|weekly|daily)\b/i;
const PLURAL_DAYS = /\b(?:mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/i;

export function hasNonContiguousDaySeries(text: string): boolean {
  const days = text.match(DAY_NAMES) ?? [];
  if (days.length < 2) return false;
  if (FROM_TO_RANGE.test(text)) return false;
  if (DAY_TO_DAY_RANGE.test(text)) return false;
  return true;
}

export function hasIterativeSchedule(text: string): boolean {
  return ITERATIVE_WORDS.test(text) || PLURAL_DAYS.test(text);
}

export function throwUnsupportedSchedule(): never {
  throw new AppError(
    422,
    'UNSUPPORTED_SCHEDULE',
    'Non-contiguous day schedules (e.g. "Tuesday and Thursday") are not supported. ' +
      'Please use a date range instead — e.g. "add user Sarah with PIN 4321 from Monday to Friday".',
  );
}

export function throwMissingUserName(): never {
  throw new AppError(
    422,
    'MISSING_ENTITY',
    'Could not extract a user name from your command. Try: "add user Sarah with PIN 4321"',
  );
}

export function throwMissingPin(): never {
  throw new AppError(
    422,
    'MISSING_ENTITY',
    'Could not extract a PIN from your command. Try: "add user Sarah with PIN 4321"',
  );
}

export function throwMissingRemoveTarget(): never {
  throw new AppError(
    422,
    'MISSING_ENTITY',
    'Could not extract a user name or PIN from your command. Try: "remove user Sarah"',
  );
}

export function throwForErrorIntent(intent: NlpErrorIntent): never {
  switch (intent) {
    case 'UNSUPPORTED_SCHEDULE':
      return throwUnsupportedSchedule();
    case 'ADD_USER_MISSING_NAME':
      return throwMissingUserName();
    case 'ADD_USER_MISSING_PIN':
      return throwMissingPin();
    case 'REMOVE_USER_MISSING_TARGET':
      return throwMissingRemoveTarget();
  }
}
