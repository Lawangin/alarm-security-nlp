import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/middleware/errorHandler.js';
import * as usersService from './users.service.js';

const router: express.Router = express.Router();

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

function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join('; ');
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

router.post('/add-user', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, pin, startTime, endTime, permissions } = validate(addUserSchema, req.body);
    const user = usersService.addUser(name, pin, startTime, endTime, permissions);
    res.status(201).json({ success: true, data: user, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

router.post('/remove-user', (req: Request, res: Response, next: NextFunction) => {
  try {
    const identifier = validate(removeUserSchema, req.body);
    usersService.removeUser(identifier);
    res.json({ success: true, data: { removed: true }, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

router.get('/list-users', (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = usersService.listUsers();
    res.json({ success: true, data: { users }, correlationId: req.correlationId });
  } catch (err) {
    next(err);
  }
});

export const usersRouter: express.Router = router;
