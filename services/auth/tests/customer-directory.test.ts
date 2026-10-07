import { describe, expect, it, vi } from 'vitest';
import {
  CustomerDirectory,
  CustomerDirectoryConflictError,
  CustomerDirectoryNotFoundError,
  CustomerDirectoryUnavailableError,
} from '../src/customer-directory.js';

const customerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firstAccountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secondAccountId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('Customer registration verification directory', () => {
  it('uses the Admin token to verify a customer and all accounts across pages', async () => {
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input.toString());
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer admin-token');
      if (url.pathname === `/api/v1/customers/${customerId}`) {
        return new Response(
          JSON.stringify({
            id: customerId,
            name: 'Verified Customer',
            email: 'customer@example.test',
            phone: '+1-555-0199',
            status: 'active',
          }),
        );
      }
      const page = Number(url.searchParams.get('page'));
      return new Response(
        JSON.stringify({
          items:
            page === 1
              ? [{ id: firstAccountId, customerId, status: 'active' }]
              : [{ id: secondAccountId, customerId, status: 'inactive' }],
          page,
          total: 2,
        }),
      );
    });
    const directory = new CustomerDirectory('http://customer:3001', request);

    await expect(directory.getVerifiedCustomer(customerId, 'Bearer admin-token')).resolves.toEqual({
      customerId,
      email: 'customer@example.test',
      name: 'Verified Customer',
      accountIds: [firstAccountId, secondAccountId],
    });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('rejects unknown or unlinked customers', async () => {
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input.toString());
      if (url.pathname.includes('/customers/')) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      return new Response(JSON.stringify({ items: [], page: 1, total: 0 }));
    });
    const directory = new CustomerDirectory('http://customer:3001', request);

    await expect(
      directory.getVerifiedCustomer(customerId, 'Bearer admin-token'),
    ).rejects.toBeInstanceOf(CustomerDirectoryNotFoundError);
  });

  it('does not issue invitations for inactive customers', async () => {
    const request = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            id: customerId,
            name: 'Inactive Customer',
            email: 'inactive@example.test',
            phone: '+1-555-0199',
            status: 'inactive',
          }),
        ),
    );
    const directory = new CustomerDirectory('http://customer:3001', request);

    await expect(
      directory.getVerifiedCustomer(customerId, 'Bearer admin-token'),
    ).rejects.toBeInstanceOf(CustomerDirectoryConflictError);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('fails explicitly when Customer Service is unavailable', async () => {
    const request = vi.fn<typeof fetch>(async () => {
      throw new Error('connection refused');
    });
    const directory = new CustomerDirectory('http://customer:3001', request);

    await expect(
      directory.getVerifiedCustomer(customerId, 'Bearer admin-token'),
    ).rejects.toBeInstanceOf(CustomerDirectoryUnavailableError);
  });
});
