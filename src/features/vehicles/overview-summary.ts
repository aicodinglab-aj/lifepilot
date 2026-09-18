import type { SQLiteDatabase } from 'expo-sqlite';
import { getCurrentCoverage } from '@/database/vehicle-coverage';
import { getLatestService } from '@/database/vehicle-services';
import { dateReminderLabel, odometerStatus } from '@/features/reminders/reminder';
import type { CoverageRecord } from './coverage-record';
import { coverageDate, coverageStatus } from './coverage-status';
import { nextServiceLabel, type ServiceRecord } from './service-record';

export async function getOverviewSummary(db: SQLiteDatabase, vehicleId: number, today: string) {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) throw new Error('Invalid vehicle link.');
  const [insurance, puc, service] = await Promise.all([
    getCurrentCoverage(db, 'insurance', vehicleId, today),
    getCurrentCoverage(db, 'puc', vehicleId, today),
    getLatestService(db, vehicleId),
  ]);
  return { insurance, puc, service };
}

export function coverageQuickStatus(record: CoverageRecord | null, today: string) {
  const value = coverageStatus(record?.expiryDate, record?.startDate, today);
  const detail = !record || value === 'Not added' ? undefined : value === 'Not started'
    ? `Starts ${coverageDate(record.startDate)} · Until ${coverageDate(record.expiryDate)}`
    : `${value === 'Expired' ? 'Expired' : 'Until'} ${coverageDate(record.expiryDate)}`;
  return { value, detail };
}

export function serviceQuickStatus(record: ServiceRecord | null, odometer: number, today: string) {
  if (!record || (!record.nextServiceDate && record.nextServiceOdometer == null)) return { value: 'Not scheduled', detail: undefined };
  // Reuse the existing date/odometer display rules without loading or scheduling reminders.
  const date = record.nextServiceDate ? dateReminderLabel({
    id: record.id, recordId: record.id, vehicleId: record.vehicleId, sourceType: 'service',
    registration: '', dueDate: record.nextServiceDate, dueOdometer: record.nextServiceOdometer, odometer,
  }, today) : null;
  const mileage = odometerStatus(odometer, record.nextServiceOdometer);
  return {
    value: record.nextServiceDate ? coverageDate(record.nextServiceDate) : nextServiceLabel(record),
    detail: [date, mileage?.message].filter(Boolean).join(' · '),
  };
}
