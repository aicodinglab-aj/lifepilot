import { fuelQuantity, fuelUnit, type FuelEntry, type FuelUnit } from './fuel-entry';

// Exact ratios are JSON-safe. Round only for presentation, never when summing costs.
export type ExactRatio = { numerator: string; denominator: string };
export function ratio(numerator: bigint, denominator: bigint): ExactRatio | null {
  return denominator > BigInt(0) ? { numerator: numerator.toString(), denominator: denominator.toString() } : null;
}
export function formatFuelRatio(value: ExactRatio | null, decimals = 2): string | null {
  if (!value) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new Error('Invalid decimal precision.');
  const scale = BigInt(10) ** BigInt(decimals), denominator = BigInt(value.denominator);
  if (denominator <= BigInt(0) || BigInt(value.numerator) < BigInt(0)) throw new Error('Invalid ratio.');
  const rounded = (BigInt(value.numerator) * scale * BigInt(2) + denominator) / (denominator * BigInt(2));
  return decimals ? `${rounded / scale}.${(rounded % scale).toString().padStart(decimals, '0')}` : rounded.toString();
}
export function distanceBetweenEntries(start: FuelEntry, end: FuelEntry): number | null {
  const ordered = start.date < end.date || (start.date === end.date && start.id < end.id);
  return start.vehicleId === end.vehicleId && ordered && end.odometerMetres > start.odometerMetres
    ? end.odometerMetres - start.odometerMetres : null;
}
export const actualFuelUnitPrice = (entry: FuelEntry) => ratio(BigInt(entry.costPaise) * BigInt(1000), BigInt(fuelQuantity(entry)));
export type FuelEfficiency = {
  startEntryId: number; endEntryId: number; startDate: string; endDate: string;
  distanceMetres: number; quantityMilli: string; intervalCostPaise: string; unit: FuelUnit;
  kmPerUnit: ExactRatio; costPaisePerKm: ExactRatio;
};

// Feed the COMPLETE history newest first, including partial fills and other
// energy kinds. Never filter them away: they may invalidate a candidate interval.
export function createFuelEfficiencyScanner(vehicleFuel: string) {
  let end: FuelEntry | null = null, previous: FuelEntry | null = null;
  let quantity = BigInt(0), cost = BigInt(0);
  const eligible = (entry: FuelEntry) => vehicleFuel === 'Electric'
    ? entry.kind === 'charge'
    : entry.kind === 'refuel' && entry.fuelType === vehicleFuel;
  const boundary = (entry: FuelEntry) => entry.kind === 'charge' ? entry.chargeAfterPercent === 100 : entry.fullTank;
  const reset = (entry: FuelEntry) => {
    end = eligible(entry) && boundary(entry) ? entry : null;
    previous = end;
    quantity = end ? BigInt(fuelQuantity(end)) : BigInt(0);
    cost = end ? BigInt(end.costPaise) : BigInt(0);
  };
  return {
    push(entry: FuelEntry): FuelEfficiency | null {
      if (!['Petrol', 'Diesel', 'CNG', 'Electric'].includes(vehicleFuel)) return null;
      if (!end || !previous || !eligible(entry) || distanceBetweenEntries(entry, previous) === null) {
        reset(entry); return null;
      }
      if (boundary(entry)) {
        const distanceMetres = end.odometerMetres - entry.odometerMetres;
        const result: FuelEfficiency = { startEntryId: entry.id, endEntryId: end.id, startDate: entry.date, endDate: end.date,
          distanceMetres, quantityMilli: quantity.toString(), intervalCostPaise: cost.toString(), unit: fuelUnit(end),
          kmPerUnit: { numerator: String(distanceMetres), denominator: quantity.toString() },
          costPaisePerKm: { numerator: (cost * BigInt(1000)).toString(), denominator: String(distanceMetres) } };
        reset(entry);
        return result;
      }
      previous = entry;
      quantity += BigInt(fuelQuantity(entry)); cost += BigInt(entry.costPaise);
      return null;
    },
  };
}
