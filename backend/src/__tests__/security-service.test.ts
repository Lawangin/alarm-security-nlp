import { describe, it, expect, beforeEach } from 'vitest';
import {
  armSystem,
  disarmSystem,
  getSystemState,
  reset as resetSystem,
} from '../modules/system/system.service.js';
import {
  addUser,
  removeUser,
  listUsers,
  getUserCount,
  reset as resetUsers,
} from '../modules/users/users.service.js';

describe('securityService', () => {
  beforeEach(() => {
    resetSystem();
    resetUsers();
  });

  // ---------------------------------------------------------------------------
  // armSystem
  // ---------------------------------------------------------------------------
  describe('armSystem', () => {
    it('arms with default mode "away"', () => {
      const state = armSystem();
      expect(state).toEqual({ armed: true, mode: 'away' });
    });

    it('arms with explicit mode "home"', () => {
      const state = armSystem('home');
      expect(state).toEqual({ armed: true, mode: 'home' });
    });

    it('arms with explicit mode "stay"', () => {
      const state = armSystem('stay');
      expect(state).toEqual({ armed: true, mode: 'stay' });
    });

    it('throws ALREADY_ARMED when already armed', () => {
      armSystem();
      expect(() => armSystem()).toThrow(expect.objectContaining({ errorCode: 'ALREADY_ARMED' }));
    });

    it('throws ALREADY_ARMED with the current mode in the message', () => {
      armSystem('home');
      expect(() => armSystem()).toThrow(/home/);
    });
  });

  // ---------------------------------------------------------------------------
  // disarmSystem
  // ---------------------------------------------------------------------------
  describe('disarmSystem', () => {
    it('disarms the system when armed', () => {
      armSystem();
      const state = disarmSystem();
      expect(state).toEqual({ armed: false, mode: null });
    });

    it('throws ALREADY_DISARMED when already disarmed', () => {
      expect(() => disarmSystem()).toThrow(
        expect.objectContaining({ errorCode: 'ALREADY_DISARMED' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // addUser
  // ---------------------------------------------------------------------------
  describe('addUser', () => {
    it('adds a valid user with default permissions', () => {
      const user = addUser('Alice', '1234');
      expect(user.name).toBe('Alice');
      expect(user.pin).toBe('1234');
      expect(user.permissions).toEqual(['arm', 'disarm']);
      expect(user.createdAt).toBeTruthy();
    });

    it('accepts 6-digit PINs', () => {
      const user = addUser('Bob', '123456');
      expect(user.pin).toBe('123456');
    });

    it('stores custom permissions', () => {
      const user = addUser('Carol', '5678', undefined, undefined, ['arm']);
      expect(user.permissions).toEqual(['arm']);
    });

    it('stores optional startTime and endTime', () => {
      const start = '2026-01-01T00:00:00.000Z';
      const end = '2026-01-02T00:00:00.000Z';
      const user = addUser('Dave', '9999', start, end);
      expect(user.startTime).toBe(start);
      expect(user.endTime).toBe(end);
    });

    it('throws INVALID_PIN for a 3-digit PIN', () => {
      expect(() => addUser('Eve', '123')).toThrow(
        expect.objectContaining({ errorCode: 'INVALID_PIN' }),
      );
    });

    it('throws INVALID_PIN for a 7-digit PIN', () => {
      expect(() => addUser('Eve', '1234567')).toThrow(
        expect.objectContaining({ errorCode: 'INVALID_PIN' }),
      );
    });

    it('throws INVALID_PIN for non-numeric characters', () => {
      expect(() => addUser('Eve', 'abcd')).toThrow(
        expect.objectContaining({ errorCode: 'INVALID_PIN' }),
      );
    });

    it('throws DUPLICATE_NAME for the same name (case-insensitive)', () => {
      addUser('Alice', '1234');
      expect(() => addUser('alice', '5678')).toThrow(
        expect.objectContaining({ errorCode: 'DUPLICATE_NAME' }),
      );
    });

    it('allows two users with the same PIN (service does not enforce PIN uniqueness)', () => {
      addUser('Alice', '1234');
      const bob = addUser('Bob', '1234');
      expect(bob.name).toBe('Bob');
    });
  });

  // ---------------------------------------------------------------------------
  // removeUser
  // ---------------------------------------------------------------------------
  describe('removeUser', () => {
    beforeEach(() => {
      addUser('Alice', '1234');
    });

    it('removes a user by name', () => {
      removeUser({ name: 'Alice' });
      expect(listUsers()).toHaveLength(0);
    });

    it('removes a user by name case-insensitively', () => {
      removeUser({ name: 'alice' });
      expect(listUsers()).toHaveLength(0);
    });

    it('removes a user by PIN', () => {
      removeUser({ pin: '1234' });
      expect(listUsers()).toHaveLength(0);
    });

    it('throws USER_NOT_FOUND when name does not match', () => {
      expect(() => removeUser({ name: 'Nobody' })).toThrow(
        expect.objectContaining({ errorCode: 'USER_NOT_FOUND' }),
      );
    });

    it('throws USER_NOT_FOUND when PIN does not match', () => {
      expect(() => removeUser({ pin: '9999' })).toThrow(
        expect.objectContaining({ errorCode: 'USER_NOT_FOUND' }),
      );
    });

    it('throws MISSING_IDENTIFIER when neither name nor pin is provided', () => {
      expect(() => removeUser({})).toThrow(
        expect.objectContaining({ errorCode: 'MISSING_IDENTIFIER' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // listUsers
  // ---------------------------------------------------------------------------
  describe('listUsers', () => {
    it('returns an empty array when there are no users', () => {
      expect(listUsers()).toEqual([]);
    });

    it('returns all users', () => {
      addUser('Alice', '1234');
      addUser('Bob', '5678');
      expect(listUsers()).toHaveLength(2);
    });

    it('masks PINs in the returned list', () => {
      addUser('Alice', '4321');
      const [user] = listUsers();
      expect(user.pin).toBe('***1');
      expect(user.pin).not.toBe('4321');
    });

    it('does not expose the raw PIN in any returned field', () => {
      addUser('Alice', '4321');
      const [user] = listUsers();
      expect(JSON.stringify(user)).not.toContain('4321');
    });
  });

  // ---------------------------------------------------------------------------
  // getSystemState
  // ---------------------------------------------------------------------------
  describe('getSystemState', () => {
    it('returns disarmed state initially', () => {
      const { systemState } = getSystemState();
      expect(systemState).toEqual({ armed: false, mode: null });
    });

    it('reflects armed state after arming', () => {
      armSystem('home');
      const { systemState } = getSystemState();
      expect(systemState).toEqual({ armed: true, mode: 'home' });
    });
  });

  // ---------------------------------------------------------------------------
  // getUserCount
  // ---------------------------------------------------------------------------
  describe('getUserCount', () => {
    it('returns 0 when there are no users', () => {
      expect(getUserCount()).toBe(0);
    });

    it('returns correct count after adding users', () => {
      addUser('Alice', '1234');
      expect(getUserCount()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // reset
  // ---------------------------------------------------------------------------
  describe('reset', () => {
    it('clears armed state and user list', () => {
      armSystem();
      addUser('Alice', '1234');
      resetSystem();
      resetUsers();
      const { systemState } = getSystemState();
      expect(systemState).toEqual({ armed: false, mode: null });
      expect(getUserCount()).toBe(0);
    });
  });
});
