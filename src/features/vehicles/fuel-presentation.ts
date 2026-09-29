import { localToday } from '@/features/personal/date';
import { formatMoney, moneyInput } from '@/features/personal/money';
import { formatFuelRatio, actualFuelUnitPrice, type ExactRatio } from './fuel-calculations';
import { fuelQuantity, fuelUnit, validateFuelInput, validateFuelForVehicle, type FuelEntry, type FuelInput, type RefuelFuel, type ChargingLocation } from './fuel-entry';
import type { Vehicle } from './vehicle';

export const fuelTitle = (type: string) => type === 'Electric' ? 'Charging' : ['Hybrid', 'Other'].includes(type) ? 'Fuel / Charging' : 'Fuel';
export const milliText = (value: number) => `${Math.floor(value / 1000)}.${String(value % 1000).padStart(3, '0')}`.replace(/\.?0+$/, '');
export function rupeeRatio(value: ExactRatio | null) {
  return value ? `\u20b9${formatFuelRatio({ numerator: value.numerator, denominator: (BigInt(value.denominator) * BigInt(100)).toString() })}` : 'Not enough data yet';
}
export type FuelForm = {
  kind: 'refuel' | 'charge'; fuelType: RefuelFuel; date: string; odometerKm: string; totalCost: string;
  quantity: string; price: string; fullTank: boolean; before: string; after: string;
  chargingLocation: ChargingLocation | null; location: string; notes: string;
};
export function initialFuelForm(vehicle: Pick<Vehicle, 'fuelType' | 'odometerKm'>, entry?: FuelEntry): FuelForm {
  const quotedPrice = entry ? entry.kind === 'refuel' ? entry.pricePerUnitPaise : entry.pricePerKwhPaise : null;
  return { kind: entry?.kind ?? (vehicle.fuelType === 'Electric' ? 'charge' : 'refuel'),
    fuelType: entry?.kind === 'refuel' ? entry.fuelType : vehicle.fuelType === 'Diesel' || vehicle.fuelType === 'CNG' ? vehicle.fuelType : 'Petrol',
    date: entry?.date ?? localToday(), odometerKm: entry ? milliText(entry.odometerMetres) : String(vehicle.odometerKm),
    totalCost: entry ? moneyInput(entry.costPaise) : '', quantity: entry ? milliText(fuelQuantity(entry)) : '',
    price: quotedPrice === null ? '' : moneyInput(quotedPrice),
    fullTank: entry?.kind === 'refuel' ? entry.fullTank : false,
    before: entry?.kind === 'charge' && entry.chargeBeforePercent !== null ? String(entry.chargeBeforePercent) : '',
    after: entry?.kind === 'charge' && entry.chargeAfterPercent !== null ? String(entry.chargeAfterPercent) : '',
    chargingLocation: entry?.kind === 'charge' ? entry.chargingLocation : null, location: entry?.location ?? '', notes: entry?.notes ?? '' };
}
export function fuelFormInput(form: FuelForm): FuelInput {
  const common = { date: form.date, odometerKm: form.odometerKm, totalCost: form.totalCost, location: form.location, notes: form.notes };
  const percent = (text: string) => text.trim() === '' ? null : /^\d+$/.test(text.trim()) ? Number(text) : NaN;
  return form.kind === 'refuel' ? { ...common, kind: 'refuel', fuelType: form.fuelType, quantity: form.quantity, pricePerUnit: form.price, fullTank: form.fullTank }
    : { ...common, kind: 'charge', energyKwh: form.quantity, pricePerKwh: form.price, chargeBeforePercent: percent(form.before), chargeAfterPercent: percent(form.after), chargingLocation: form.chargingLocation };
}
export function validateFuelForm(form: FuelForm, vehicleFuel: string): string | null {
  try { validateFuelForVehicle(validateFuelInput(fuelFormInput(form)), vehicleFuel); return null; }
  catch (error) { return error instanceof Error ? error.message : 'Check the entry details.'; }
}
export function previewPaidPrice(form: FuelForm) {
  try {
    const draft = validateFuelInput({ kind: 'refuel', fuelType: 'Petrol', date: '2026-01-01', odometerKm: '0', fullTank: false, quantity: form.quantity, totalCost: form.totalCost });
    return rupeeRatio({ numerator: (BigInt(draft.costPaise) * BigInt(1000)).toString(), denominator: String(fuelQuantity(draft)) });
  } catch { return null; }
}
export function fuelDetailRows(entry: FuelEntry): [string, string][] {
  const unit = fuelUnit(entry);
  const rows: [string, string][] = [['Date', entry.date], ['Odometer', `${milliText(entry.odometerMetres)} km`],
    [entry.kind === 'charge' ? 'Energy added' : 'Quantity', `${milliText(fuelQuantity(entry))} ${unit}`],
    ['Total paid', formatMoney(entry.costPaise)], [`Actual price/${unit}`, rupeeRatio(actualFuelUnitPrice(entry))]];
  if (entry.kind === 'refuel') {
    rows.push(['Fuel', entry.fuelType], ['Full tank', entry.fullTank ? 'Yes' : 'Partial fill']);
    if (entry.pricePerUnitPaise !== null) rows.push([`Quoted price/${unit}`, formatMoney(entry.pricePerUnitPaise)]);
  } else {
    if (entry.pricePerKwhPaise !== null) rows.push(['Quoted price/kWh', formatMoney(entry.pricePerKwhPaise)]);
    if (entry.chargeBeforePercent !== null) rows.push(['Battery before', `${entry.chargeBeforePercent}%`]);
    if (entry.chargeAfterPercent !== null) rows.push(['Battery after', `${entry.chargeAfterPercent}%`]);
    if (entry.chargingLocation) rows.push(['Charging location', entry.chargingLocation]);
  }
  if (entry.location) rows.push([entry.kind === 'charge' ? 'Location' : 'Station', entry.location]);
  if (entry.notes) rows.push(['Notes', entry.notes]);
  return rows;
}
