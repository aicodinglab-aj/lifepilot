import { calendarDay, localToday } from '@/features/vehicles/coverage-status';

export type ReminderType = 'insurance' | 'puc' | 'service';
export type ReminderSource = {
  id: string; vehicleId: number; sourceType: ReminderType; recordId: string;
  registration: string; dueDate: string | null; dueOdometer: number | null; odometer: number;
};
export type ReminderInterval = { sourceType: ReminderType; offsetDays: number; enabled: number };
export type ReminderPreferences = { notificationsEnabled: number; permissionRequested: number; mileageThreshold: number };
export type PlannedNotification = {
  notificationId: string; sourceId: string; sourceType: ReminderType; dueDate: string;
  offsetDays: number; fireAt: number; fingerprint: string; body: string;
};
export const NOTIFICATION_OWNER = 'lifepilot.vehicle-reminders.v1';
export const NOTIFICATION_PREFIX = `${NOTIFICATION_OWNER}:`;
export const REMINDER_HOUR = 9;
export const reminderTitle = (type: ReminderType) => type === 'insurance' ? 'Insurance' : type === 'puc' ? 'PUC' : 'Service';
export function isReminderType(value: unknown): value is ReminderType { return value === 'insurance' || value === 'puc' || value === 'service'; }
export function intervalLabel(days: number) { return days === 0 ? 'On due date' : `${days} day${days === 1 ? '' : 's'} before`; }

// Subtract calendar days in UTC to avoid DST, then construct 09:00 in LOCAL time.
export function reminderFireDate(dueDate: string, offsetDays: number): Date | null {
  const day = calendarDay(dueDate);
  if (day == null || !Number.isSafeInteger(offsetDays) || offsetDays < 0) return null;
  const calendar = new Date((day - offsetDays) * 86400000);
  const local = new Date(0);
  local.setFullYear(calendar.getUTCFullYear(), calendar.getUTCMonth(), calendar.getUTCDate());
  local.setHours(REMINDER_HOUR, 0, 0, 0);
  return Number.isFinite(local.getTime()) ? local : null;
}
export function planNotifications(sources: ReminderSource[], intervals: ReminderInterval[], now = new Date()): PlannedNotification[] {
  const desired = new Map<string, PlannedNotification>();
  for (const source of sources) {
    if (!source.dueDate) continue;
    for (const interval of intervals) {
      if (interval.sourceType !== source.sourceType || !interval.enabled) continue;
      const fire = reminderFireDate(source.dueDate, interval.offsetDays);
      if (!fire || fire.getTime() <= now.getTime()) continue;
      const when = interval.offsetDays === 0 ? 'today' : interval.offsetDays === 1 ? 'tomorrow' : `in ${interval.offsetDays} days`;
      const body = `${reminderTitle(source.sourceType)} for ${source.registration} ${source.sourceType === 'service' ? 'is due' : 'expires'} ${when}.`;
      const notificationId = `${NOTIFICATION_PREFIX}${source.id}:${interval.offsetDays}`;
      const fingerprint = JSON.stringify([source.dueDate, fire.getTime(), body]);
      desired.set(notificationId, { notificationId, sourceId: source.id, sourceType: source.sourceType, dueDate: source.dueDate,
        offsetDays: interval.offsetDays, fireAt: fire.getTime(), fingerprint, body });
    }
  }
  return [...desired.values()].sort((a, b) => a.fireAt - b.fireAt || a.notificationId.localeCompare(b.notificationId));
}
export function odometerStatus(current: number, due: number | null, threshold = 500) {
  if (due == null || !Number.isFinite(current) || !Number.isFinite(due) || current < 0 || due < 0) return null;
  const remaining = due - current;
  if (remaining < 0) return { state: 'Overdue', message: `${Math.abs(remaining).toLocaleString()} km overdue` };
  if (remaining === 0) return { state: 'Due', message: 'Service is due at the current odometer' };
  if (remaining <= threshold) return { state: 'Approaching', message: `Service due in ${remaining.toLocaleString()} km` };
  return { state: 'Upcoming', message: `Service due in ${remaining.toLocaleString()} km` };
}
export function dateReminderLabel(source: ReminderSource, today = localToday()) {
  const due = calendarDay(source.dueDate), current = calendarDay(today);
  if (due == null || current == null) return 'Date not added';
  const days = due - current, expiry = source.sourceType !== 'service';
  if (days < 0) return `${expiry ? 'Expired' : 'Overdue'} ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return expiry ? 'Expires today' : 'Due today';
  return `${expiry ? 'Expires' : 'Due'} in ${days} day${days === 1 ? '' : 's'}`;
}
