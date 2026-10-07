import { generateKeyPairSync } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '../generated/auth-client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthApp } from '../src/app.js';
import type { AuthConfig } from '../src/config.js';
import { loadJwtConfig, signAccessToken } from '../src/jwt.js';
import { AuthStore, hashCustomerRegistrationToken, hashRefreshToken } from '../src/store.js';

const integrationUrl = process.env.AUTH_INTEGRATION_DATABASE_URL;
const integrationDescribe = integrationUrl ? describe : describe.skip;
const runId = crypto.randomUUID();
const userEmail = `auth-test-${runId}@example.test`;
const unknownEmail = `unknown-${runId}@example.test`;
const lockoutEmail = `lockout-${runId}@example.test`;
const registrationEmail = `registration-${runId}@example.test`;
const localIdentityEmails = [
  `local-admin-${runId}@example.test`,
  `local-billing-${runId}@example.test`,
  `local-reader-${runId}@example.test`,
  `local-customer-${runId}@example.test`,
];
let prisma: PrismaClient;
let store: AuthStore;
let userId: string;
let adminId: string;
let billingUserId: string;
let readerUserId: string;
let staffCreatedUserId: string | undefined;
let registrationUserId: string | undefined;
let testApp: FastifyInstance | undefined;
let auditStartedAt: Date | undefined;

integrationDescribe('Auth Service PostgreSQL persistence', () => {
  beforeAll(async () => {
    if (!integrationUrl) {
      throw new Error('AUTH_INTEGRATION_DATABASE_URL is required for Auth integration tests.');
    }
    prisma = new PrismaClient({ datasources: { db: { url: integrationUrl } } });
    store = new AuthStore(prisma);
    await store.connect();
    await store.ensureRoles();
    auditStartedAt = new Date(Date.now() - 1000);
    const user = await store.createUser({
      email: userEmail,
      password: 'integration-test-password',
      role: 'customer',
      name: 'Auth Integration User',
    });
    userId = user.id;
    const admin = await store.createUser({
      email: `admin-${runId}@example.test`,
      password: 'integration-admin-password',
      role: 'admin',
      name: 'Auth Integration Admin',
    });
    adminId = admin.id;
    const billingUser = await store.createUser({
      email: `billing-${runId}@example.test`,
      password: 'integration-billing-password',
      role: 'billing_officer',
      name: 'Auth Integration Billing Officer',
    });
    billingUserId = billingUser.id;
    const readerUser = await store.createUser({
      email: `reader-${runId}@example.test`,
      password: 'integration-reader-password',
      role: 'meter_reader',
      name: 'Auth Integration Meter Reader',
    });
    readerUserId = readerUser.id;
  });

  afterAll(async () => {
    await testApp?.close();
    if (prisma) {
      await prisma.loginEvent.deleteMany({
        where: { email: { in: [userEmail, unknownEmail, lockoutEmail, registrationEmail] } },
      });
      if (adminId) {
        await prisma.customerRegistrationInvitation.deleteMany({
          where: { createdByUserId: adminId },
        });
      }
      if (registrationUserId) {
        await prisma.user.deleteMany({ where: { id: registrationUserId } });
      }
      if (staffCreatedUserId) {
        await prisma.user.deleteMany({ where: { id: staffCreatedUserId } });
      }
      await prisma.user.deleteMany({ where: { email: { in: localIdentityEmails } } });
      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      if (billingUserId) {
        await prisma.user.deleteMany({ where: { id: billingUserId } });
      }
      if (readerUserId) {
        await prisma.user.deleteMany({ where: { id: readerUserId } });
      }
      if (adminId) {
        await prisma.user.deleteMany({ where: { id: adminId } });
      }
      if (auditStartedAt) {
        await prisma.securityAuditEvent.deleteMany({
          where: { createdAt: { gte: auditStartedAt } },
        });
      }
      await prisma.$disconnect();
    }
  });

  it('persists users and role records across store instances', async () => {
    const secondStore = new AuthStore(
      new PrismaClient({ datasources: { db: { url: integrationUrl } } }),
    );
    await secondStore.connect();
    try {
      const user = await secondStore.getUserByEmail(userEmail.toUpperCase());
      expect(user).toMatchObject({
        id: userId,
        email: userEmail,
        role: 'customer',
        name: 'Auth Integration User',
      });
      if (!user) {
        throw new Error('Expected the persisted Auth integration user.');
      }
      await expect(argon2.verify(user.passwordHash, 'integration-test-password')).resolves.toBe(
        true,
      );
      expect(await prisma.role.count()).toBe(4);
    } finally {
      await secondStore.disconnect();
    }
  });

  it('persists refresh-token digests and excludes revoked sessions', async () => {
    const token = `refresh-${runId}`;
    const siblingToken = `sibling-${runId}`;
    const session = await store.createRefreshSession(userId, hashRefreshToken(token));
    await store.createRefreshSession(userId, hashRefreshToken(siblingToken), session.familyId);

    await expect(
      store.findRefreshSessionByTokenHash(hashRefreshToken(token)),
    ).resolves.toMatchObject({
      id: session.id,
      userId,
      familyId: session.familyId,
      revokedAt: null,
    });

    await store.revokeRefreshSessionByTokenHash(hashRefreshToken(token));
    await expect(
      store.findRefreshSessionByTokenHash(hashRefreshToken(token)),
    ).resolves.toBeUndefined();
    await expect(
      store.findRefreshSessionByTokenHash(hashRefreshToken(siblingToken)),
    ).resolves.toBeUndefined();
  });

  it('rotates refresh tokens and revokes only the reused token family', async () => {
    const token = `rotate-${runId}`;
    const replacementToken = `replacement-${runId}`;
    const unrelatedToken = `unrelated-${runId}`;
    const session = await store.createRefreshSession(userId, hashRefreshToken(token));
    await store.createRefreshSession(userId, hashRefreshToken(unrelatedToken));

    const rotation = await store.rotateRefreshSession(
      hashRefreshToken(token),
      hashRefreshToken(replacementToken),
    );
    expect(rotation.status).toBe('rotated');
    if (rotation.status !== 'rotated') {
      throw new Error('Expected refresh-token rotation to succeed.');
    }
    expect(rotation.session.familyId).toBe(session.familyId);
    await expect(
      store.findRefreshSessionByTokenHash(hashRefreshToken(replacementToken)),
    ).resolves.toMatchObject({ familyId: session.familyId, revokedAt: null });

    await expect(
      store.rotateRefreshSession(hashRefreshToken(token), hashRefreshToken(`replay-${runId}`)),
    ).resolves.toEqual({ status: 'reused' });
    await expect(
      store.findRefreshSessionByTokenHash(hashRefreshToken(replacementToken)),
    ).resolves.toBeUndefined();
    await expect(
      store.findRefreshSessionByTokenHash(hashRefreshToken(unrelatedToken)),
    ).resolves.toMatchObject({ revokedAt: null });
    await expect(
      prisma.securityAuditEvent.findMany({
        where: {
          targetType: 'refresh_session',
          targetId: { in: [session.id, rotation.session.id] },
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'auth.refresh.rotated',
          outcome: 'SUCCESS',
          actorUserId: userId,
        }),
        expect.objectContaining({
          action: 'auth.refresh.reused',
          outcome: 'DENIED',
          actorUserId: userId,
        }),
      ]),
    );
    await expect(
      store.rotateRefreshSession(
        hashRefreshToken(`missing-${runId}`),
        hashRefreshToken(`never-${runId}`),
      ),
    ).resolves.toEqual({ status: 'invalid' });

    const expiredToken = `expired-${runId}`;
    const expiredSession = await store.createRefreshSession(userId, hashRefreshToken(expiredToken));
    await prisma.refreshSession.update({
      where: { id: expiredSession.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(
      store.rotateRefreshSession(
        hashRefreshToken(expiredToken),
        hashRefreshToken(`expired-replacement-${runId}`),
      ),
    ).resolves.toEqual({ status: 'invalid' });
  });

  it('handles concurrent refresh attempts as a single use and detects token reuse', async () => {
    const token = `concurrent-${runId}`;
    const replacementTokens = [`concurrent-a-${runId}`, `concurrent-b-${runId}`];
    const session = await store.createRefreshSession(userId, hashRefreshToken(token));
    const results = await Promise.all(
      replacementTokens.map((replacement) =>
        store.rotateRefreshSession(hashRefreshToken(token), hashRefreshToken(replacement)),
      ),
    );

    expect(results.map((result) => result.status).sort()).toEqual(['reused', 'rotated']);
    const rotatedIndex = results.findIndex((result) => result.status === 'rotated');
    const rotatedResult = results[rotatedIndex];
    if (rotatedResult.status !== 'rotated') {
      throw new Error('Expected one concurrent refresh request to rotate the token.');
    }
    expect(rotatedResult.session.familyId).toBe(session.familyId);
    await expect(
      store.findRefreshSessionByTokenHash(hashRefreshToken(replacementTokens[rotatedIndex])),
    ).resolves.toBeUndefined();
  });

  it('audits logout without retaining raw refresh tokens', async () => {
    const token = `logout-${runId}`;
    const session = await store.createRefreshSession(userId, hashRefreshToken(token));

    await store.recordLogoutByTokenHash(hashRefreshToken(token));
    await expect(
      prisma.securityAuditEvent.findFirst({
        where: {
          action: 'auth.logout.completed',
          actorUserId: userId,
          targetId: session.id,
        },
      }),
    ).resolves.toMatchObject({ outcome: 'SUCCESS' });
    await expect(
      prisma.securityAuditEvent.findFirst({ where: { targetId: token } }),
    ).resolves.toBeNull();
    await expect(
      prisma.securityAuditEvent.findFirst({
        where: { targetId: hashRefreshToken(token) },
      }),
    ).resolves.toBeNull();
    await expect(
      store.findRefreshSessionByTokenHash(hashRefreshToken(token)),
    ).resolves.toBeUndefined();
  });

  it('counts recent consecutive failed logins and resets the count after success', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await store.recordLoginEvent({ email: lockoutEmail, outcome: 'FAILURE' });
    }
    const windowStart = new Date(Date.now() - 15 * 60 * 1000);

    await expect(
      store.countConsecutiveRecentLoginFailures(lockoutEmail, windowStart, 5),
    ).resolves.toBe(5);

    await store.recordLoginEvent({ email: lockoutEmail, outcome: 'SUCCESS' });
    await expect(
      store.countConsecutiveRecentLoginFailures(lockoutEmail, windowStart, 5),
    ).resolves.toBe(0);

    await prisma.loginEvent.create({
      data: {
        email: lockoutEmail,
        outcome: 'FAILURE',
        createdAt: new Date(Date.now() - 16 * 60 * 1000),
      },
    });
    await expect(
      store.countConsecutiveRecentLoginFailures(lockoutEmail, windowStart, 5),
    ).resolves.toBe(0);
  });

  it('persists login events without requiring a user for unknown-email failures', async () => {
    await store.recordLoginEvent({ userId, email: userEmail, outcome: 'SUCCESS' });
    await store.recordLoginEvent({
      email: unknownEmail,
      outcome: 'FAILURE',
    });

    const events = await store.listLoginEvents(userId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ email: userEmail, outcome: 'SUCCESS' });
    await expect(
      prisma.loginEvent.findFirst({
        where: { email: unknownEmail, userId: null, outcome: 'FAILURE' },
      }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.securityAuditEvent.findMany({
        where: {
          action: { in: ['auth.login.succeeded', 'auth.login.failed'] },
          targetType: 'login',
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'auth.login.succeeded',
          outcome: 'SUCCESS',
          actorUserId: userId,
        }),
        expect.objectContaining({
          action: 'auth.login.failed',
          outcome: 'FAILURE',
          actorUserId: null,
        }),
      ]),
    );
  });

  it('persists customer-account links owned by the Auth user', async () => {
    const customerId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const link = await store.createCustomerAccountLink({ userId, customerId, accountId });

    await expect(store.listCustomerAccountLinks(userId)).resolves.toContainEqual(link);
    await expect(
      store.createCustomerAccountLink({ userId, customerId, accountId }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('seeds one strong, idempotent local identity for each role', async () => {
    const identities = [
      {
        email: localIdentityEmails[0],
        password: 'local-admin-password-001',
        role: 'admin' as const,
      },
      {
        email: localIdentityEmails[1],
        password: 'local-billing-password-002',
        role: 'billing_officer' as const,
      },
      {
        email: localIdentityEmails[2],
        password: 'local-reader-password-003',
        role: 'meter_reader' as const,
      },
      {
        email: localIdentityEmails[3],
        password: 'local-customer-password-004',
        role: 'customer' as const,
      },
    ];

    for (const identity of identities) {
      const seed = { ...identity, name: `Local ${identity.role}` };
      await store.seedLocalIdentity(seed);
      await store.seedLocalIdentity(seed);
    }

    for (const identity of identities) {
      const user = await store.getUserByEmail(identity.email);
      expect(user?.role).toBe(identity.role);
      if (!user) {
        throw new Error(`Expected local ${identity.role} identity to be persisted.`);
      }
      await expect(argon2.verify(user.passwordHash, identity.password)).resolves.toBe(true);
      expect(Boolean(user.emailVerifiedAt)).toBe(identity.role === 'customer');
    }
    expect(await prisma.user.count({ where: { email: { in: localIdentityEmails } } })).toBe(4);

    const customerSeed = identities[3];
    const seededCustomer = await store.getUserByEmail(customerSeed.email);
    if (!seededCustomer) {
      throw new Error('Expected the local Customer identity to be persisted.');
    }
    await prisma.user.update({
      where: { id: seededCustomer.id },
      data: { emailVerifiedAt: null },
    });
    await store.seedLocalIdentity({ ...customerSeed, name: 'Local customer' });
    await expect(store.getUserByEmail(customerSeed.email)).resolves.toMatchObject({
      emailVerifiedAt: expect.any(String),
    });
  });

  it('requires Admin-issued invitations and atomically registers verified customers', async () => {
    if (!integrationUrl) {
      throw new Error('AUTH_INTEGRATION_DATABASE_URL is required.');
    }
    const customerId = crypto.randomUUID();
    const accountIds = [crypto.randomUUID(), crypto.randomUUID()];
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicJwk = keyPair.publicKey.export({ format: 'jwk' });
    if (!publicJwk.n || !publicJwk.e) {
      throw new Error('Generated test JWT key did not contain RSA JWK parameters.');
    }
    const jwt = loadJwtConfig({
      JWT_ISSUER: 'aquaflow-auth-integration',
      JWT_ACTIVE_KID: 'integration-key',
      JWT_PRIVATE_KEY_B64: keyPair.privateKey
        .export({ type: 'pkcs8', format: 'der' })
        .toString('base64'),
      JWT_PUBLIC_KEYS_JSON: JSON.stringify({
        keys: [
          {
            kty: 'RSA',
            n: publicJwk.n,
            e: publicJwk.e,
            kid: 'integration-key',
            use: 'sig',
            alg: 'RS256',
          },
        ],
      }),
    });
    const config: AuthConfig = {
      databaseUrl: integrationUrl,
      port: 3002,
      customerServiceUrl: 'http://customer:3001',
      jwt,
    };
    const app = createAuthApp(store, config, {
      async getVerifiedCustomer(customerIdInput, authorization) {
        expect(customerIdInput).toBe(customerId);
        expect(authorization).toMatch(/^Bearer /);
        return {
          customerId,
          email: registrationEmail,
          name: 'Verified Integration Customer',
          accountIds,
        };
      },
    });
    testApp = app;
    const adminToken = signAccessToken(
      { sub: adminId, email: `admin-${runId}@example.test`, role: 'admin' },
      jwt,
    );
    const billingToken = signAccessToken(
      { sub: billingUserId, email: `billing-${runId}@example.test`, role: 'billing_officer' },
      jwt,
    );
    const customerToken = signAccessToken({ sub: userId, email: userEmail, role: 'customer' }, jwt);
    const readerToken = signAccessToken(
      {
        sub: readerUserId,
        email: `reader-${runId}@example.test`,
        role: 'meter_reader',
      },
      jwt,
    );
    const roleTokens = [
      { role: 'admin', token: adminToken },
      { role: 'billing_officer', token: billingToken },
      { role: 'customer', token: customerToken },
      { role: 'meter_reader', token: readerToken },
    ] as const;

    const adminOnlyRoutes = [
      { method: 'GET', url: '/api/v1/users', allowedStatus: 200 },
      { method: 'GET', url: '/api/v1/audit-events', allowedStatus: 200 },
      { method: 'POST', url: '/api/v1/users', payload: {}, allowedStatus: 400 },
      {
        method: 'POST',
        url: '/api/v1/customer-invitations',
        payload: {},
        allowedStatus: 400,
      },
    ] as const;
    for (const endpoint of adminOnlyRoutes) {
      const anonymousResponse = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
        ...('payload' in endpoint ? { payload: endpoint.payload } : {}),
      });
      expect(anonymousResponse.statusCode).toBe(401);
      for (const identity of roleTokens) {
        const response = await app.inject({
          method: endpoint.method,
          url: endpoint.url,
          headers: { authorization: `Bearer ${identity.token}` },
          ...('payload' in endpoint ? { payload: endpoint.payload } : {}),
        });
        expect(response.statusCode).toBe(identity.role === 'admin' ? endpoint.allowedStatus : 403);
      }
    }
    for (const identity of roleTokens) {
      const profile = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${identity.token}` },
      });
      expect(profile.statusCode).toBe(200);
      expect(profile.json().role).toBe(identity.role);
    }
    const excessiveAuditLimit = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-events?limit=101',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(excessiveAuditLimit.statusCode).toBe(400);
    const auditPage = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-events?limit=20',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(auditPage.statusCode).toBe(200);
    for (const event of auditPage.json().items) {
      expect(Object.keys(event).sort()).toEqual(
        ['id', 'action', 'outcome', 'actorUserId', 'targetType', 'targetId', 'createdAt'].sort(),
      );
    }

    const staffUserResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: `staff-created-${runId}@example.test`,
        password: 'integration-staff-created-password',
        name: 'Audit Integration Staff',
        role: 'billing_officer',
      },
    });
    expect(staffUserResponse.statusCode).toBe(201);
    staffCreatedUserId = staffUserResponse.json().id;
    await expect(
      prisma.securityAuditEvent.findFirst({
        where: {
          action: 'auth.staff_user.created',
          actorUserId: adminId,
          targetId: staffCreatedUserId,
        },
      }),
    ).resolves.not.toBeNull();

    const unauthenticatedInvite = await app.inject({
      method: 'POST',
      url: '/api/v1/customer-invitations',
      payload: { customerId },
    });
    const nonAdminInvite = await app.inject({
      method: 'POST',
      url: '/api/v1/customer-invitations',
      headers: { authorization: `Bearer ${billingToken}` },
      payload: { customerId },
    });
    const invitationResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/customer-invitations',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { customerId },
    });

    expect(unauthenticatedInvite.statusCode).toBe(401);
    expect(nonAdminInvite.statusCode).toBe(403);
    expect(invitationResponse.statusCode).toBe(201);
    const invitation = invitationResponse.json();
    expect(invitation.email).toBe(registrationEmail);
    expect(invitation.expiresAt).toBeTruthy();
    expect(invitation.invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(
      prisma.securityAuditEvent.findFirst({
        where: {
          action: 'customer.registration.invitation.issued',
          actorUserId: adminId,
          targetId: customerId,
        },
      }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.customerRegistrationInvitation.findUnique({
        where: { tokenHash: hashCustomerRegistrationToken(invitation.invitationToken) },
      }),
    ).resolves.toMatchObject({
      email: registrationEmail,
      customerId,
      accountIds,
      redeemedAt: null,
    });

    const redemptionResponses = await Promise.all(
      Array.from({ length: 2 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/register',
          payload: {
            invitationToken: invitation.invitationToken,
            password: 'verified-customer-password',
          },
        }),
      ),
    );
    const registration = redemptionResponses.find((response) => response.statusCode === 201);
    const concurrentRedemption = redemptionResponses.find((response) => response !== registration);
    if (!registration || !concurrentRedemption) {
      throw new Error('Expected exactly one customer registration invitation redemption.');
    }
    expect(registration.statusCode).toBe(201);
    expect([400, 409]).toContain(concurrentRedemption.statusCode);
    const registeredUser = registration.json();
    registrationUserId = registeredUser.id;
    expect(registeredUser).toMatchObject({
      email: registrationEmail,
      role: 'customer',
      name: 'Verified Integration Customer',
    });
    expect(registeredUser.emailVerifiedAt).toBeTruthy();
    await expect(
      prisma.securityAuditEvent.count({
        where: {
          action: 'customer.registration.completed',
          targetId: registeredUser.id,
        },
      }),
    ).resolves.toBe(1);
    await expect(store.listCustomerAccountLinks(registeredUser.id)).resolves.toEqual(
      expect.arrayContaining(
        accountIds.map((accountId) =>
          expect.objectContaining({ customerId, accountId, userId: registeredUser.id }),
        ),
      ),
    );

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/login',
      payload: { email: registrationEmail, password: 'verified-customer-password' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.role).toBe('customer');
    await expect(
      prisma.securityAuditEvent.findFirst({
        where: {
          action: 'auth.login.succeeded',
          actorUserId: registeredUser.id,
        },
      }),
    ).resolves.not.toBeNull();

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/register',
      payload: {
        invitationToken: invitation.invitationToken,
        password: 'different-customer-password',
      },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe('INVALID_REGISTRATION_INVITATION');
    await expect(
      prisma.securityAuditEvent.findFirst({
        where: {
          action: 'customer.registration.rejected',
          outcome: 'DENIED',
        },
      }),
    ).resolves.not.toBeNull();

    const publicUsers = await app.inject({ method: 'GET', url: '/api/v1/users' });
    const customerRoleProvisioning = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: `direct-${runId}@example.test`,
        password: 'direct-customer-password',
        name: 'Direct Customer',
        role: 'customer',
      },
    });
    expect(publicUsers.statusCode).toBe(401);
    expect(customerRoleProvisioning.statusCode).toBe(400);
  });
});
