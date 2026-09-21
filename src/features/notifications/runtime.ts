import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type ExpoNotifications = typeof import('expo-notifications');

// executionEnvironment=StoreClient also includes development builds, so use the
// Expo Go-specific manifest marker. Development/preview/production clients must
// continue loading their bundled native notification module.
export const notificationRuntimeAvailable = Platform.OS !== 'web' && Constants.expoGoConfig == null;

let modulePromise: Promise<ExpoNotifications> | null = null;

export function loadNotificationRuntime(): Promise<ExpoNotifications | null> {
  if (!notificationRuntimeAvailable) return Promise.resolve(null);
  modulePromise ??= import('expo-notifications');
  return modulePromise;
}
