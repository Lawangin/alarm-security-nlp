import { AppError } from '../../shared/middleware/errorHandler.js';
import { maskPin } from '../../shared/logger.js';
import type { User } from './users.types.js';

const users = new Map<string, User>();

const PIN_PATTERN = /^\d{4,6}$/;

export function addUser(
  name: string,
  pin: string,
  startTime?: string,
  endTime?: string,
  permissions: string[] = ['arm', 'disarm'],
): User {
  if (!PIN_PATTERN.test(pin)) {
    throw new AppError(400, 'INVALID_PIN', 'PIN must be 4–6 digits');
  }

  const normalizedName = name.trim().toLowerCase();

  for (const existing of users.values()) {
    if (existing.name.toLowerCase() === normalizedName) {
      throw new AppError(409, 'DUPLICATE_NAME', `User "${name}" already exists`);
    }
  }

  const user: User = {
    name: name.trim(),
    pin,
    ...(startTime && { startTime }),
    ...(endTime && { endTime }),
    permissions,
    createdAt: new Date().toISOString(),
  };

  users.set(user.name.toLowerCase(), user);
  return user;
}

export function removeUser(identifier: { name?: string; pin?: string }): void {
  if (identifier.name) {
    const key = identifier.name.trim().toLowerCase();
    if (!users.has(key)) {
      throw new AppError(404, 'USER_NOT_FOUND', `User "${identifier.name}" not found`);
    }
    users.delete(key);
    return;
  }

  if (identifier.pin) {
    for (const [key, user] of users.entries()) {
      if (user.pin === identifier.pin) {
        users.delete(key);
        return;
      }
    }
    throw new AppError(404, 'USER_NOT_FOUND', `No user found with PIN ${maskPin(identifier.pin)}`);
  }

  throw new AppError(400, 'MISSING_IDENTIFIER', 'Provide either name or pin to remove a user');
}

export function listUsers(): Array<Omit<User, 'pin'> & { pin: string }> {
  return Array.from(users.values()).map((u) => ({
    ...u,
    pin: maskPin(u.pin),
  }));
}

export function getUserCount(): number {
  return users.size;
}

export function reset(): void {
  users.clear();
}
