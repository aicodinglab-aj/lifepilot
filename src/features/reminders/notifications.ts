import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NOTIFICATION_OWNER, NOTIFICATION_PREFIX } from './reminder';
import type { NotificationAdapter, ReminderPermission } from './reconcile';
import { reminderTestEnabled } from './test-build';

export const REMINDER_CHANNEL = 'vehicle-reminders';
export const TEST_NOTIFICATION_OWNER = 'lifepilot.vehicle-reminders.test';
export async function configureReminderChannel() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Vehicle reminders', description: 'Insurance, PUC and service due dates',
    importance: Notifications.AndroidImportance.DEFAULT, sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}
export async function notificationPermission(): Promise<ReminderPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  const result = await Notifications.getPermissionsAsync();
  const allowed = result.ios ? [Notifications.IosAuthorizationStatus.AUTHORIZED, Notifications.IosAuthorizationStatus.PROVISIONAL,
    Notifications.IosAuthorizationStatus.EPHEMERAL].includes(result.ios.status) : result.granted;
  if (allowed) {
    if (Platform.OS === 'android') {
      const channel = await Notifications.getNotificationChannelAsync(REMINDER_CHANNEL);
      if (channel?.importance === Notifications.AndroidImportance.NONE) return 'channel-disabled';
    }
    return 'granted';
  }
  return result.status === 'undetermined' && result.canAskAgain ? 'undetermined' : 'denied';
}
export async function requestNativeReminderPermission() {
  await configureReminderChannel();
  await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return notificationPermission();
}
export const notificationAdapter: NotificationAdapter = {
  capacity: Platform.OS === 'ios' ? 60 : 450,
  permission: notificationPermission,
  scheduled: async () => Platform.OS === 'web' ? [] : (await Notifications.getAllScheduledNotificationsAsync()).map((request) => ({
    id: request.identifier, owner: request.content.data?.owner, fingerprint: request.content.data?.fingerprint,
  })),
  cancel: async (id) => {
    if (Platform.OS === 'web') throw new Error('Notifications are available in the mobile app.');
    await Notifications.cancelScheduledNotificationAsync(id);
  },
  schedule: async (item) => {
    if (item.fireAt <= Date.now()) throw new Error('The reminder time has already passed.');
    return Notifications.scheduleNotificationAsync({ identifier: item.notificationId,
      content: { title: 'LifePilot', body: item.body, sound: 'default', data: { owner: NOTIFICATION_OWNER, fingerprint: item.fingerprint } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(item.fireAt), channelId: REMINDER_CHANNEL },
    });
  },
};
export async function scheduleDebugReminder() {
  if (!reminderTestEnabled) throw new Error('Test notifications are only available in preview or development builds.');
  await configureReminderChannel();
  const permission = await notificationPermission();
  if (permission === 'channel-disabled') throw new Error('Enable the Vehicle reminders channel in device notification settings first.');
  if (permission !== 'granted') throw new Error('Enable notifications above, or allow them in device settings, then try again.');
  await Notifications.scheduleNotificationAsync({ identifier: `${TEST_NOTIFICATION_OWNER}:short-delay`,
    content: { title: 'LifePilot test', body: 'Local notification test. No vehicle data was changed.', data: { owner: TEST_NOTIFICATION_OWNER }, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10, repeats: false, channelId: REMINDER_CHANNEL },
  });
}
export function installReminderNotificationHandler() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({ handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const ours = (data?.owner === NOTIFICATION_OWNER && notification.request.identifier.startsWith(NOTIFICATION_PREFIX)) || data?.owner === TEST_NOTIFICATION_OWNER;
    return { shouldShowBanner: ours, shouldShowList: ours, shouldPlaySound: ours, shouldSetBadge: false };
  } });
}
