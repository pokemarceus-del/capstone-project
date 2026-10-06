import { Prisma } from '@prisma/client';

export const seedZones = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'North' },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Central' },
  { id: '10000000-0000-4000-8000-000000000003', name: 'South' },
] as const;

export type SeedZoneName = (typeof seedZones)[number]['name'];

const defaultZoneIds: Record<SeedZoneName, string> = {
  North: seedZones[0].id,
  Central: seedZones[1].id,
  South: seedZones[2].id,
};

const seedTimestamp = new Date('2025-01-01T00:00:00.000Z');
const originalInstallationDate = new Date('2024-01-01T00:00:00.000Z');
const replacementDate = seedTimestamp;

function seedId(prefix: string, index: number): string {
  return `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

export function buildCustomerSeedData(zoneIds: Record<SeedZoneName, string> = defaultZoneIds) {
  const customers: Prisma.CustomerCreateManyInput[] = Array.from({ length: 60 }, (_, index) => {
    const number = index + 1;
    return {
      id: number === 1 ? '00000000-0000-4000-8000-000000000003' : seedId('30000000', number),
      name: number === 1 ? 'AquaFlow Demo Customer' : `AquaFlow Demo Customer ${number}`,
      email: number === 1 ? 'demo@aquaflow.local' : `demo.customer${number}@aquaflow.local`,
      phone: number === 1 ? '+1-555-0100' : `+1-555-${String(100 + number).padStart(4, '0')}`,
      status: 'ACTIVE',
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    };
  });

  const addresses: Prisma.ServiceAddressCreateManyInput[] = Array.from(
    { length: 75 },
    (_, index) => {
      const number = index + 1;
      const zoneName = seedZones[index % seedZones.length].name;
      return {
        id: number === 1 ? '00000000-0000-4000-8000-000000000002' : seedId('20000000', number),
        addressLine: number === 1 ? '14 Riverbend Avenue' : `${100 + number} Riverbend Avenue`,
        zoneId: zoneIds[zoneName],
        createdAt: seedTimestamp,
        updatedAt: seedTimestamp,
      };
    },
  );

  const accounts: Prisma.AccountCreateManyInput[] = Array.from({ length: 75 }, (_, index) => {
    const number = index + 1;
    const customerNumber = number <= 15 ? number : number - 15;
    return {
      id: number === 1 ? '00000000-0000-4000-8000-000000000004' : seedId('40000000', number),
      customerId:
        customerNumber === 1
          ? '00000000-0000-4000-8000-000000000003'
          : seedId('30000000', customerNumber),
      serviceAddressId:
        number === 1 ? '00000000-0000-4000-8000-000000000002' : seedId('20000000', number),
      classification: 'RESIDENTIAL',
      status: 'ACTIVE',
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    };
  });

  const meters: Prisma.MeterCreateManyInput[] = Array.from({ length: 80 }, (_, index) => {
    const number = index + 1;
    return {
      id: seedId('50000000', number),
      serialNumber: `AF-MTR-${String(number).padStart(4, '0')}`,
      size: '0.5',
      registerDigits: 6,
      status: number <= 5 ? 'RETIRED' : 'ACTIVE',
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    };
  });

  const installations: Prisma.MeterInstallationCreateManyInput[] = [
    ...Array.from({ length: 5 }, (_, index) => {
      const accountNumber = index + 1;
      const meterNumber = index + 1;
      return {
        id: seedId('60000000', meterNumber),
        accountId:
          accountNumber === 1
            ? '00000000-0000-4000-8000-000000000004'
            : seedId('40000000', accountNumber),
        meterId: seedId('50000000', meterNumber),
        installedAt: originalInstallationDate,
        initialRegisterValue: new Prisma.Decimal(100 + accountNumber),
        removedAt: replacementDate,
        finalRegisterValue: new Prisma.Decimal(150 + accountNumber),
        createdAt: seedTimestamp,
        updatedAt: seedTimestamp,
      };
    }),
    ...Array.from({ length: 75 }, (_, index) => {
      const accountNumber = index + 1;
      const meterNumber = accountNumber + 5;
      return {
        id: seedId('60000000', meterNumber),
        accountId:
          accountNumber === 1
            ? '00000000-0000-4000-8000-000000000004'
            : seedId('40000000', accountNumber),
        meterId: seedId('50000000', meterNumber),
        installedAt: accountNumber <= 5 ? replacementDate : originalInstallationDate,
        initialRegisterValue: new Prisma.Decimal(accountNumber * 10),
        createdAt: seedTimestamp,
        updatedAt: seedTimestamp,
      };
    }),
  ];

  return { customers, addresses, accounts, meters, installations };
}
