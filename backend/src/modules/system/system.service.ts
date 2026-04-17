import { AppError } from '../../shared/middleware/errorHandler.js';
import type { ArmMode } from '../../shared/types.js';
import type { SystemState } from './system.types.js';

let systemState: SystemState = { armed: false, mode: null };

const VALID_MODES: ArmMode[] = ['away', 'home', 'stay'];

export function armSystem(mode: ArmMode = 'away'): SystemState {
  if (!VALID_MODES.includes(mode)) {
    throw new AppError(400, 'INVALID_MODE', `Invalid mode "${mode}". Must be one of: ${VALID_MODES.join(', ')}`);
  }
  if (systemState.armed) {
    throw new AppError(409, 'ALREADY_ARMED', `System is already armed in "${systemState.mode}" mode`);
  }
  systemState = { armed: true, mode };
  return { ...systemState };
}

export function disarmSystem(): SystemState {
  if (!systemState.armed) {
    throw new AppError(409, 'ALREADY_DISARMED', 'System is already disarmed');
  }
  systemState = { armed: false, mode: null };
  return { ...systemState };
}

export function getSystemState(): { systemState: SystemState } {
  return { systemState: { ...systemState } };
}

export function reset(): void {
  systemState = { armed: false, mode: null };
}
