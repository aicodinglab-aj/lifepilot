import { validateVehicleForm, vehicleFormToNewVehicle, type Vehicle, type VehicleForm, type VehicleInformation } from './vehicle';

export type VehicleDetailsForm = VehicleForm & Record<keyof VehicleInformation, string>;
export type VehicleDetailsErrors = Partial<Record<keyof VehicleDetailsForm, string>>;
type Field = { key: keyof VehicleDetailsForm; label: string; optional?: boolean; numeric?: boolean; date?: boolean };
export const vehicleDetailSections: { title: string; fields: Field[] }[] = [
  { title: 'Basic Information', fields: [
    { key: 'vehicleType', label: 'Vehicle type' }, { key: 'make', label: 'Make / Manufacturer' },
    { key: 'model', label: 'Model' }, { key: 'variant', label: 'Variant', optional: true },
    { key: 'modelYear', label: 'Model year', numeric: true },
    { key: 'registrationNumber', label: 'Registration number' }, { key: 'fuelType', label: 'Fuel type' },
    { key: 'odometerKm', label: 'Current odometer (km)', numeric: true },
  ] },
  { title: 'Technical Details', fields: [
    { key: 'chassisNumber', label: 'Chassis number / VIN', optional: true },
    { key: 'engineNumber', label: 'Engine number', optional: true },
    { key: 'engineCapacity', label: 'Engine capacity (cc)', optional: true, numeric: true },
    { key: 'transmission', label: 'Transmission', optional: true }, { key: 'color', label: 'Color', optional: true },
  ] },
  { title: 'Purchase Information', fields: [
    { key: 'purchaseDate', label: 'Purchase date', optional: true, date: true },
    { key: 'purchasePrice', label: 'Purchase price (₹)', optional: true, numeric: true },
    { key: 'dealer', label: 'Dealer / seller', optional: true },
    { key: 'warrantyValidUntil', label: 'Warranty valid till', optional: true, date: true },
  ] },
  { title: 'Other', fields: [{ key: 'notes', label: 'Notes', optional: true }] },
];

export function vehicleToDetailsForm(vehicle: Vehicle): VehicleDetailsForm {
  const form = {} as VehicleDetailsForm;
  for (const { fields } of vehicleDetailSections) {
    for (const { key } of fields) form[key] = vehicle[key] == null ? '' : String(vehicle[key]);
  }
  return form;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateVehicleDetails(form: VehicleDetailsForm): VehicleDetailsErrors {
  const errors: VehicleDetailsErrors = validateVehicleForm(form);
  for (const key of ['engineCapacity', 'purchasePrice'] as const) {
    const value = form[key].trim();
    if (!value) continue;
    const number = Number(value);
    if (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER ||
      (key === 'engineCapacity' ? number <= 0 : number < 0)) {
      errors[key] = key === 'engineCapacity' ? 'Enter a positive engine capacity.' : 'Enter a valid non-negative price.';
    }
  }
  for (const key of ['purchaseDate', 'warrantyValidUntil'] as const) {
    if (form[key].trim() && !validDate(form[key].trim())) errors[key] = 'Enter a real date as YYYY-MM-DD.';
  }
  if (!errors.purchaseDate && !errors.warrantyValidUntil && form.purchaseDate.trim() &&
    form.warrantyValidUntil.trim() && form.warrantyValidUntil.trim() < form.purchaseDate.trim()) {
    errors.warrantyValidUntil = 'Warranty date must be on or after purchase date.';
  }
  return errors;
}

export function detailsFormToVehicle(form: VehicleDetailsForm) {
  return {
    ...vehicleFormToNewVehicle(form),
    chassisNumber: form.chassisNumber.trim() || null,
    engineNumber: form.engineNumber.trim() || null,
    engineCapacity: form.engineCapacity.trim() ? Number(form.engineCapacity) : null,
    transmission: form.transmission.trim() || null,
    color: form.color.trim() || null,
    purchaseDate: form.purchaseDate.trim() || null,
    purchasePrice: form.purchasePrice.trim() ? Number(form.purchasePrice) : null,
    dealer: form.dealer.trim() || null,
    warrantyValidUntil: form.warrantyValidUntil.trim() || null,
    notes: form.notes.trim() || null,
  };
}

export function vehicleDetailValue(vehicle: Vehicle, key: keyof VehicleDetailsForm): string {
  const value = vehicle[key];
  if (value == null || (typeof value === 'string' && !value.trim())) return 'Not added';
  if (key === 'odometerKm') return `${Number(value).toLocaleString()} km`;
  if (key === 'engineCapacity') return `${Number(value).toLocaleString()} cc`;
  if (key === 'purchasePrice') return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return String(value);
}

export function parseVehicleId(id: string | string[] | undefined) {
  const number = typeof id === 'string' && /^[1-9]\d*$/.test(id) ? Number(id) : NaN;
  return Number.isSafeInteger(number) ? number : NaN;
}
