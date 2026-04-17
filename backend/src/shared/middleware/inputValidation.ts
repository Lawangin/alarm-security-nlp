import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

const MAX_TEXT_LENGTH = 500;

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

export function validateTextInput(req: Request, _res: Response, next: NextFunction): void {
  const { text } = req.body as { text?: unknown };

  if (text === undefined || text === null || (typeof text === 'string' && text.trim() === '')) {
    return next(new AppError(400, 'EMPTY_INPUT', 'Text input is required and cannot be empty'));
  }

  if (typeof text !== 'string') {
    return next(new AppError(400, 'INVALID_INPUT', 'Text must be a string'));
  }

  const sanitized = stripHtml(text);

  if (sanitized.length === 0) {
    return next(new AppError(400, 'EMPTY_INPUT', 'Text input is required and cannot be empty'));
  }

  if (sanitized.length > MAX_TEXT_LENGTH) {
    return next(
      new AppError(
        400,
        'INPUT_TOO_LONG',
        `Text must not exceed ${MAX_TEXT_LENGTH} characters (got ${sanitized.length})`,
      ),
    );
  }

  req.body.text = sanitized;
  next();
}
