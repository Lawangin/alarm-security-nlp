import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app, setNlpStrategy } from '../app.js';
import { reset } from '../services/securityService.js';
import { Intent } from '../types.js';
import type { NlpStrategy } from '../nlp/nlpStrategy.js';
import type { ParsedCommand } from '../types.js';

// ---------------------------------------------------------------------------
// Mock NLP strategy — keeps tests fast and deterministic
// ---------------------------------------------------------------------------
const mockParse = vi.fn<(text: string) => Promise<ParsedCommand>>();

const mockStrategy: NlpStrategy = {
  parse: mockParse,
  isReady: () => true,
  initialize: async () => {},
};

const makeCmd = (overrides: Partial<ParsedCommand>): ParsedCommand => ({
  intent: Intent.UNKNOWN,
  confidence: 0.95,
  entities: {},
  rawText: 'test',
  source: 'rule-based',
  ...overrides,
});

beforeAll(() => {
  setNlpStrategy(mockStrategy);
});

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------
describe('Response shape', () => {
  it('returns the full envelope on success', async () => {
    mockParse.mockResolvedValueOnce(
      makeCmd({ intent: Intent.LIST_USERS, rawText: 'list users' }),
    );
    const res = await request(app).post('/nl/execute').send({ text: 'list users' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      input: 'list users',
      interpretation: {
        intent: Intent.LIST_USERS,
        confidence: expect.any(Number),
        source: 'rule-based',
      },
      apiCall: expect.any(String),
      result: expect.anything(),
    });
    expect(res.body.correlationId).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ARM_SYSTEM
// ---------------------------------------------------------------------------
describe('ARM_SYSTEM via /nl/execute', () => {
  it('arms with default mode when no mode entity present', async () => {
    mockParse.mockResolvedValueOnce(
      makeCmd({ intent: Intent.ARM_SYSTEM, rawText: 'arm the system', entities: {} }),
    );
    const res = await request(app).post('/nl/execute').send({ text: 'arm the system' });
    expect(res.status).toBe(200);
    expect(res.body.data.result).toEqual({ armed: true, mode: 'away' });
    expect(res.body.data.apiCall).toBe('POST /api/arm-system');
  });

  it('arms with extracted mode entity', async () => {
    mockParse.mockResolvedValueOnce(
      makeCmd({ intent: Intent.ARM_SYSTEM, entities: { mode: 'home' } }),
    );
    const res = await request(app).post('/nl/execute').send({ text: 'arm home' });
    expect(res.body.data.result.mode).toBe('home');
  });

  it('returns 409 when system is already armed', async () => {
    mockParse.mockResolvedValue(
      makeCmd({ intent: Intent.ARM_SYSTEM, entities: {} }),
    );
    await request(app).post('/nl/execute').send({ text: 'arm' });
    const res = await request(app).post('/nl/execute').send({ text: 'arm again' });
    expect(res.status).toBe(409);
    expect(res.body.error.errorCode).toBe('ALREADY_ARMED');
  });
});

// ---------------------------------------------------------------------------
// DISARM_SYSTEM
// ---------------------------------------------------------------------------
describe('DISARM_SYSTEM via /nl/execute', () => {
  it('disarms the system', async () => {
    // arm first
    mockParse.mockResolvedValueOnce(makeCmd({ intent: Intent.ARM_SYSTEM, entities: {} }));
    await request(app).post('/nl/execute').send({ text: 'arm' });

    mockParse.mockResolvedValueOnce(makeCmd({ intent: Intent.DISARM_SYSTEM, rawText: 'disarm' }));
    const res = await request(app).post('/nl/execute').send({ text: 'disarm' });
    expect(res.status).toBe(200);
    expect(res.body.data.result).toEqual({ armed: false, mode: null });
    expect(res.body.data.apiCall).toBe('POST /api/disarm-system');
  });
});

// ---------------------------------------------------------------------------
// ADD_USER
// ---------------------------------------------------------------------------
describe('ADD_USER via /nl/execute', () => {
  it('adds a user when name and PIN are extracted', async () => {
    mockParse.mockResolvedValueOnce(
      makeCmd({
        intent: Intent.ADD_USER,
        entities: { name: 'Sarah', pin: '4321', permissions: ['arm', 'disarm'] },
      }),
    );
    const res = await request(app)
      .post('/nl/execute')
      .send({ text: 'add user Sarah with PIN 4321' });
    expect(res.status).toBe(200);
    expect(res.body.data.result.name).toBe('Sarah');
    expect(res.body.data.apiCall).toBe('POST /api/add-user');
  });

  it('returns 422 MISSING_ENTITY when name is missing', async () => {
    mockParse.mockResolvedValueOnce(
      makeCmd({ intent: Intent.ADD_USER, entities: { pin: '4321' } }),
    );
    const res = await request(app).post('/nl/execute').send({ text: 'add user with pin 4321' });
    expect(res.status).toBe(422);
    expect(res.body.error.errorCode).toBe('MISSING_ENTITY');
  });

  it('returns 422 MISSING_ENTITY when PIN is missing', async () => {
    mockParse.mockResolvedValueOnce(
      makeCmd({ intent: Intent.ADD_USER, entities: { name: 'Sarah' } }),
    );
    const res = await request(app).post('/nl/execute').send({ text: 'add user Sarah' });
    expect(res.status).toBe(422);
    expect(res.body.error.errorCode).toBe('MISSING_ENTITY');
  });
});

// ---------------------------------------------------------------------------
// REMOVE_USER
// ---------------------------------------------------------------------------
describe('REMOVE_USER via /nl/execute', () => {
  beforeEach(async () => {
    // seed a user directly via the API route
    await request(app).post('/api/add-user').send({ name: 'Bob', pin: '5678' });
  });

  it('removes a user by name', async () => {
    mockParse.mockResolvedValueOnce(
      makeCmd({ intent: Intent.REMOVE_USER, entities: { name: 'Bob' } }),
    );
    const res = await request(app).post('/nl/execute').send({ text: 'remove user Bob' });
    expect(res.status).toBe(200);
    expect(res.body.data.result.removed).toBe(true);
    expect(res.body.data.apiCall).toBe('POST /api/remove-user');
  });

  it('returns 422 when neither name nor pin extracted', async () => {
    mockParse.mockResolvedValueOnce(
      makeCmd({ intent: Intent.REMOVE_USER, entities: {} }),
    );
    const res = await request(app).post('/nl/execute').send({ text: 'remove user' });
    expect(res.status).toBe(422);
    expect(res.body.error.errorCode).toBe('MISSING_ENTITY');
  });
});

// ---------------------------------------------------------------------------
// LIST_USERS
// ---------------------------------------------------------------------------
describe('LIST_USERS via /nl/execute', () => {
  it('returns the user list', async () => {
    mockParse.mockResolvedValueOnce(makeCmd({ intent: Intent.LIST_USERS }));
    const res = await request(app).post('/nl/execute').send({ text: 'who has access' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.result.users)).toBe(true);
    expect(res.body.data.apiCall).toBe('GET /api/list-users');
  });
});

// ---------------------------------------------------------------------------
// UNKNOWN intent
// ---------------------------------------------------------------------------
describe('UNKNOWN intent via /nl/execute', () => {
  it('returns success with helpful message and examples', async () => {
    mockParse.mockResolvedValueOnce(makeCmd({ intent: Intent.UNKNOWN, rawText: "order pizza" }));
    const res = await request(app).post('/nl/execute').send({ text: 'order pizza' });
    expect(res.status).toBe(200);
    expect(res.body.data.apiCall).toBe('none');
    expect(res.body.data.result.message).toMatch(/not understood/i);
    expect(Array.isArray(res.body.data.result.examples)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
describe('Input validation on /nl/execute', () => {
  it('returns 400 EMPTY_INPUT for empty text', async () => {
    const res = await request(app).post('/nl/execute').send({ text: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.errorCode).toBe('EMPTY_INPUT');
  });

  it('returns 400 EMPTY_INPUT when text field is missing', async () => {
    const res = await request(app).post('/nl/execute').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.errorCode).toBe('EMPTY_INPUT');
  });

  it('returns 400 INPUT_TOO_LONG for text over 500 characters', async () => {
    const res = await request(app)
      .post('/nl/execute')
      .send({ text: 'a'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error.errorCode).toBe('INPUT_TOO_LONG');
  });

  it('strips HTML before passing to NLP strategy', async () => {
    let capturedText = '';
    mockParse.mockImplementationOnce(async (text) => {
      capturedText = text;
      return makeCmd({ intent: Intent.LIST_USERS, rawText: text });
    });
    await request(app).post('/nl/execute').send({ text: '<b>list</b> users' });
    expect(capturedText).toBe('list users');
  });
});
