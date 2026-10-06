import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  Customer as CustomerModel,
  CustomerStatus as CustomerStatusModel,
  AccountClassification as AccountClassificationModel,
  AccountStatus as AccountStatusModel,
  MeterStatus as MeterStatusModel,
} from '@prisma/client';
import type {
  AccountListQuery,
  AccountClassification,
  AccountStatus,
  Customer,
  CustomerListQuery,
  CustomerStatus,
  Meter,
  MeterInstallationHistory,
  MeterStatus,
  PageResult,
  ServiceAccount,
} from './domain.js';
import { CustomerConflictError, CustomerNotFoundError } from './errors.js';
import {
  assertCanInstallMeter,
  assertCanReplaceMeter,
  createReplacementRegisterValues,
} from './meter-lifecycle.js';
import { buildCustomerSeedData, seedZones, type SeedZoneName } from './seed-data.js';

const customerStatusToModel: Record<CustomerStatus, CustomerStatusModel> = {
  active: 'ACTIVE',
  inactive: 'INACTIVE',
  archived: 'ARCHIVED',
};

const customerStatusToDomain: Record<CustomerStatusModel, CustomerStatus> = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
};

const accountStatusToModel: Record<AccountStatus, AccountStatusModel> = {
  active: 'ACTIVE',
  inactive: 'INACTIVE',
};

const accountStatusToDomain: Record<AccountStatusModel, AccountStatus> = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

const classificationToModel: Record<AccountClassification, AccountClassificationModel> = {
  Residential: 'RESIDENTIAL',
  Commercial: 'COMMERCIAL',
  Industrial: 'INDUSTRIAL',
  Government: 'GOVERNMENT',
};

const classificationToDomain: Record<AccountClassificationModel, AccountClassification> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  INDUSTRIAL: 'Industrial',
  GOVERNMENT: 'Government',
};

const meterStatusToDomain: Record<MeterStatusModel, MeterStatus> = {
  ACTIVE: 'active',
  RETIRED: 'retired',
};

const activeInstallations = {
  where: { removedAt: null },
  select: { meterId: true },
};

const accountInclude = {
  meterInstallations: activeInstallations,
  serviceAddress: { include: { zone: true } },
};

export class CustomerStore {
  constructor(private readonly prisma: PrismaClient) {}

  async seed(): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const zoneIds: Record<SeedZoneName, string> = {
        North: '',
        Central: '',
        South: '',
      };
      for (const zoneSeed of seedZones) {
        const zone = await transaction.zone.upsert({
          where: { name: zoneSeed.name },
          update: {},
          create: zoneSeed,
        });
        zoneIds[zoneSeed.name] = zone.id;
      }

      const seed = buildCustomerSeedData(zoneIds);
      await transaction.customer.createMany({ data: seed.customers, skipDuplicates: true });
      await transaction.serviceAddress.createMany({
        data: seed.addresses,
        skipDuplicates: true,
      });
      await transaction.account.createMany({ data: seed.accounts, skipDuplicates: true });
      await transaction.meter.createMany({ data: seed.meters, skipDuplicates: true });
      await transaction.meterInstallation.createMany({
        data: seed.installations,
        skipDuplicates: true,
      });
    });
  }

  async listCustomers(query: CustomerListQuery): Promise<PageResult<Customer>> {
    const where: Prisma.CustomerWhereInput = {
      ...(query.status ? { status: customerStatusToModel[query.status] } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    const items = customers.map((customer) => this.toCustomer(customer));
    return { items, count: items.length, page: query.page, limit: query.limit, total };
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    return customer ? this.toCustomer(customer) : undefined;
  }

  async createCustomer(input: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
    const customer = await this.prisma.customer.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        status: customerStatusToModel[input.status],
      },
    });

    return this.toCustomer(customer);
  }

  async listAccounts(query: AccountListQuery): Promise<PageResult<ServiceAccount>> {
    const filters: Prisma.AccountWhereInput[] = [];
    if (query.customerId) {
      filters.push({ customerId: query.customerId });
    }
    if (query.status) {
      filters.push({ status: accountStatusToModel[query.status] });
    }
    if (query.classification) {
      filters.push({ classification: classificationToModel[query.classification] });
    }
    if (query.zone) {
      filters.push({
        serviceAddress: {
          is: { zone: { is: { name: { equals: query.zone, mode: 'insensitive' } } } },
        },
      });
    }
    if (query.q) {
      filters.push({
        OR: [
          {
            serviceAddress: {
              is: { addressLine: { contains: query.q, mode: 'insensitive' } },
            },
          },
          { customer: { is: { name: { contains: query.q, mode: 'insensitive' } } } },
          { customer: { is: { email: { contains: query.q, mode: 'insensitive' } } } },
        ],
      });
    }

    const where: Prisma.AccountWhereInput = filters.length > 0 ? { AND: filters } : {};
    const [accounts, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        include: accountInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.account.count({ where }),
    ]);

    const items = accounts.map((account) => this.toAccount(account));
    return { items, count: items.length, page: query.page, limit: query.limit, total };
  }

  async createAccount(input: Omit<ServiceAccount, 'id' | 'createdAt'>): Promise<ServiceAccount> {
    const account = await this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true },
      });
      if (!customer) {
        throw new CustomerNotFoundError('Customer not found.');
      }

      const zone = await transaction.zone.upsert({
        where: { name: input.zone },
        update: {},
        create: { name: input.zone },
      });
      const serviceAddress = await transaction.serviceAddress.create({
        data: { addressLine: input.address, zoneId: zone.id },
      });

      return transaction.account.create({
        data: {
          customerId: input.customerId,
          serviceAddressId: serviceAddress.id,
          classification: classificationToModel[input.classification],
          status: accountStatusToModel[input.status],
        },
        include: accountInclude,
      });
    });

    return this.toAccount(account);
  }

  async getAccount(id: string): Promise<ServiceAccount | undefined> {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: accountInclude,
    });
    return account ? this.toAccount(account) : undefined;
  }

  async setAccountStatus(id: string, status: AccountStatus): Promise<ServiceAccount> {
    try {
      const account = await this.prisma.account.update({
        where: { id },
        data: { status: accountStatusToModel[status] },
        include: accountInclude,
      });
      return this.toAccount(account);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new CustomerNotFoundError('Account not found.', 'ACCOUNT_NOT_FOUND');
      }
      throw error;
    }
  }

  async listAccountMeterHistory(id: string): Promise<MeterInstallationHistory[]> {
    const account = await this.prisma.account.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!account) {
      throw new CustomerNotFoundError('Account not found.', 'ACCOUNT_NOT_FOUND');
    }

    const installations = await this.prisma.meterInstallation.findMany({
      where: { accountId: id },
      include: { meter: true },
      orderBy: [{ installedAt: 'asc' }, { id: 'asc' }],
    });
    return installations.map((installation) => ({
      installationId: installation.id,
      meterId: installation.meterId,
      serialNumber: installation.meter.serialNumber,
      size: installation.meter.size,
      registerDigits: installation.meter.registerDigits,
      status: installation.removedAt ? 'retired' : meterStatusToDomain[installation.meter.status],
      installedAt: installation.installedAt.toISOString(),
      removedAt: installation.removedAt?.toISOString() ?? null,
      initialReading: Number(installation.initialRegisterValue.toString()),
      finalReading:
        installation.finalRegisterValue === null
          ? null
          : Number(installation.finalRegisterValue.toString()),
    }));
  }

  async listMeters(): Promise<Meter[]> {
    const meters = await this.prisma.meter.findMany({
      where: { installations: { some: {} } },
      include: {
        installations: {
          orderBy: { installedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return meters.flatMap(({ installations, ...meter }) => {
      const installation = installations[0];
      if (!installation) {
        return [];
      }

      return [
        {
          id: meter.id,
          accountId: installation.accountId,
          serialNumber: meter.serialNumber,
          size: meter.size,
          registerDigits: meter.registerDigits,
          currentReading: Number(
            (installation.finalRegisterValue ?? installation.initialRegisterValue).toString(),
          ),
          status: installation.removedAt ? 'retired' : meterStatusToDomain[meter.status],
          installedAt: installation.installedAt.toISOString(),
          replacedAt: installation.removedAt?.toISOString() ?? null,
        },
      ];
    });
  }

  async installMeter(input: Omit<Meter, 'id' | 'installedAt' | 'replacedAt'>): Promise<Meter> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const account = await transaction.account.findUnique({
          where: { id: input.accountId },
          include: { meterInstallations: activeInstallations },
        });
        if (!account) {
          throw new CustomerNotFoundError('Account not found.', 'ACCOUNT_NOT_FOUND');
        }

        const existingMeter = await transaction.meter.findUnique({
          where: { serialNumber: input.serialNumber },
          select: { id: true },
        });
        assertCanInstallMeter({
          accountHasActiveMeter: account.meterInstallations.length > 0,
          serialNumberAlreadyExists: existingMeter !== null,
        });

        const meter = await transaction.meter.create({
          data: {
            serialNumber: input.serialNumber,
            size: input.size,
            registerDigits: input.registerDigits,
            status: 'ACTIVE',
          },
        });
        const installedAt = new Date();
        const installation = await transaction.meterInstallation.create({
          data: {
            accountId: input.accountId,
            meterId: meter.id,
            installedAt,
            initialRegisterValue: new Prisma.Decimal(input.currentReading),
          },
        });

        return {
          id: meter.id,
          accountId: installation.accountId,
          serialNumber: meter.serialNumber,
          size: meter.size,
          registerDigits: meter.registerDigits,
          currentReading: Number(installation.initialRegisterValue.toString()),
          status: 'active',
          installedAt: installedAt.toISOString(),
          replacedAt: null,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CustomerConflictError(
          'A meter with this serial number or account installation already exists.',
        );
      }
      throw error;
    }
  }

  async replaceMeter(input: {
    accountId: string;
    oldMeterId: string;
    finalReading: number;
    replacementAt?: string;
    newMeter: Meter;
  }): Promise<Meter> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const account = await transaction.account.findUnique({
          where: { id: input.accountId },
          include: {
            meterInstallations: {
              where: { removedAt: null },
              include: { meter: true },
            },
          },
        });
        if (!account) {
          throw new CustomerNotFoundError('Account not found.', 'ACCOUNT_NOT_FOUND');
        }

        const oldInstallation = account.meterInstallations.find(
          (installation) => installation.meterId === input.oldMeterId,
        );
        const existingMeter = await transaction.meter.findUnique({
          where: { serialNumber: input.newMeter.serialNumber },
          select: { id: true },
        });
        const { oldMeterFinalRegisterValue, newMeterInitialRegisterValue } =
          createReplacementRegisterValues(input.finalReading, input.newMeter.currentReading);
        if (!oldInstallation) {
          throw new CustomerNotFoundError(
            'Meter or account not found.',
            'METER_OR_ACCOUNT_NOT_FOUND',
          );
        }
        assertCanReplaceMeter({
          oldMeterIsCurrent: oldInstallation.meter.status === 'ACTIVE',
          serialNumberAlreadyExists: existingMeter !== null,
          previousRegisterValue: oldInstallation.initialRegisterValue,
          finalRegisterValue: oldMeterFinalRegisterValue,
        });

        const replacementAt = input.replacementAt ? new Date(input.replacementAt) : new Date();
        await transaction.meterInstallation.update({
          where: { id: oldInstallation.id },
          data: {
            removedAt: replacementAt,
            finalRegisterValue: oldMeterFinalRegisterValue,
          },
        });
        await transaction.meter.update({
          where: { id: oldInstallation.meterId },
          data: { status: 'RETIRED' },
        });
        const newMeter = await transaction.meter.create({
          data: {
            id: input.newMeter.id,
            serialNumber: input.newMeter.serialNumber,
            size: input.newMeter.size,
            registerDigits: input.newMeter.registerDigits,
            status: 'ACTIVE',
          },
        });
        const newInstallation = await transaction.meterInstallation.create({
          data: {
            accountId: input.accountId,
            meterId: newMeter.id,
            installedAt: replacementAt,
            initialRegisterValue: newMeterInitialRegisterValue,
          },
        });

        return {
          id: newMeter.id,
          accountId: newInstallation.accountId,
          serialNumber: newMeter.serialNumber,
          size: newMeter.size,
          registerDigits: newMeter.registerDigits,
          currentReading: Number(newInstallation.initialRegisterValue.toString()),
          status: 'active',
          installedAt: replacementAt.toISOString(),
          replacedAt: null,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CustomerConflictError(
          'A meter with this serial number or account installation already exists.',
        );
      }
      throw error;
    }
  }

  private toCustomer(customer: CustomerModel): Customer {
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      status: customerStatusToDomain[customer.status],
      createdAt: customer.createdAt.toISOString(),
    };
  }

  private toAccount(
    account: Prisma.AccountGetPayload<{ include: typeof accountInclude }>,
  ): ServiceAccount {
    return {
      id: account.id,
      customerId: account.customerId,
      address: account.serviceAddress.addressLine,
      zone: account.serviceAddress.zone.name,
      classification: classificationToDomain[account.classification],
      status: accountStatusToDomain[account.status],
      activeMeterId: account.meterInstallations[0]?.meterId ?? null,
      createdAt: account.createdAt.toISOString(),
    };
  }
}
