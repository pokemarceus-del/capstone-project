import { z } from 'zod';

const customerResponseSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  status: z.enum(['active', 'inactive', 'archived']),
});

const accountPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      customerId: z.string().uuid(),
      status: z.enum(['active', 'inactive']),
    }),
  ),
  page: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export class CustomerDirectoryNotFoundError extends Error {
  constructor() {
    super('The specified customer does not have a valid account.');
    this.name = 'CustomerDirectoryNotFoundError';
  }
}

export class CustomerDirectoryConflictError extends Error {
  constructor() {
    super('An invitation can only be issued to an active customer.');
    this.name = 'CustomerDirectoryConflictError';
  }
}

export class CustomerDirectoryUnavailableError extends Error {
  constructor() {
    super('Customer Service could not verify the registration invitation.');
    this.name = 'CustomerDirectoryUnavailableError';
  }
}

export interface VerifiedCustomer {
  customerId: string;
  email: string;
  name: string;
  accountIds: string[];
}

export class CustomerDirectory {
  constructor(
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async getVerifiedCustomer(customerId: string, authorization: string): Promise<VerifiedCustomer> {
    const customerResponse = await this.get(
      `/api/v1/customers/${encodeURIComponent(customerId)}`,
      authorization,
    );
    if (customerResponse.status === 404) {
      throw new CustomerDirectoryNotFoundError();
    }
    if (!customerResponse.ok) {
      throw new CustomerDirectoryUnavailableError();
    }

    const customer = customerResponseSchema.safeParse(await this.parseJson(customerResponse));
    if (!customer.success) {
      throw new CustomerDirectoryUnavailableError();
    }
    if (customer.data.status !== 'active') {
      throw new CustomerDirectoryConflictError();
    }

    const accountIds: string[] = [];
    let page = 1;
    let total = 0;
    do {
      const accountsResponse = await this.get(
        `/api/v1/accounts?customerId=${encodeURIComponent(customerId)}&page=${page}&limit=100`,
        authorization,
      );
      if (!accountsResponse.ok) {
        throw new CustomerDirectoryUnavailableError();
      }
      const result = accountPageSchema.safeParse(await this.parseJson(accountsResponse));
      if (!result.success || result.data.page !== page) {
        throw new CustomerDirectoryUnavailableError();
      }
      if (result.data.items.some((account) => account.customerId !== customerId)) {
        throw new CustomerDirectoryUnavailableError();
      }
      if (result.data.items.length === 0 && accountIds.length < result.data.total) {
        throw new CustomerDirectoryUnavailableError();
      }
      accountIds.push(...result.data.items.map((account) => account.id));
      total = result.data.total;
      page += 1;
    } while (accountIds.length < total);

    if (accountIds.length === 0) {
      throw new CustomerDirectoryNotFoundError();
    }

    return {
      customerId,
      email: customer.data.email,
      name: customer.data.name,
      accountIds,
    };
  }

  private async get(path: string, authorization: string): Promise<Response> {
    const url = new URL(path, this.baseUrl);
    try {
      return await this.request(url, {
        method: 'GET',
        headers: { authorization },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new CustomerDirectoryUnavailableError();
    }
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new CustomerDirectoryUnavailableError();
    }
  }
}
