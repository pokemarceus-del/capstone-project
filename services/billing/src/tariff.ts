export interface BillInput {
  consumption: number;
  arrears: number;
  meterSizeInches?: number;
  classification?: string;
}

const roundToCents = (value: number): number => Math.round(value * 100) / 100;

export function calculateBill(input: BillInput): {
  basicCharge: number;
  environmentalFee: number;
  meterMaintenance: number;
  vat: number;
  penalty: number;
  total: number;
} {
  const consumption = Math.max(input.consumption, 0);
  const arrears = Math.max(input.arrears, 0);
  const meterSize = input.meterSizeInches ?? 0.5;

  const block2Units = Math.min(Math.max(consumption - 10, 0), 10);
  const block3Units = Math.min(Math.max(consumption - 20, 0), 10);
  const block4Units = Math.min(Math.max(consumption - 30, 0), 10);
  const block5Units = Math.max(consumption - 40, 0);

  let basicCharge = 250;
  basicCharge += block2Units * 30;
  basicCharge += block3Units * 35;
  basicCharge += block4Units * 42;
  basicCharge += block5Units * 50;

  const environmentalFee = roundToCents(basicCharge * 0.1);
  const meterMaintenance = meterSize === 0.5 ? 15 : 0;
  const subtotal = roundToCents(basicCharge + environmentalFee + meterMaintenance);
  const vat = roundToCents(subtotal * 0.12);
  const billTotal = roundToCents(subtotal + vat);
  const penalty = roundToCents(arrears * 0.1);
  const total = roundToCents(billTotal + arrears + penalty);

  return {
    basicCharge: roundToCents(basicCharge),
    environmentalFee: roundToCents(environmentalFee),
    meterMaintenance,
    vat: roundToCents(vat),
    penalty: roundToCents(penalty),
    total: roundToCents(total),
  };
}
