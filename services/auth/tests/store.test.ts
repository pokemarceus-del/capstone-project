import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import { AuthStore } from '../src/store.js';

describe('AuthStore administrator bootstrap', () => {
  it('does not create a default administrator', async () => {
    const store = new AuthStore();

    await expect(store.listUsers()).resolves.toEqual([]);
  });

  it('creates an administrator only with explicitly supplied credentials', async () => {
    const store = new AuthStore();

    await store.seedAdmin('admin@example.test', 'local-test-password');

    const user = await store.getUserByEmail('admin@example.test');
    expect(user).toMatchObject({
      email: 'admin@example.test',
      role: 'admin',
      name: 'System Admin',
    });
    if (!user) {
      throw new Error('Expected the explicitly seeded administrator.');
    }

    expect(user.passwordHash).not.toBe('local-test-password');
    await expect(argon2.verify(user.passwordHash, 'local-test-password')).resolves.toBe(true);
  });
});
