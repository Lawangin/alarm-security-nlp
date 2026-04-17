import { Intent, type ParsedCommand } from '../../shared/types.js';
import {
  hasNonContiguousDaySeries,
  hasIterativeSchedule,
  throwUnsupportedSchedule,
  throwMissingUserName,
  throwMissingPin,
  throwMissingRemoveTarget,
} from '../../shared/commandErrors.js';
import * as systemService from '../system/system.service.js';
import * as usersService from '../users/users.service.js';

export interface RouterResult {
  apiCall: string;
  result: unknown;
}

const EXAMPLE_COMMANDS = [
  '"arm the system"',
  '"arm in stay mode"',
  '"disarm the system"',
  '"add user Sarah with PIN 4321"',
  '"add user Sarah with PIN 4321 from Monday to Friday"',
  '"remove user Sarah"',
  '"list users"',
];

export function routeCommand(parsed: ParsedCommand): RouterResult {
  const { intent, entities } = parsed;

  switch (intent) {
    case Intent.ARM_SYSTEM: {
      const mode = entities.mode ?? 'away';
      const result = systemService.armSystem(mode);
      return { apiCall: 'POST /api/arm-system', result };
    }

    case Intent.DISARM_SYSTEM: {
      const result = systemService.disarmSystem();
      return { apiCall: 'POST /api/disarm-system', result };
    }

    case Intent.ADD_USER: {
      if (hasIterativeSchedule(parsed.rawText) || hasNonContiguousDaySeries(parsed.rawText)) throwUnsupportedSchedule();
      if (!entities.name) throwMissingUserName();
      if (!entities.pin) throwMissingPin();
      const result = usersService.addUser(
        entities.name,
        entities.pin,
        entities.startTime,
        entities.endTime,
        entities.permissions,
      );
      return { apiCall: 'POST /api/add-user', result };
    }

    case Intent.REMOVE_USER: {
      if (!entities.name && !entities.pin) throwMissingRemoveTarget();
      usersService.removeUser({ name: entities.name, pin: entities.pin });
      return { apiCall: 'POST /api/remove-user', result: { removed: true } };
    }

    case Intent.LIST_USERS: {
      const users = usersService.listUsers();
      return { apiCall: 'GET /api/list-users', result: { users } };
    }

    case Intent.UNKNOWN:
    default: {
      return {
        apiCall: 'none',
        result: {
          message: 'Command not understood. Try one of these examples:',
          examples: EXAMPLE_COMMANDS,
        },
      };
    }
  }
}
