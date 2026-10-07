import { describe, expect, it } from 'vitest';
import {
  canAccessCustomerRoute,
  customerRouteMethods,
  isPublicCustomerRoute,
  publicCustomerRoutes,
} from '../src/permissions.js';
import { jwtConfig, tokenForRole } from './jwt-fixture.js';
import { verifyAccessToken } from '@aquaflow/authentication';

const roles = ['admin', 'billing_officer', 'customer', 'meter_reader'] as const;
const methods = ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'];

describe('Customer Service authorization policy', () => {
  it('enforces the complete declared role-by-route-and-method matrix', () => {
    for (const [route, routeMethods] of Object.entries(customerRouteMethods)) {
      for (const role of roles) {
        for (const method of methods) {
          const implementedMethod =
            routeMethods.includes(method) || (method === 'HEAD' && routeMethods.includes('GET'));
          const expected =
            implementedMethod &&
            (role === 'admin' ||
              (role === 'billing_officer' &&
                ['GET', 'HEAD'].includes(method) &&
                routeMethods.includes('GET')));
          expect(canAccessCustomerRoute(role, method, route)).toBe(expected);
        }
      }
    }
    expect(canAccessCustomerRoute('admin', 'GET', '/api/v1/unlisted-route')).toBe(false);
    expect(canAccessCustomerRoute('admin', 'GET', undefined)).toBe(false);
  });

  it('keeps only operational probes and the API document public', () => {
    for (const route of publicCustomerRoutes) {
      expect(isPublicCustomerRoute(route)).toBe(true);
    }
    expect(isPublicCustomerRoute('/api/v1/info')).toBe(false);
    expect(isPublicCustomerRoute(undefined)).toBe(false);
  });

  it('issues tokens that satisfy the shared Customer Service verifier', () => {
    const token = tokenForRole('billing_officer');
    expect(verifyAccessToken(token, jwtConfig)).toMatchObject({
      sub: 'test-billing_officer',
      role: 'billing_officer',
    });
  });
});
