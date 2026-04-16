import { describe, it, expect, beforeAll, vi } from 'vitest';
import { RuleBasedStrategy } from '../nlp/ruleBasedStrategy.js';
import { Intent } from '../types.js';

// Fix "now" for deterministic chrono-node time extraction.
// Tuesday 2026-04-14 12:00:00 UTC
const FIXED_NOW = new Date('2026-04-14T12:00:00.000Z');

let strategy: RuleBasedStrategy;

beforeAll(async () => {
  vi.useFakeTimers({ now: FIXED_NOW });
  strategy = new RuleBasedStrategy();
  await strategy.initialize();
  // Restore timers after training so Date is accurate during parse calls
  vi.useRealTimers();
}, 30_000); // training can take several seconds

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const parse = (text: string) => strategy.parse(text);

// ---------------------------------------------------------------------------
// ARM_SYSTEM
// ---------------------------------------------------------------------------
describe('ARM_SYSTEM intent', () => {
  it('"arm the system"', async () => {
    const cmd = await parse('arm the system');
    expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
    expect(cmd.confidence).toBeGreaterThan(0.7);
    expect(cmd.source).toBe('rule-based');
  });

  it('"activate the alarm"', async () => {
    const cmd = await parse('activate the alarm');
    expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
  });

  it('"lock it down"', async () => {
    const cmd = await parse('lock it down');
    expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
  });

  it('extracts mode "away"', async () => {
    const cmd = await parse('arm the system in away mode');
    expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
    expect(cmd.entities.mode).toBe('away');
  });

  it('extracts mode "home"', async () => {
    const cmd = await parse('arm home');
    expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
    expect(cmd.entities.mode).toBe('home');
  });

  it('extracts mode "stay" from "set alarm to stay mode"', async () => {
    const cmd = await parse('set alarm to stay mode');
    expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
    expect(cmd.entities.mode).toBe('stay');
  });

  it('handles mixed case', async () => {
    const cmd = await parse('ARM THE SYSTEM');
    expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
  });

  it('handles extra whitespace', async () => {
    const cmd = await parse('  arm   the   system  ');
    expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
  });

  it('handles polite phrasing', async () => {
    const cmd = await parse('please arm the system');
    expect(cmd.intent).toBe(Intent.ARM_SYSTEM);
  });
});

// ---------------------------------------------------------------------------
// DISARM_SYSTEM
// ---------------------------------------------------------------------------
describe('DISARM_SYSTEM intent', () => {
  it('"disarm"', async () => {
    const cmd = await parse('disarm');
    expect(cmd.intent).toBe(Intent.DISARM_SYSTEM);
  });

  it('"turn off the alarm"', async () => {
    const cmd = await parse('turn off the alarm');
    expect(cmd.intent).toBe(Intent.DISARM_SYSTEM);
  });

  it('"deactivate"', async () => {
    const cmd = await parse('deactivate');
    expect(cmd.intent).toBe(Intent.DISARM_SYSTEM);
  });

  it('"sesame open"', async () => {
    const cmd = await parse('sesame open');
    expect(cmd.intent).toBe(Intent.DISARM_SYSTEM);
  });
});

// ---------------------------------------------------------------------------
// ADD_USER
// ---------------------------------------------------------------------------
describe('ADD_USER intent', () => {
  it('"add user John with pin 4321" — extracts name and PIN', async () => {
    const cmd = await parse('add user John with pin 4321');
    expect(cmd.intent).toBe(Intent.ADD_USER);
    expect(cmd.entities.name).toBe('John');
    expect(cmd.entities.pin).toBe('4321');
  });

  it('"create user Alice" — extracts name', async () => {
    const cmd = await parse('create user Alice');
    expect(cmd.intent).toBe(Intent.ADD_USER);
    expect(cmd.entities.name).toBe('Alice');
  });

  it('"add a temporary user" — classified as ADD_USER', async () => {
    const cmd = await parse('add a temporary user');
    expect(cmd.intent).toBe(Intent.ADD_USER);
  });

  it('"give access to Bob" — extracts name', async () => {
    const cmd = await parse('give access to Bob');
    expect(cmd.intent).toBe(Intent.ADD_USER);
    expect(cmd.entities.name).toBe('Bob');
  });

  it('extracts chrono-node times from "add temporary user Sarah pin 5678 from today 5pm to tomorrow 10am"', async () => {
    vi.useFakeTimers({ now: FIXED_NOW });
    const cmd = await parse('add temporary user Sarah pin 5678 from today 5pm to tomorrow 10am');
    vi.useRealTimers();
    expect(cmd.intent).toBe(Intent.ADD_USER);
    expect(cmd.entities.name).toBe('Sarah');
    expect(cmd.entities.pin).toBe('5678');
    expect(cmd.entities.startTime).toBeTruthy();
    expect(cmd.entities.endTime).toBeTruthy();
    // endTime should be after startTime
    expect(new Date(cmd.entities.endTime!).getTime()).toBeGreaterThan(
      new Date(cmd.entities.startTime!).getTime(),
    );
  });

  it('includes default permissions ["arm", "disarm"]', async () => {
    const cmd = await parse('add user John with pin 4321');
    expect(cmd.entities.permissions).toEqual(['arm', 'disarm']);
  });
});

// ---------------------------------------------------------------------------
// REMOVE_USER
// ---------------------------------------------------------------------------
describe('REMOVE_USER intent', () => {
  it('"remove user John" — extracts name', async () => {
    const cmd = await parse('remove user John');
    expect(cmd.intent).toBe(Intent.REMOVE_USER);
    expect(cmd.entities.name).toBe('John');
  });

  it('"delete user Alice"', async () => {
    const cmd = await parse('delete user Alice');
    expect(cmd.intent).toBe(Intent.REMOVE_USER);
    expect(cmd.entities.name).toBe('Alice');
  });

  it('"revoke access"', async () => {
    const cmd = await parse('revoke access');
    expect(cmd.intent).toBe(Intent.REMOVE_USER);
  });
});

// ---------------------------------------------------------------------------
// LIST_USERS
// ---------------------------------------------------------------------------
describe('LIST_USERS intent', () => {
  it('"show me all users"', async () => {
    const cmd = await parse('show me all users');
    expect(cmd.intent).toBe(Intent.LIST_USERS);
  });

  it('"list users"', async () => {
    const cmd = await parse('list users');
    expect(cmd.intent).toBe(Intent.LIST_USERS);
  });

  it('"who has access"', async () => {
    const cmd = await parse('who has access');
    expect(cmd.intent).toBe(Intent.LIST_USERS);
  });
});

// ---------------------------------------------------------------------------
// UNKNOWN intent
// ---------------------------------------------------------------------------
describe('UNKNOWN intent', () => {
  it('"what\'s the weather"', async () => {
    const cmd = await parse("what's the weather");
    expect(cmd.intent).toBe(Intent.UNKNOWN);
  });

  it('"order pizza"', async () => {
    const cmd = await parse('order pizza');
    expect(cmd.intent).toBe(Intent.UNKNOWN);
  });

  it('gibberish "xkcd quux zorp"', async () => {
    const cmd = await parse('xkcd quux zorp');
    expect(cmd.intent).toBe(Intent.UNKNOWN);
  });
});

// ---------------------------------------------------------------------------
// isReady
// ---------------------------------------------------------------------------
describe('isReady', () => {
  it('returns true after initialization', () => {
    expect(strategy.isReady()).toBe(true);
  });

  it('returns false before initialization', () => {
    const fresh = new RuleBasedStrategy();
    expect(fresh.isReady()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ParsedCommand shape
// ---------------------------------------------------------------------------
describe('ParsedCommand shape', () => {
  it('always includes rawText matching the input', async () => {
    const text = 'arm the system';
    const cmd = await parse(text);
    expect(cmd.rawText).toBe(text);
  });

  it('always sets source to "rule-based"', async () => {
    const cmd = await parse('disarm');
    expect(cmd.source).toBe('rule-based');
  });

  it('confidence is a number between 0 and 1', async () => {
    const cmd = await parse('list users');
    expect(cmd.confidence).toBeGreaterThanOrEqual(0);
    expect(cmd.confidence).toBeLessThanOrEqual(1);
  });
});
