import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { RefreshSession, RoleName, User } from './types.js';

export class AuthStore {
  private users: User[] = [];
  private refreshSessions: RefreshSession[] = [];

  async seedAdmin(email: string, password: string): Promise<void> {
    if (this.users.length > 0) {
      throw new Error('Cannot seed the initial administrator after users have been created.');
    }

    await this.createUser({
      email,
      password,
      role: 'admin',
      name: 'System Admin',
    });
  }

  async listUsers(): Promise<User[]> {
    return [...this.users];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.find((user) => user.id === id);
  }

  async createUser(input: {
    email: string;
    password: string;
    role: RoleName;
    name: string;
  }): Promise<User> {
    const user: User = {
      id: randomUUID(),
      email: input.email,
      passwordHash: await argon2.hash(input.password),
      role: input.role,
      name: input.name,
      createdAt: new Date().toISOString(),
    };

    this.users.push(user);
    return user;
  }

  async createRefreshSession(userId: string, tokenHash: string): Promise<RefreshSession> {
    const session: RefreshSession = {
      id: randomUUID(),
      userId,
      tokenHash,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      revokedAt: null,
    };

    this.refreshSessions.push(session);
    return session;
  }

  async findRefreshSessionByTokenHash(tokenHash: string): Promise<RefreshSession | undefined> {
    return this.refreshSessions.find(
      (session) => session.tokenHash === tokenHash && session.revokedAt === null,
    );
  }

  async revokeRefreshSession(sessionId: string): Promise<void> {
    const session = this.refreshSessions.find((item) => item.id === sessionId);
    if (session) {
      session.revokedAt = new Date().toISOString();
    }
  }
}
