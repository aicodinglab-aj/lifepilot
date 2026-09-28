import { withOperation, type OperationContext } from '@/features/activity/operation-lifecycle';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getReminderPreferences, markPermissionRequested } from '@/database/reminders';
import type { ReminderPermission } from './reconcile';

export async function requestReminderPermissionOnce(db: SQLiteDatabase, permission: () => Promise<ReminderPermission>, request: (operation: OperationContext) => Promise<ReminderPermission>, context?: OperationContext) {
  return withOperation(async (operation) => {
    const current = await permission();
    if (current !== 'undetermined') return current;
    if ((await getReminderPreferences(db)).permissionRequested) return current;
    // Persist BEFORE the OS dialog, so denial/restart never creates a repeated prompt.
    await markPermissionRequested(db, operation);
    return request(operation);
  }, context);
}
