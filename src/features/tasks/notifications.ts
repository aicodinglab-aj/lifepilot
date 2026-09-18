import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { notificationAdapter } from '@/features/reminders/notifications';
import type { ReminderPermission } from '@/features/reminders/reconcile';
import { TASK_NOTIFICATION_OWNER, type TaskNotificationAdapter } from './task-notifications';

const CHANNEL = 'task-reminders';
async function configure() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Task reminders', importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default', lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}
export async function taskNotificationPermission(): Promise<ReminderPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  await configure();
  const result = await Notifications.getPermissionsAsync();
  const granted = result.ios ? [Notifications.IosAuthorizationStatus.AUTHORIZED, Notifications.IosAuthorizationStatus.PROVISIONAL,
    Notifications.IosAuthorizationStatus.EPHEMERAL].includes(result.ios.status) : result.granted;
  if (granted) {
    if (Platform.OS === 'android' && (await Notifications.getNotificationChannelAsync(CHANNEL))?.importance === Notifications.AndroidImportance.NONE) return 'channel-disabled';
    return 'granted';
  }
  return result.status === 'undetermined' && result.canAskAgain ? 'undetermined' : 'denied';
}
let asking: Promise<void> | null = null;
export function requestTaskPermission(): Promise<void> {
  if (asking) return asking;
  asking = requestPermission().finally(() => { asking = null; });
  return asking;
}
async function requestPermission() {
  // Explicit user action only. Like vehicle reminders, never repeatedly prompt after denial.
  if (await taskNotificationPermission() === 'undetermined') {
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  }
}
export const taskNotificationAdapter: TaskNotificationAdapter = {
  capacity: notificationAdapter.capacity,
  scheduled: notificationAdapter.scheduled,
  cancel: notificationAdapter.cancel,
  permission: taskNotificationPermission,
  schedule: async (plan) => {
    if (plan.fireAt <= Date.now()) throw new Error('The task reminder time has passed.');
    return Notifications.scheduleNotificationAsync({ identifier: plan.id,
      content: { title: 'LifePilot Task', body: plan.title, sound: 'default',
        data: { owner: TASK_NOTIFICATION_OWNER, fingerprint: plan.fingerprint } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(plan.fireAt), channelId: CHANNEL },
    });
  },
};
