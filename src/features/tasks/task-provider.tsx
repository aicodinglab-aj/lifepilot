import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { loadNotificationRuntime, notificationRuntimeAvailable } from '@/features/notifications/runtime';
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
    if (!notificationRuntimeAvailable) {
      setWarning(Platform.OS === 'web'
        ? 'Local task reminders are available in the Android and iOS app.'
        : 'Task notifications require a development, preview or production build. Tasks are still saved.');
      return;
    }
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
    let active = true, received: { remove(): void } | null = null;
    void loadNotificationRuntime().then((Notifications) => {
      if (!active || !Notifications) return;
      received = Notifications.addNotificationReceivedListener((notification) => {
        if (notification.request.content.data?.owner === TASK_NOTIFICATION_OWNER) void refresh();
      });
    });
    return () => { active = false; clearTimeout(initial); subscription.remove(); received?.remove(); };
  }, [refresh]);
  return <Context.Provider value={{ warning, refresh, request }}>{children}</Context.Provider>;
}
