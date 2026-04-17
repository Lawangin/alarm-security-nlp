import type { ArmMode } from '../../shared/types.js';

export interface SystemState {
  armed: boolean;
  mode: ArmMode | null;
}
