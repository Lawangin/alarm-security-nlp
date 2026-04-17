import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  req.log.info({ method: req.method, path: req.path }, 'request received');

  res.on('finish', () => {
    const duration = Date.now() - start;
    req.log.info(
      { method: req.method, path: req.path, status: res.statusCode, durationMs: duration },
      'request completed',
    );
  });

  next();
}
