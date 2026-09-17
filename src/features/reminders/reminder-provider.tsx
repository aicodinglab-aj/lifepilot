import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { addDatabaseChangeListener, useSQLiteContext } from 'expo-sqlite';
import { AppState, Platform } from 'react-native';
import { getReminderRevision } from '@/database/reminders';
import { subscribeVehicleOperations } from '@/features/vehicles/vehicle-operation';
import { configureReminderChannel, installReminderNotificationHandler, notificationAdapter, notificationPermission,
  requestNativeReminderPermission, TEST_NOTIFICATION_OWNER } from './notifications';
import { requestReminderPermissionOnce } from './permission';
import { NOTIFICATION_OWNER } from './reminder';
import { reconcileReminders, type ReconcileResult } from './reconcile';

type ReminderContextValue = {
  result: ReconcileResult | null; error: string | null; busy: boolean;
  refresh: () => Promise<void>; requestPermission: () => Promise<void>;
};
const ReminderContext = createContext<ReminderContextValue | null>(null);
export function useReminderRuntime() {
  const context = useContext(ReminderContext);
  if (!context) throw new Error('Reminder runtime is unavailable.');
  return context;
}
export function ReminderProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [result, setResult] = useState<ReconcileResult | null>(null), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRevision = useRef(-1), mounted = useRef(true), asking = useRef(false);
  const refresh = useCallback(async () => {
    if (mounted.current) setBusy(true);
    try {
      await configureReminderChannel();
      // A mutation during native scheduling requires another pass, bounded to keep UI responsive.
      for (let pass = 0; pass < 3; pass++) {
        const current = await reconcileReminders(db, notificationAdapter);
        lastRevision.current = current.revision;
        if (mounted.current) { setResult(current); setError(current.failures ? 'Some notifications could not be updated. Retry when notifications are available.' : null); }
        if (await getReminderRevision(db) === current.revision) break;
      }
    } catch { if (mounted.current) setError('Notifications could not be updated. Your records and in-app reminders are still available.'); }
    finally { if (mounted.current) setBusy(false); }
  }, [db]);
  const requestPermission = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    try { await requestReminderPermissionOnce(db, notificationPermission, requestNativeReminderPermission); await refresh(); }
    catch { if (mounted.current) setError('Notification permission could not be requested. You can continue without notifications.'); }
    finally { asking.current = false; }
  }, [db, refresh]);
  useEffect(() => {
    mounted.current = true;
    installReminderNotificationHandler();
    let debounce: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { void refresh(); }, 250);
    };
    schedule();
    const operations = subscribeVehicleOperations(schedule);
    const database = addDatabaseChangeListener((event) => {
      if (event.databaseFilePath === db.databasePath && event.tableName === 'reminder_change_state') schedule();
    });
    const app = AppState.addEventListener('change', (state) => { if (state === 'active') schedule(); });
    // Cheap durable revision check catches a write event emitted before a private transaction commits.
    // Also refresh permissions/clock/time zone once a minute while foregrounded.
    let ticks = 0;
    const poll = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      ticks++;
      void getReminderRevision(db).then((revision) => { if (revision !== lastRevision.current || ticks % 4 === 0) schedule(); }).catch(() => {});
    }, 15000);
    const received = Platform.OS === 'web' ? null : Notifications.addNotificationReceivedListener(schedule);
    return () => {
      mounted.current = false; clearTimeout(debounce); clearInterval(poll);
      operations(); database.remove(); app.remove(); received?.remove();
    };
  }, [db, refresh]);
  return <ReminderContext.Provider value={{ result, error, busy, refresh, requestPermission }}>
    <ReminderNotificationNavigation />{children}
  </ReminderContext.Provider>;
}
function ReminderNotificationNavigation() {
  const navigation = useRootNavigationState();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!navigation?.key || Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      const owner = request.content.data?.owner;
      if (owner !== NOTIFICATION_OWNER && owner !== TEST_NOTIFICATION_OWNER) return;
      const key = `${request.identifier}:${response.notification.date}`;
      if (handled.current === key) return;
      handled.current = key;
      // A fixed route avoids trusting notification URLs or navigating to deleted source records.
      router.push('/reminders');
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [navigation?.key]);
  return null;
}
