import { Intent, ParsedCommand } from '../types.js';
import * as securityService from './securityService.js';
import { AppError } from '../middleware/errorHandler.js';

export interface RouterResult {
  apiCall: string;
  result: unknown;
}

const EXAMPLE_COMMANDS = [
  '"arm the system"',
  '"arm in stay mode"',
  '"disarm the system"',
  '"add user Sarah with PIN 4321"',
  '"remove user Sarah"',
  '"list users"',
];

export function routeCommand(parsed: ParsedCommand): RouterResult {
  const { intent, entities } = parsed;

  switch (intent) {
    case Intent.ARM_SYSTEM: {
      const mode = entities.mode ?? 'away';
      const result = securityService.armSystem(mode);
      return { apiCall: 'POST /api/arm-system', result };
    }

    case Intent.DISARM_SYSTEM: {
      const result = securityService.disarmSystem();
      return { apiCall: 'POST /api/disarm-system', result };
    }

    case Intent.ADD_USER: {
      if (!entities.name) {
        throw new AppError(422, 'MISSING_ENTITY', 'Could not extract a user name from your command. Try: "add user Sarah with PIN 4321"');
      }
      if (!entities.pin) {
        throw new AppError(422, 'MISSING_ENTITY', 'Could not extract a PIN from your command. Try: "add user Sarah with PIN 4321"');
      }
      const result = securityService.addUser(
        entities.name,
        entities.pin,
        entities.startTime,
        entities.endTime,
        entities.permissions,
      );
      return { apiCall: 'POST /api/add-user', result };
    }

    case Intent.REMOVE_USER: {
      if (!entities.name && !entities.pin) {
        throw new AppError(422, 'MISSING_ENTITY', 'Could not extract a user name or PIN from your command. Try: "remove user Sarah"');
      }
      securityService.removeUser({ name: entities.name, pin: entities.pin });
      return { apiCall: 'POST /api/remove-user', result: { removed: true } };
    }

    case Intent.LIST_USERS: {
      const users = securityService.listUsers();
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
