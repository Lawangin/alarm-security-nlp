import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
});

export function maskPin(pin: string): string {
  if (pin.length <= 1) return pin;
  return '*'.repeat(pin.length - 1) + pin[pin.length - 1];
}
