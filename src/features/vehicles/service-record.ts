export type ServiceDraft = {
  serviceDate: string; odometer: number; title: string; workshop: string | null;
  description: string | null; partsCost: number | null; labourCost: number | null;
  otherCost: number | null; nextServiceDate: string | null; nextServiceOdometer: number | null;
  notes: string | null;
};
export type ServiceRecord = ServiceDraft & {
  id: string; vehicleId: number; createdAt: string; updatedAt: string; totalCost: number | null;
};
export type ServiceBill = { id: string; vehicleId: number; serviceId: string; localUri: string; createdAt: string };
export type ServiceForm = Record<keyof ServiceDraft, string>;
export type ServiceErrors = Partial<Record<keyof ServiceForm, string>>;
export const emptyServiceForm: ServiceForm = {
  serviceDate: '', odometer: '', title: '', workshop: '', description: '', partsCost: '',
  labourCost: '', otherCost: '', nextServiceDate: '', nextServiceOdometer: '', notes: '',
};
export const serviceFields: { key: keyof ServiceForm; label: string; required?: boolean; numeric?: boolean; date?: boolean; multiline?: boolean }[] = [
  { key: 'serviceDate', label: 'Service Date', required: true, date: true },
  { key: 'odometer', label: 'Odometer (km)', required: true, numeric: true },
  { key: 'title', label: 'Service Type / Title', required: true },
  { key: 'workshop', label: 'Workshop' },
  { key: 'description', label: 'Work Performed / Description', multiline: true },
  { key: 'partsCost', label: 'Parts Cost (₹)', numeric: true },
  { key: 'labourCost', label: 'Labour Cost (₹)', numeric: true },
  { key: 'otherCost', label: 'Other Cost (₹)', numeric: true },
  { key: 'nextServiceDate', label: 'Next Service Date', date: true },
  { key: 'nextServiceOdometer', label: 'Next Service Odometer (km)', numeric: true },
  { key: 'notes', label: 'Notes', multiline: true },
];
export function validateServiceForm(form: ServiceForm): ServiceErrors {
  const errors: ServiceErrors = {};
  for (const field of serviceFields) {
    const value = form[field.key].trim();
    if (!value) { if (field.required) errors[field.key] = 'This field is required.'; continue; }
    if (field.numeric) {
      const cost = field.key.endsWith('Cost');
      if (!(cost ? /^\d+(\.\d{1,2})?$/ : /^\d+(\.\d+)?$/).test(value) ||
          !Number.isFinite(Number(value)) || Number(value) > (cost ? 1000000000 : Number.MAX_SAFE_INTEGER)) {
        errors[field.key] = cost ? 'Enter a non-negative amount up to 1 billion, with at most 2 decimals.' : 'Enter a valid non-negative odometer.';
      }
    }
    if (field.date) {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        errors[field.key] = 'Enter a real date as YYYY-MM-DD.';
      }
    }
  }
  return errors;
}
export function serviceFormToDraft(form: ServiceForm): ServiceDraft {
  const errors = validateServiceForm(form);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const number = (key: keyof ServiceForm) => form[key].trim() ? Number(form[key]) : null;
  return { serviceDate: form.serviceDate.trim(), odometer: Number(form.odometer), title: form.title.trim(),
    workshop: form.workshop.trim() || null, description: form.description.trim() || null,
    partsCost: number('partsCost'), labourCost: number('labourCost'), otherCost: number('otherCost'),
    nextServiceDate: form.nextServiceDate.trim() || null, nextServiceOdometer: number('nextServiceOdometer'), notes: form.notes.trim() || null };
}
export function calculateServiceTotal(costs: Pick<ServiceDraft, 'partsCost' | 'labourCost' | 'otherCost'>): number | null {
  const values = [costs.partsCost, costs.labourCost, costs.otherCost];
  if (values.every((value) => value == null)) return null;
  return values.reduce<number>((sum, value) => sum + Math.round((value ?? 0) * 100), 0) / 100;
}
export function serviceMoney(value: number | null) {
  return value == null ? 'Not added' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
export function nextServiceLabel(record: Pick<ServiceDraft, 'nextServiceDate' | 'nextServiceOdometer'> | null) {
  if (!record) return 'Not added';
  return [record.nextServiceDate, record.nextServiceOdometer == null ? null : `${record.nextServiceOdometer.toLocaleString()} km`].filter(Boolean).join(' · ') || 'Not added';
}
