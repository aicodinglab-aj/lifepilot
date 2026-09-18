import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';
import { taskNotificationAdapter, requestTaskPermission } from './notifications';
import { reconcileTaskNotifications, TASK_NOTIFICATION_OWNER } from './task-notifications';

const Context = createContext<{ warning: string | null; refresh: () => Promise<void>; request: () => Promise<void> } | null>(null);
export function useTaskNotifications() {
  const value = useContext(Context);
  if (!value) throw new Error('Task notifications are unavailable.');
  return value;
}
export function TaskProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [warning, setWarning] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (Platform.OS === 'web') { setWarning('Local task reminders are available in the Android and iOS app.'); return; }
    const result = await reconcileTaskNotifications(db, taskNotificationAdapter);
    setWarning(result);
  }, [db]);
  const request = async () => {
    try { await requestTaskPermission(); await refresh(); }
    catch { setWarning('Notification permission is unavailable. Tasks are still saved.'); }
  };
  useEffect(() => {
    const initial = setTimeout(() => { void refresh(); }, 0);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const received = Platform.OS === 'web' ? null : Notifications.addNotificationReceivedListener((notification) => {
      if (notification.request.content.data?.owner === TASK_NOTIFICATION_OWNER) void refresh();
    });
    return () => { clearTimeout(initial); subscription.remove(); received?.remove(); };
  }, [refresh]);
  return <Context.Provider value={{ warning, refresh, request }}>{children}</Context.Provider>;
}
