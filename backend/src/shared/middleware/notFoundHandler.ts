import { Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      errorCode: 'NOT_FOUND',
    },
    correlationId: req.correlationId,
  });
}
