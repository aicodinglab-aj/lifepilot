import type { SQLiteDatabase } from 'expo-sqlite';
import { clearNotificationCleanup, getNotificationCleanup, getReminderIntervals, getReminderPreferences, getReminderRevision,
  getReminderSources, getScheduledReminders, persistPlannedReminder, queueNotificationCleanup, removeScheduledReminder } from '@/database/reminders';
import { localToday } from '@/features/vehicles/coverage-status';
import { NOTIFICATION_OWNER, NOTIFICATION_PREFIX, planNotifications, type PlannedNotification } from './reminder';

export type ReminderPermission = 'granted' | 'undetermined' | 'denied' | 'channel-disabled' | 'unavailable';
export type NativeScheduledReminder = { id: string; owner: unknown; fingerprint: unknown };
export interface NotificationAdapter {
  capacity: number;
  permission(): Promise<ReminderPermission>;
  scheduled(): Promise<NativeScheduledReminder[]>;
  cancel(id: string): Promise<void>;
  schedule(item: PlannedNotification): Promise<string>;
}
export type ReconcileResult = { permission: ReminderPermission; scheduled: number; deferred: number; failures: number; revision: number };
const activeRuns = new WeakMap<SQLiteDatabase, Promise<ReconcileResult>>();

export function reconcileReminders(db: SQLiteDatabase, native: NotificationAdapter, now = new Date()): Promise<ReconcileResult> {
  // Multiple lifecycle/mutation events share a single run, rather than scheduling duplicates.
  const active = activeRuns.get(db);
  if (active) return active;
  const pending = reconcile(db, native, now).finally(() => activeRuns.delete(db));
  activeRuns.set(db, pending);
  return pending;
}
async function reconcile(db: SQLiteDatabase, native: NotificationAdapter, now: Date): Promise<ReconcileResult> {
  const revision = await getReminderRevision(db);
  const [sources, intervals, preferences, permission, scheduled, metadata] = await Promise.all([
    getReminderSources(db, localToday(now)), getReminderIntervals(db), getReminderPreferences(db),
    native.permission(), native.scheduled(), getScheduledReminders(db),
  ]);
  const owned = scheduled.filter((item) => item.owner === NOTIFICATION_OWNER && item.id.startsWith(NOTIFICATION_PREFIX));
  const plans = permission === 'granted' && preferences.notificationsEnabled ? planNotifications(sources, intervals, now) : [];
  const capacity = Math.max(0, native.capacity - (scheduled.length - owned.length));
  const desired = new Map(plans.slice(0, capacity).map((item) => [item.notificationId, item]));
  let failures = 0, count = 0;
  for (const row of metadata) {
    if (desired.get(row.notificationId)?.fingerprint !== row.fingerprint) await removeScheduledReminder(db, row.notificationId);
  }
  for (const item of owned) {
    if (desired.get(item.id)?.fingerprint !== item.fingerprint) await queueNotificationCleanup(db, item.id);
  }
  const blocked = new Set<string>();
  const cancelled = new Set<string>();
  for (const row of await getNotificationCleanup(db)) {
    // No cancel-all API: even corrupt metadata cannot target another notification domain.
    if (!row.notificationId.startsWith(NOTIFICATION_PREFIX)) { failures++; continue; }
    try {
      await native.cancel(row.notificationId);
      await clearNotificationCleanup(db, row.notificationId);
      cancelled.add(row.notificationId);
    } catch { failures++; blocked.add(row.notificationId); }
  }
  for (const item of desired.values()) {
    if (blocked.has(item.notificationId)) continue;
    if (await getReminderRevision(db) !== revision) break;
    try {
      if (!await persistPlannedReminder(db, item, revision)) continue;
      const existing = owned.find((entry) => entry.id === item.notificationId && entry.fingerprint === item.fingerprint);
      if (!existing || cancelled.has(item.notificationId)) {
        // Persist intent first: a crash after the native call is recoverable by the stable identifier.
        const id = await native.schedule(item);
        if (id !== item.notificationId) {
          // Expo supports supplied identifiers; unexpected values are never silently orphaned.
          await native.cancel(id);
          throw new Error('Notification identifier mismatch.');
        }
      }
      if (await getReminderRevision(db) !== revision) {
        await queueNotificationCleanup(db, item.notificationId);
        try { await native.cancel(item.notificationId); await clearNotificationCleanup(db, item.notificationId); }
        catch { failures++; }
        break;
      }
      count++;
    } catch { failures++; }
  }
  return { permission, scheduled: count, deferred: plans.length - desired.size, failures, revision };
}
