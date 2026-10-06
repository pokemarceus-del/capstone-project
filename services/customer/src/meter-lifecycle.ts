import { Prisma } from '@prisma/client';
import { CustomerConflictError } from './errors.js';

export function assertCanInstallMeter(input: {
  accountHasActiveMeter: boolean;
  serialNumberAlreadyExists: boolean;
}): void {
  if (input.accountHasActiveMeter) {
    throw new CustomerConflictError('Account already has an active meter.');
  }

  if (input.serialNumberAlreadyExists) {
    throw new CustomerConflictError('Meter serial number is already registered.');
  }
}

export function assertCanReplaceMeter(input: {
  oldMeterIsCurrent: boolean;
  serialNumberAlreadyExists: boolean;
  previousRegisterValue: Prisma.Decimal;
  finalRegisterValue: Prisma.Decimal;
}): void {
  if (!input.oldMeterIsCurrent) {
    throw new CustomerConflictError('Meter is not the account active meter.');
  }

  if (input.serialNumberAlreadyExists) {
    throw new CustomerConflictError('Meter serial number is already registered.');
  }

  if (input.finalRegisterValue.lessThan(input.previousRegisterValue)) {
    throw new CustomerConflictError('Final reading cannot be lower than the previous reading.');
  }
}

export function createReplacementRegisterValues(
  oldMeterFinalReading: number,
  newMeterInitialReading: number,
): {
  oldMeterFinalRegisterValue: Prisma.Decimal;
  newMeterInitialRegisterValue: Prisma.Decimal;
} {
  return {
    oldMeterFinalRegisterValue: new Prisma.Decimal(oldMeterFinalReading),
    newMeterInitialRegisterValue: new Prisma.Decimal(newMeterInitialReading),
  };
}
