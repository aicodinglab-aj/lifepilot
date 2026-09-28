import { applicationActivity, withOperation, type OperationContext } from '@/features/activity/operation-lifecycle';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getTaskReminderCandidates } from '@/database/tasks';
import type { NativeScheduledReminder, ReminderPermission } from '@/features/reminders/reconcile';
import { localToday, taskFireAt } from './task';

export const TASK_NOTIFICATION_OWNER = 'lifepilot.tasks.v1';
export const TASK_NOTIFICATION_PREFIX = `${TASK_NOTIFICATION_OWNER}:`;
export type TaskNotification = { id: string; taskId: number; title: string; fireAt: number; fingerprint: string };
export interface TaskNotificationAdapter {
  capacity: number;
  permission(): Promise<ReminderPermission>;
  scheduled(): Promise<NativeScheduledReminder[]>;
  cancel(id: string): Promise<void>;
  schedule(plan: TaskNotification): Promise<string>;
}
const runs = new WeakMap<SQLiteDatabase, Promise<string | null>>();
export function reconcileTaskNotifications(db: SQLiteDatabase, native: TaskNotificationAdapter, now = new Date()): Promise<string | null> {
  const generation = applicationActivity.getGeneration();
  if (applicationActivity.getState() !== 'normal') return Promise.resolve(null);
  // Queue a fresh read after any in-flight pass, so edits cannot be lost mid-schedule.
  const previous = runs.get(db) ?? Promise.resolve(null);
  const pending = previous.catch(() => null).then(() => {
    // Queued work owns no lease until it actually starts. A suspension invalidates
    // it even if admission resumes before this continuation gets its turn.
    if (applicationActivity.getState() !== 'normal' || applicationActivity.getGeneration() !== generation) return null;
    return reconcile(db, native, now);
  }).catch(() =>
    'Task saved. Notifications are unavailable; they will be retried when the app is active.');
  runs.set(db, pending);
  void pending.then(() => { if (runs.get(db) === pending) runs.delete(db); });
  return pending;
}
async function reconcile(db: SQLiteDatabase, native: TaskNotificationAdapter, now: Date, context?: OperationContext) {
  return withOperation(async () => {
    // Permission lookup can configure the native channel. Do not release this
    // operation early if the parallel inventory read fails first.
    const [permissionResult, scheduledResult] = await Promise.allSettled([native.permission(), native.scheduled()]);
    if (permissionResult.status === 'rejected') throw permissionResult.reason;
    if (scheduledResult.status === 'rejected') throw scheduledResult.reason;
    const permission = permissionResult.value, scheduled = scheduledResult.value;
    const ours = scheduled.filter((item) => item.owner === TASK_NOTIFICATION_OWNER && item.id.startsWith(TASK_NOTIFICATION_PREFIX));
    const capacity = Math.max(0, native.capacity - (scheduled.length - ours.length));
    const desired = new Map<string, TaskNotification>();
    let deferred = false;
    if (permission === 'granted') {
      for (let offset = 0; ; offset += 100) {
        const page = await getTaskReminderCandidates(db, localToday(now), offset);
        for (const task of page) {
          const fireAt = taskFireAt(task);
          if (fireAt == null || fireAt <= now.getTime()) continue;
          if (desired.size >= capacity) { deferred = true; break; }
          const id = `${TASK_NOTIFICATION_PREFIX}${task.id}`;
          desired.set(id, { id, taskId: task.id, title: task.title, fireAt, fingerprint: JSON.stringify([task.title, fireAt]) });
        }
        if (deferred || page.length < 100) break;
      }
    }
    const blocked = new Set<string>(), retained = new Set<string>();
    let failures = 0, failedCancellations = 0;
    for (const item of ours) {
      if (desired.get(item.id)?.fingerprint === item.fingerprint) { retained.add(item.id); continue; }
      try { await native.cancel(item.id); }
      catch { failures++; failedCancellations++; blocked.add(item.id); }
    }
    // OS inventory is durable cleanup metadata: cancelled/deleted tasks are retried
    // on the next pass without a foreign key or a row that could be lost on delete.
    let free = Math.max(0, capacity - retained.size - failedCancellations);
    for (const plan of desired.values()) {
      if (retained.has(plan.id) || blocked.has(plan.id)) continue;
      if (!free) { deferred = true; continue; }
      try {
        const actual = await native.schedule(plan);
        if (actual !== plan.id) { await native.cancel(actual); throw new Error('Unexpected notification identifier.'); }
        free--;
      } catch { failures++; }
    }
    if (failures) return 'Some task reminders could not be updated. Retry notifications when available.';
    if (permission !== 'granted') return 'Task reminders need notification permission. Tasks are still saved.';
    if (deferred) return 'Notification capacity reached. Later reminders will be retried when the app is active.';
    return null;
  }, context);
}
