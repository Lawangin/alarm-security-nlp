import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/middleware/errorHandler.js';
import { ArmMode } from '../../shared/types.js';
import * as systemService from './system.service.js';

const router: express.Router = express.Router();

const armSchema = z.object({
  mode: z.enum(['away', 'home', 'stay']).default('away'),
});

function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join('; ');
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

router.post('/arm-system', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode } = validate(armSchema, req.body);
    const result = systemService.armSystem(mode as ArmMode);
    res.json({ success: true, data: result, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

router.post('/disarm-system', (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = systemService.disarmSystem();
    res.json({ success: true, data: result, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

export const systemRouter: express.Router = router;
