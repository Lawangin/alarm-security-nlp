import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as securityService from '../services/securityService.js';
import { AppError } from '../middleware/errorHandler.js';
import { ArmMode } from '../types.js';

const router: express.Router = express.Router();

// --- Zod schemas ---

const armSchema = z.object({
  mode: z.enum(['away', 'home', 'stay']).default('away'),
});

const addUserSchema = z.object({
  name: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const removeUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    pin: z.string().regex(/^\d{4,6}$/).optional(),
  })
  .refine((d) => d.name !== undefined || d.pin !== undefined, {
    message: 'Provide either name or pin',
  });

// --- Helpers ---

function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join('; ');
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

// --- Routes ---

router.post('/arm-system', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode } = validate(armSchema, req.body);
    const result = securityService.armSystem(mode as ArmMode);
    res.json({ success: true, data: result, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

router.post('/disarm-system', (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = securityService.disarmSystem();
    res.json({ success: true, data: result, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

router.post('/add-user', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, pin, startTime, endTime, permissions } = validate(addUserSchema, req.body);
    const user = securityService.addUser(name, pin, startTime, endTime, permissions);
    res.status(201).json({ success: true, data: user, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

router.post('/remove-user', (req: Request, res: Response, next: NextFunction) => {
  try {
    const identifier = validate(removeUserSchema, req.body);
    securityService.removeUser(identifier);
    res.json({ success: true, data: { removed: true }, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

router.get('/list-users', (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = securityService.listUsers();
    res.json({ success: true, data: { users }, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

export const apiRouter: express.Router = router;
