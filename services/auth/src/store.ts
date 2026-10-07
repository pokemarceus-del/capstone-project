import { createHash, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import {
  Prisma,
  PrismaClient,
  type RefreshSession as PrismaRefreshSession,
} from '../generated/auth-client/index.js';
import type {
  LoginEvent,
  RefreshSession as RefreshSessionRecord,
  RoleName,
  User,
} from './types.js';

const roleDefinitions: { name: RoleName; description: string }[] = [
  { name: 'admin', description: 'System administrator' },
  { name: 'billing_officer', description: 'Billing operations staff' },
  { name: 'meter_reader', description: 'Field meter reader' },
  { name: 'customer', description: 'Customer portal user' },
];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashCustomerRegistrationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type RefreshRotationResult =
  | { status: 'invalid' }
  | { status: 'reused' }
  | { status: 'rotated'; session: RefreshSessionRecord };

export type SecurityAuditAction =
  | 'auth.login.succeeded'
  | 'auth.login.failed'
  | 'auth.login.locked'
  | 'auth.refresh.rotated'
  | 'auth.refresh.reused'
  | 'auth.refresh.rejected'
  | 'auth.logout.completed'
  | 'auth.admin_endpoint.denied'
  | 'auth.user_directory.read'
  | 'auth.audit_events.read'
  | 'auth.staff_user.created'
  | 'customer.registration.invitation.issued'
  | 'customer.registration.completed'
  | 'customer.registration.rejected';

export type SecurityAuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface SecurityAuditEntry {
  id: string;
  action: string;
  outcome: SecurityAuditOutcome;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export class AuthEmailConflictError extends Error {
  constructor() {
    super('A user with this email address already exists.');
    this.name = 'AuthEmailConflictError';
  }
}

export class InvalidCustomerRegistrationInvitationError extends Error {
  constructor() {
    super('The customer registration invitation is invalid or expired.');
    this.name = 'InvalidCustomerRegistrationInvitationError';
  }
}

export class AuthStore {
  constructor(private readonly prisma: PrismaClient = new PrismaClient()) {}

  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async checkReady(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async ensureRoles(): Promise<void> {
    for (const role of roleDefinitions) {
      await this.prisma.role.upsert({
        where: { name: role.name },
        create: role,
        update: { description: role.description },
      });
    }
  }

  async seedAdmin(email: string, password: string): Promise<void> {
    await this.seedLocalIdentity({
      email,
      password,
      role: 'admin',
      name: 'System Admin',
    });
  }

  async seedLocalIdentity(input: {
    email: string;
    password: string;
    role: RoleName;
    name: string;
  }): Promise<void> {
    const normalizedEmail = normalizeEmail(input.email);
    const existing = await this.getUserByEmail(normalizedEmail);
    if (existing) {
      if (existing.role !== input.role) {
        throw new Error(`The configured identity email belongs to a ${existing.role} user.`);
      }
      if (input.role === 'customer' && !existing.emailVerifiedAt) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: new Date() },
        });
      }
      return;
    }

    await this.createUser({
      email: normalizedEmail,
      password: input.password,
      role: input.role,
      name: input.name,
      emailVerifiedAt: input.role === 'customer' ? new Date() : undefined,
    });
  }

  async listUsers(): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => this.toUser(user));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      include: { role: true },
    });
    return user ? this.toUser(user) : undefined;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    return user ? this.toUser(user) : undefined;
  }

  async createUser(input: {
    email: string;
    password: string;
    role: RoleName;
    name: string;
    emailVerifiedAt?: Date;
    createdByUserId?: string;
  }): Promise<User> {
    const passwordHash = await argon2.hash(input.password);
    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            id: randomUUID(),
            email: normalizeEmail(input.email),
            passwordHash,
            name: input.name,
            emailVerifiedAt: input.emailVerifiedAt,
            role: { connect: { name: input.role } },
          },
          include: { role: true },
        });
        if (input.createdByUserId) {
          await transaction.securityAuditEvent.create({
            data: {
              action: 'auth.staff_user.created',
              outcome: 'SUCCESS',
              actorUserId: input.createdByUserId,
              targetType: 'user',
              targetId: createdUser.id,
            },
          });
        }
        return createdUser;
      });
      return this.toUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AuthEmailConflictError();
      }
      throw error;
    }
  }

  async createRefreshSession(
    userId: string,
    tokenHash: string,
    familyId?: string,
  ): Promise<RefreshSessionRecord> {
    const session = await this.prisma.refreshSession.create({
      data: {
        userId,
        familyId,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });
    return this.toRefreshSession(session);
  }

  async findRefreshSessionByTokenHash(
    tokenHash: string,
  ): Promise<RefreshSessionRecord | undefined> {
    const session = await this.prisma.refreshSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return session ? this.toRefreshSession(session) : undefined;
  }

  async rotateRefreshSession(
    tokenHash: string,
    replacementTokenHash: string,
  ): Promise<RefreshRotationResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const now = new Date();
        const session = await transaction.refreshSession.findUnique({ where: { tokenHash } });
        if (!session || session.expiresAt <= now) {
          await transaction.securityAuditEvent.create({
            data: {
              action: 'auth.refresh.rejected',
              outcome: 'DENIED',
              actorUserId: session?.userId,
              targetType: 'refresh_session',
              targetId: session?.id,
            },
          });
          return { status: 'invalid' };
        }

        if (session.revokedAt) {
          await transaction.refreshSession.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          await transaction.securityAuditEvent.create({
            data: {
              action: 'auth.refresh.reused',
              outcome: 'DENIED',
              actorUserId: session.userId,
              targetType: 'refresh_session',
              targetId: session.id,
            },
          });
          return { status: 'reused' };
        }

        const revoked = await transaction.refreshSession.updateMany({
          where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
          data: { revokedAt: now },
        });
        if (revoked.count !== 1) {
          await transaction.refreshSession.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          await transaction.securityAuditEvent.create({
            data: {
              action: 'auth.refresh.reused',
              outcome: 'DENIED',
              actorUserId: session.userId,
              targetType: 'refresh_session',
              targetId: session.id,
            },
          });
          return { status: 'reused' };
        }

        const replacement = await transaction.refreshSession.create({
          data: {
            userId: session.userId,
            familyId: session.familyId,
            tokenHash: replacementTokenHash,
            expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
          },
        });
        await transaction.securityAuditEvent.create({
          data: {
            action: 'auth.refresh.rotated',
            outcome: 'SUCCESS',
            actorUserId: session.userId,
            targetType: 'refresh_session',
            targetId: replacement.id,
          },
        });
        return { status: 'rotated', session: this.toRefreshSession(replacement) };
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  }

  async revokeRefreshSession(sessionId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeRefreshSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.refreshSession.findUnique({ where: { tokenHash } });
      if (!session) {
        return;
      }
      await transaction.refreshSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async recordLogoutByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.refreshSession.findUnique({ where: { tokenHash } });
      if (session) {
        await transaction.refreshSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await transaction.securityAuditEvent.create({
        data: {
          action: 'auth.logout.completed',
          outcome: 'SUCCESS',
          actorUserId: session?.userId,
          targetType: 'refresh_session',
          targetId: session?.id,
        },
      });
    });
  }

  async recordLoginEvent(input: {
    userId?: string;
    email: string;
    outcome: 'SUCCESS' | 'FAILURE';
  }): Promise<LoginEvent> {
    const event = await this.prisma.$transaction(async (transaction) => {
      const loginEvent = await transaction.loginEvent.create({
        data: {
          userId: input.userId,
          email: normalizeEmail(input.email),
          outcome: input.outcome,
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          action: input.outcome === 'SUCCESS' ? 'auth.login.succeeded' : 'auth.login.failed',
          outcome: input.outcome,
          actorUserId: input.userId,
          targetType: 'login',
        },
      });
      return loginEvent;
    });
    return {
      id: event.id,
      userId: event.userId,
      email: event.email,
      outcome: event.outcome,
      createdAt: event.createdAt.toISOString(),
    };
  }

  async recordSecurityAuditEvent(input: {
    action: SecurityAuditAction;
    outcome: SecurityAuditOutcome;
    actorUserId?: string;
    targetType?: string;
    targetId?: string;
  }): Promise<void> {
    await this.prisma.securityAuditEvent.create({ data: input });
  }

  async listSecurityAuditEvents(limit = 50): Promise<SecurityAuditEntry[]> {
    const events = await this.prisma.securityAuditEvent.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return events.map((event) => ({
      id: event.id,
      action: event.action,
      outcome: event.outcome,
      actorUserId: event.actorUserId,
      targetType: event.targetType,
      targetId: event.targetId,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  async countConsecutiveRecentLoginFailures(
    email: string,
    since: Date,
    limit: number,
  ): Promise<number> {
    const events = await this.prisma.loginEvent.findMany({
      where: { email: normalizeEmail(email), createdAt: { gte: since } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { outcome: true },
    });

    let failures = 0;
    for (const event of events) {
      if (event.outcome === 'SUCCESS') {
        break;
      }
      failures += 1;
    }
    return failures;
  }

  async listLoginEvents(userId: string): Promise<LoginEvent[]> {
    const events = await this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return events.map((event) => ({
      id: event.id,
      userId: event.userId,
      email: event.email,
      outcome: event.outcome,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  async createCustomerAccountLink(input: {
    userId: string;
    customerId: string;
    accountId: string;
  }): Promise<{ id: string; userId: string; customerId: string; accountId: string }> {
    const link = await this.prisma.customerAccountLink.create({ data: input });
    return {
      id: link.id,
      userId: link.userId,
      customerId: link.customerId,
      accountId: link.accountId,
    };
  }

  async createCustomerRegistrationInvitation(input: {
    tokenHash: string;
    email: string;
    name: string;
    customerId: string;
    accountIds: string[];
    createdByUserId: string;
  }): Promise<{ expiresAt: string }> {
    const email = normalizeEmail(input.email);
    if (await this.getUserByEmail(email)) {
      throw new AuthEmailConflictError();
    }

    const invitation = await this.prisma.$transaction(async (transaction) => {
      const createdInvitation = await transaction.customerRegistrationInvitation.create({
        data: {
          tokenHash: input.tokenHash,
          email,
          name: input.name,
          customerId: input.customerId,
          accountIds: [...new Set(input.accountIds)],
          createdByUserId: input.createdByUserId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          action: 'customer.registration.invitation.issued',
          outcome: 'SUCCESS',
          actorUserId: input.createdByUserId,
          targetType: 'customer',
          targetId: input.customerId,
        },
      });
      return createdInvitation;
    });
    return { expiresAt: invitation.expiresAt.toISOString() };
  }

  async redeemCustomerRegistrationInvitation(input: {
    tokenHash: string;
    password: string;
  }): Promise<User> {
    const passwordHash = await argon2.hash(input.password);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const now = new Date();
        const invitation = await transaction.customerRegistrationInvitation.findUnique({
          where: { tokenHash: input.tokenHash },
        });
        if (!invitation || invitation.redeemedAt || invitation.expiresAt <= now) {
          throw new InvalidCustomerRegistrationInvitationError();
        }

        const user = await transaction.user.create({
          data: {
            id: randomUUID(),
            email: invitation.email,
            passwordHash,
            name: invitation.name,
            emailVerifiedAt: now,
            role: { connect: { name: 'customer' } },
            customerAccountLinks: {
              create: invitation.accountIds.map((accountId) => ({
                customerId: invitation.customerId,
                accountId,
              })),
            },
          },
          include: { role: true },
        });

        const redeemed = await transaction.customerRegistrationInvitation.updateMany({
          where: {
            email: invitation.email,
            redeemedAt: null,
            expiresAt: { gt: now },
          },
          data: { redeemedAt: now },
        });
        if (redeemed.count !== 1) {
          throw new InvalidCustomerRegistrationInvitationError();
        }
        await transaction.securityAuditEvent.create({
          data: {
            action: 'customer.registration.completed',
            outcome: 'SUCCESS',
            targetType: 'user',
            targetId: user.id,
          },
        });
        return this.toUser(user);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AuthEmailConflictError();
      }
      throw error;
    }
  }

  async listCustomerAccountLinks(
    userId: string,
  ): Promise<{ id: string; userId: string; customerId: string; accountId: string }[]> {
    const links = await this.prisma.customerAccountLink.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return links.map(({ id, userId: linkedUserId, customerId, accountId }) => ({
      id,
      userId: linkedUserId,
      customerId,
      accountId,
    }));
  }

  private toUser(user: Prisma.UserGetPayload<{ include: { role: true } }>): User {
    const role = roleDefinitions.find((definition) => definition.name === user.role.name);
    if (!role) {
      throw new Error(`Auth database contains an unsupported role: ${user.role.name}`);
    }

    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: role.name,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  }

  private toRefreshSession(session: PrismaRefreshSession): RefreshSessionRecord {
    return {
      id: session.id,
      userId: session.userId,
      familyId: session.familyId,
      tokenHash: session.tokenHash,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
    };
  }
}
