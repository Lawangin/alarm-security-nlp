import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    req.log?.warn({ errorCode: err.errorCode }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        errorCode: err.errorCode,
        ...(config.NODE_ENV === 'development' && { stack: err.stack }),
      },
      correlationId: req.correlationId,
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({
    success: false,
    error: {
      message,
      errorCode: 'INTERNAL_ERROR',
      ...(config.NODE_ENV === 'development' && err instanceof Error && { stack: err.stack }),
    },
    correlationId: req.correlationId,
  });
}
