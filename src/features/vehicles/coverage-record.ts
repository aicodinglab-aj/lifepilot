import { calendarDay } from './coverage-status';

export type CoverageKind = 'insurance' | 'puc';
export function parseCoverageKind(value: unknown): CoverageKind {
  if (value !== 'insurance' && value !== 'puc') throw new Error('Invalid Insurance / PUC link.');
  return value;
}
export function validateCoverageOwner(vehicleId: number, ...ids: string[]) {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) throw new Error('Invalid vehicle.');
  for (const id of ids) if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new Error('Invalid record or document ID.');
}
// Shared view model; each domain is stored in its own table with its native field names.
export type CoverageDraft = {
  provider: string | null; number: string | null; policyType: string | null;
  startDate: string | null; expiryDate: string; amount: number | null; notes: string | null;
};
export type CoverageRecord = CoverageDraft & {
  id: string; vehicleId: number; createdAt: string; updatedAt: string; revision: number;
};
export type CoverageDocument = { id: string; vehicleId: number; recordId: string; localUri: string; createdAt: string };
export type CoverageCleanup = { kind: CoverageKind; vehicleId: number; recordId: string; documentId: string };
export type CoverageForm = Record<keyof CoverageDraft, string>;
export type CoverageErrors = Partial<Record<keyof CoverageForm, string>>;
export const emptyCoverageForm: CoverageForm = { provider: '', number: '', policyType: '', startDate: '', expiryDate: '', amount: '', notes: '' };
export const policyTypes = ['Comprehensive', 'Third Party', 'Own Damage', 'Other'] as const;
export const coverageTitle = (kind: CoverageKind) => kind === 'insurance' ? 'Insurance' : 'PUC';
type Field = { key: keyof CoverageForm; label: string; required?: boolean; date?: boolean; numeric?: boolean; multiline?: boolean };
export function coverageFields(kind: CoverageKind): Field[] {
  return kind === 'insurance' ? [
    { key: 'provider', label: 'Insurance Company', required: true }, { key: 'number', label: 'Policy Number', required: true },
    { key: 'policyType', label: 'Policy Type' }, { key: 'startDate', label: 'Start Date', date: true },
    { key: 'expiryDate', label: 'Expiry Date', required: true, date: true }, { key: 'amount', label: 'Premium Amount (₹)', numeric: true },
    { key: 'notes', label: 'Notes', multiline: true },
  ] : [
    { key: 'number', label: 'Certificate Number' }, { key: 'startDate', label: 'Issue Date', date: true },
    { key: 'expiryDate', label: 'Expiry Date', required: true, date: true }, { key: 'provider', label: 'Testing Center' },
    { key: 'amount', label: 'Amount (₹)', numeric: true }, { key: 'notes', label: 'Notes', multiline: true },
  ];
}
export function validateCoverageForm(kind: CoverageKind, form: CoverageForm): CoverageErrors {
  parseCoverageKind(kind);
  const errors: CoverageErrors = {};
  for (const field of coverageFields(kind)) {
    const value = form[field.key].trim();
    if (!value) { if (field.required) errors[field.key] = 'This field is required.'; continue; }
    if (field.date && calendarDay(value) == null) errors[field.key] = 'Enter a real date as YYYY-MM-DD.';
    if (field.numeric && (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > 1000000000)) {
      errors[field.key] = 'Enter a non-negative amount up to 1 billion, with at most 2 decimals.';
    }
  }
  if (!errors.startDate && !errors.expiryDate && form.startDate.trim() && form.expiryDate.trim() < form.startDate.trim()) {
    errors.expiryDate = 'Expiry must be on or after the start / issue date.';
  }
  return errors;
}
export function coverageFormToDraft(kind: CoverageKind, form: CoverageForm): CoverageDraft {
  const errors = validateCoverageForm(kind, form);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return { provider: form.provider.trim() || null, number: form.number.trim() || null,
    policyType: kind === 'insurance' ? form.policyType.trim() || null : null,
    startDate: form.startDate.trim() || null, expiryDate: form.expiryDate.trim(),
    amount: form.amount.trim() ? Number(form.amount) : null, notes: form.notes.trim() || null };
}
export function coverageToForm(record: CoverageRecord): CoverageForm {
  return { provider: record.provider ?? '', number: record.number ?? '', policyType: record.policyType ?? '',
    startDate: record.startDate ?? '', expiryDate: record.expiryDate, amount: record.amount == null ? '' : String(record.amount), notes: record.notes ?? '' };
}
