import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { maskPin } from '../shared/logger.js';

// ---------------------------------------------------------------------------
// maskPin
// ---------------------------------------------------------------------------
describe('maskPin', () => {
  it('masks all but the last digit of a 4-digit PIN', () => {
    expect(maskPin('4321')).toBe('***1');
  });

  it('masks all but the last digit of a 6-digit PIN', () => {
    expect(maskPin('123456')).toBe('*****6');
  });

  it('returns single-character string as-is', () => {
    expect(maskPin('5')).toBe('5');
  });

  it('returns empty string as-is', () => {
    expect(maskPin('')).toBe('');
  });

  it('masks a 5-digit PIN correctly', () => {
    expect(maskPin('12345')).toBe('****5');
  });

  it('masks a 2-digit value correctly', () => {
    expect(maskPin('12')).toBe('*2');
  });
});

// ---------------------------------------------------------------------------
// Input sanitization — tested through validateTextInput middleware behaviour
// ---------------------------------------------------------------------------
describe('validateTextInput middleware', () => {
  // We create a minimal Express-like req/res/next triple to test the middleware
  // without spinning up the full app.
  const buildReqRes = (body: Record<string, unknown>) => {
    const req = { body } as unknown as import('express').Request;
    const res = {} as unknown as import('express').Response;
    const next = vi.fn() as unknown as import('express').NextFunction;
    return { req, res, next };
  };

  let validateTextInput: typeof import('../shared/middleware/inputValidation.js').validateTextInput;

  beforeEach(async () => {
    ({ validateTextInput } = await import('../shared/middleware/inputValidation.js'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes clean text through unchanged', () => {
    const { req, res, next } = buildReqRes({ text: 'arm the system' });
    validateTextInput(req, res, next);
    expect(req.body.text).toBe('arm the system');
    expect(next).toHaveBeenCalledWith(); // no error argument
  });

  it('strips HTML tags from the input', () => {
    const { req, res, next } = buildReqRes({ text: '<b>arm</b> the system' });
    validateTextInput(req, res, next);
    expect(req.body.text).toBe('arm the system');
    expect(next).toHaveBeenCalledWith();
  });

  it('trims leading and trailing whitespace', () => {
    const { req, res, next } = buildReqRes({ text: '  arm the system  ' });
    validateTextInput(req, res, next);
    expect(req.body.text).toBe('arm the system');
  });

  it('rejects empty text with EMPTY_INPUT', () => {
    const { req, res, next } = buildReqRes({ text: '' });
    validateTextInput(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'EMPTY_INPUT' }),
    );
  });

  it('rejects whitespace-only text with EMPTY_INPUT', () => {
    const { req, res, next } = buildReqRes({ text: '   ' });
    validateTextInput(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'EMPTY_INPUT' }),
    );
  });

  it('rejects missing text field with EMPTY_INPUT', () => {
    const { req, res, next } = buildReqRes({});
    validateTextInput(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'EMPTY_INPUT' }),
    );
  });

  it('rejects non-string text with INVALID_INPUT', () => {
    const { req, res, next } = buildReqRes({ text: 42 });
    validateTextInput(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'INVALID_INPUT' }),
    );
  });

  it('rejects text exceeding 500 characters with INPUT_TOO_LONG', () => {
    const { req, res, next } = buildReqRes({ text: 'a'.repeat(501) });
    validateTextInput(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'INPUT_TOO_LONG' }),
    );
  });

  it('accepts text of exactly 500 characters', () => {
    const { req, res, next } = buildReqRes({ text: 'a'.repeat(500) });
    validateTextInput(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects tag-only input (empty after stripping) with EMPTY_INPUT', () => {
    // stripHtml removes tags but keeps text content; a self-closing tag with no
    // text content between tags becomes an empty string after stripping.
    const { req, res, next } = buildReqRes({ text: '<br/>' });
    validateTextInput(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'EMPTY_INPUT' }),
    );
  });
});
