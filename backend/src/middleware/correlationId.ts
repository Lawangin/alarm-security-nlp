import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      log: Logger;
    }
  }
}

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-correlation-id'] as string | undefined) ?? uuidv4();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  req.log = logger.child({ correlationId: id });
  next();
}
