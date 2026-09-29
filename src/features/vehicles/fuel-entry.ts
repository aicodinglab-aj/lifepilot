import { validDate } from '@/features/personal/date';
import { MAX_AMOUNT_PAISE, parseMoney } from '@/features/personal/money';
import { fuelTypes } from './vehicle';

export type RefuelFuel = 'Petrol' | 'Diesel' | 'CNG';
export type ChargingLocation = 'Home' | 'Work' | 'Public' | 'Other';
export type FuelUnit = 'L' | 'kg' | 'kWh';
type CommonInput = { date: string; odometerKm: string; totalCost: string; location?: string; notes?: string };
export type FuelInput = CommonInput & (
  { kind: 'refuel'; fuelType: RefuelFuel; quantity: string; pricePerUnit?: string; fullTank: boolean }
  | { kind: 'charge'; energyKwh: string; pricePerKwh?: string; chargeBeforePercent?: number | null;
    chargeAfterPercent?: number | null; chargingLocation?: ChargingLocation | null }
);
type CommonDraft = { date: string; odometerMetres: number; costPaise: number; location: string | null; notes: string | null };
export type FuelDraft = CommonDraft & (
  { kind: 'refuel'; fuelType: RefuelFuel; quantityMilliUnits: number; pricePerUnitPaise: number | null; fullTank: boolean }
  | { kind: 'charge'; energyMilliKwh: number; pricePerKwhPaise: number | null; chargeBeforePercent: number | null;
    chargeAfterPercent: number | null; chargingLocation: ChargingLocation | null }
);
export type FuelEntry = FuelDraft & { id: number; vehicleId: number; createdAt: string; updatedAt: string };
export const FUEL_PAGE_SIZE = 40;

export function requireFuelId(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Select a valid vehicle or entry.');
}
function milli(input: string, label: string, maximum: number, allowZero = false) {
  if (typeof input !== 'string' || !/^\d+(\.\d{1,3})?$/.test(input.trim())) {
    throw new Error(`${label} must be a non-negative decimal with at most three decimal places.`);
  }
  const [whole, fraction = ''] = input.trim().split('.');
  const value = BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, '0'));
  if (value < BigInt(allowZero ? 0 : 1) || value > BigInt(maximum)) throw new Error(`${label} is outside the supported range.`);
  return Number(value);
}
function money(input: string) {
  if (typeof input !== 'string') throw new Error('Enter a valid money amount.');
  // Vehicle costs may be zero (e.g. free charging), unlike personal transactions.
  const value = /^0+(\.0{1,2})?$/.test(input.trim()) ? 0 : parseMoney(input);
  if (value > MAX_AMOUNT_PAISE) throw new Error('Amount is too large.');
  return value;
}
function optionalMoney(value?: string) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  return money(value);
}
function text(value: string | undefined, maximum: number) {
  if (value !== undefined && typeof value !== 'string') throw new Error('Enter valid text.');
  const trimmed = value?.trim() ?? '';
  if (trimmed.length > maximum) throw new Error(`Text must be ${maximum} characters or fewer.`);
  return trimmed || null;
}
function percent(value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error('Charge percentage must be an integer from 0 to 100.');
  return value;
}

export function validateFuelInput(input: FuelInput): FuelDraft {
  if (typeof input.date !== 'string' || !validDate(input.date.trim())) throw new Error('Enter a real date as YYYY-MM-DD.');
  const common: CommonDraft = { date: input.date.trim(), odometerMetres: milli(input.odometerKm, 'Odometer', 999999999999, true),
    costPaise: money(input.totalCost), location: text(input.location, 200), notes: text(input.notes, 2000) };
  if (input.kind === 'refuel') {
    if (!['Petrol', 'Diesel', 'CNG'].includes(input.fuelType) || typeof input.fullTank !== 'boolean') throw new Error('Select fuel and full-tank status.');
    return { ...common, kind: 'refuel', fuelType: input.fuelType, fullTank: input.fullTank,
      quantityMilliUnits: milli(input.quantity, 'Fuel quantity', 999999999), pricePerUnitPaise: optionalMoney(input.pricePerUnit) };
  }
  if (input.kind !== 'charge') throw new Error('Select refuelling or charging.');
  const before = percent(input.chargeBeforePercent), after = percent(input.chargeAfterPercent);
  if (before !== null && after !== null && after < before) throw new Error('Charge after cannot be below charge before.');
  const chargingLocation = input.chargingLocation ?? null;
  if (chargingLocation !== null && !['Home', 'Work', 'Public', 'Other'].includes(chargingLocation)) throw new Error('Select a valid charging location.');
  return { ...common, kind: 'charge', energyMilliKwh: milli(input.energyKwh, 'Energy added', 999999999),
    pricePerKwhPaise: optionalMoney(input.pricePerKwh), chargeBeforePercent: before, chargeAfterPercent: after, chargingLocation };
}

export function validateFuelForVehicle(draft: FuelDraft, vehicleFuel: string) {
  if (!fuelTypes.some(type => type === vehicleFuel)) throw new Error('Update the vehicle fuel type before adding an entry.');
  // Hybrid/Other lack powertrain detail: accept explicitly entered energy sources,
  // but never infer isolated fuel economy for them.
  if (vehicleFuel === 'Hybrid' || vehicleFuel === 'Other') return;
  if (draft.kind === 'charge' ? vehicleFuel !== 'Electric' : draft.fuelType !== vehicleFuel) {
    throw new Error('This energy source does not match the vehicle fuel type.');
  }
}
export const fuelUnit = (entry: Pick<FuelEntry, 'kind'> & { fuelType?: RefuelFuel }): FuelUnit =>
  entry.kind === 'charge' ? 'kWh' : entry.fuelType === 'CNG' ? 'kg' : 'L';
export const fuelQuantity = (entry: FuelDraft) => entry.kind === 'charge' ? entry.energyMilliKwh : entry.quantityMilliUnits;
