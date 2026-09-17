import type { SQLiteDatabase } from 'expo-sqlite';
import { calendarDay } from '@/features/vehicles/coverage-status';
import { isReminderType, type PlannedNotification, type ReminderInterval, type ReminderPreferences, type ReminderSource, type ReminderType } from '@/features/reminders/reminder';

export async function getReminderRevision(db: SQLiteDatabase) {
  return (await db.getFirstAsync<{ revision: number }>('SELECT revision FROM reminder_change_state WHERE id = 1'))?.revision ?? 0;
}
export function getReminderSources(db: SQLiteDatabase, today: string) {
  if (calendarDay(today) == null) throw new Error('Invalid calendar date.');
  // Every unexpired policy/certificate is eligible (e.g. separate Own Damage and Third Party policies).
  // If all expired, retain only the latest for the in-app overdue state. Service uses the latest visit.
  return db.getAllAsync<ReminderSource>(`
    SELECT s.id AS id, s.vehicle_id AS vehicleId, s.source_type AS sourceType, r.id AS recordId,
      v.registration_number AS registration, r.expiry_date AS dueDate, NULL AS dueOdometer, v.odometer_km AS odometer
    FROM vehicle_reminder_sources s JOIN vehicles v ON v.id = s.vehicle_id
    JOIN vehicle_insurance r ON r.id = s.insurance_id AND r.vehicle_id = s.vehicle_id
    WHERE r.expiry_date >= ? OR r.id = (SELECT id FROM vehicle_insurance WHERE vehicle_id = v.id ORDER BY expiry_date DESC, created_at DESC, id DESC LIMIT 1)
    UNION ALL
    SELECT s.id, s.vehicle_id, s.source_type, r.id, v.registration_number, r.expiry_date, NULL, v.odometer_km
    FROM vehicle_reminder_sources s JOIN vehicles v ON v.id = s.vehicle_id
    JOIN vehicle_puc r ON r.id = s.puc_id AND r.vehicle_id = s.vehicle_id
    WHERE r.expiry_date >= ? OR r.id = (SELECT id FROM vehicle_puc WHERE vehicle_id = v.id ORDER BY expiry_date DESC, created_at DESC, id DESC LIMIT 1)
    UNION ALL
    SELECT s.id, s.vehicle_id, s.source_type, r.id, v.registration_number, r.next_service_date, r.next_service_odometer, v.odometer_km
    FROM vehicle_reminder_sources s JOIN vehicles v ON v.id = s.vehicle_id
    JOIN vehicle_services r ON r.id = s.service_id AND r.vehicle_id = s.vehicle_id
    WHERE r.id = (SELECT id FROM vehicle_services WHERE vehicle_id = v.id ORDER BY service_date DESC, created_at DESC, id DESC LIMIT 1)
      AND (r.next_service_date IS NOT NULL OR r.next_service_odometer IS NOT NULL)
    ORDER BY dueDate, vehicleId, id`, [today, today]);
}
export function getReminderIntervals(db: SQLiteDatabase) {
  return db.getAllAsync<ReminderInterval>('SELECT source_type AS sourceType, offset_days AS offsetDays, enabled FROM reminder_intervals ORDER BY source_type, offset_days DESC');
}
export function getVehicleMileageTarget(db: SQLiteDatabase, vehicleId: number) {
  return db.getFirstAsync<{ dueOdometer: number | null }>(`SELECT next_service_odometer AS dueOdometer
    FROM vehicle_services WHERE vehicle_id = ? ORDER BY service_date DESC, created_at DESC, id DESC LIMIT 1`, [vehicleId]);
}
export async function getReminderPreferences(db: SQLiteDatabase) {
  const value = await db.getFirstAsync<ReminderPreferences>(`SELECT notifications_enabled AS notificationsEnabled,
    permission_requested AS permissionRequested, mileage_threshold AS mileageThreshold FROM reminder_preferences WHERE id = 1`);
  if (!value) throw new Error('Reminder settings are unavailable.');
  return value;
}
export async function setReminderInterval(db: SQLiteDatabase, type: ReminderType, offset: number, enabled: boolean) {
  if (!isReminderType(type) || !Number.isSafeInteger(offset) || offset < 0 || offset > 36500) throw new Error('Invalid reminder interval.');
  await db.runAsync(`INSERT INTO reminder_intervals(source_type, offset_days, enabled, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(source_type, offset_days) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
    [type, offset, enabled ? 1 : 0, new Date().toISOString()]);
}
export async function setReminderPreferences(db: SQLiteDatabase, enabled: boolean, threshold: number) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1000000) throw new Error('Enter a mileage warning threshold between 0 and 1,000,000 km.');
  await db.runAsync('UPDATE reminder_preferences SET notifications_enabled = ?, mileage_threshold = ?, updated_at = ? WHERE id = 1',
    [enabled ? 1 : 0, threshold, new Date().toISOString()]);
}
export async function markPermissionRequested(db: SQLiteDatabase) {
  await db.runAsync('UPDATE reminder_preferences SET permission_requested = 1, updated_at = ? WHERE id = 1', [new Date().toISOString()]);
}
export type ScheduledReminder = Pick<PlannedNotification, 'notificationId' | 'fingerprint' | 'fireAt'>;
export function getScheduledReminders(db: SQLiteDatabase) {
  return db.getAllAsync<ScheduledReminder>('SELECT notification_id AS notificationId, fingerprint, fire_at AS fireAt FROM vehicle_reminder_schedule');
}
export async function removeScheduledReminder(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM vehicle_reminder_schedule WHERE notification_id = ?', [id]);
}
export async function persistPlannedReminder(db: SQLiteDatabase, item: PlannedNotification, revision: number) {
  // A concurrent source edit/delete or settings change cannot revive a stale schedule row.
  const now = new Date().toISOString();
  const result = await db.runAsync(`INSERT INTO vehicle_reminder_schedule
    (notification_id, source_id, source_type, due_date, offset_days, fire_at, fingerprint, created_at, updated_at)
    SELECT ?, s.id, s.source_type, ?, ?, ?, ?, ?, ? FROM vehicle_reminder_sources s
    JOIN reminder_intervals i ON i.source_type = s.source_type AND i.offset_days = ?
    WHERE s.id = ? AND i.enabled = 1 AND (SELECT revision FROM reminder_change_state WHERE id = 1) = ?
    ON CONFLICT(notification_id) DO UPDATE SET fingerprint = excluded.fingerprint, fire_at = excluded.fire_at,
      due_date = excluded.due_date, updated_at = excluded.updated_at`,
    [item.notificationId, item.dueDate, item.offsetDays, item.fireAt, item.fingerprint, now, now, item.offsetDays, item.sourceId, revision]);
  return result.changes === 1;
}
export async function queueNotificationCleanup(db: SQLiteDatabase, id: string) {
  await db.runAsync('INSERT OR IGNORE INTO reminder_notification_cleanup(notification_id, created_at) VALUES (?, ?)', [id, new Date().toISOString()]);
}
export function getNotificationCleanup(db: SQLiteDatabase) {
  return db.getAllAsync<{ notificationId: string }>('SELECT notification_id AS notificationId FROM reminder_notification_cleanup');
}
export async function clearNotificationCleanup(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM reminder_notification_cleanup WHERE notification_id = ?', [id]);
}
