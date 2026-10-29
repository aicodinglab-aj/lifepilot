import Constants, { AppOwnership, ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export type ExpoNotifications = typeof import('expo-notifications');

// SDK 57 reports StoreClient for both Expo Go and expo-dev-client. Its deprecated
// appOwnership marker still distinguishes Expo Go ('expo') from other clients;
// keep that check scoped to StoreClient because Bare builds can expose expoGoConfig.
export const isExpoGoRuntime = Platform.OS !== 'web'
  && Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  && Constants.appOwnership === AppOwnership.Expo;
export const notificationRuntimeAvailable = Platform.OS !== 'web' && !isExpoGoRuntime;
export const notificationRuntimeReason = Platform.OS === 'web' ? 'web' : isExpoGoRuntime ? 'expo-go' : null;

export function logNotificationDiagnostic(operation: string, error?: unknown) {
  console.error('[LifePilot notifications]', {
    operation,
    platform: Platform.OS,
    executionEnvironment: Constants.executionEnvironment,
    appOwnership: Constants.appOwnership,
    expoGoConfigPresent: Constants.expoGoConfig != null,
    available: notificationRuntimeAvailable,
  }, error);
}

console.info('[LifePilot notifications] runtime', {
  platform: Platform.OS,
  executionEnvironment: Constants.executionEnvironment,
  appOwnership: Constants.appOwnership,
  expoGoConfigPresent: Constants.expoGoConfig != null,
  available: notificationRuntimeAvailable,
});

let modulePromise: Promise<ExpoNotifications> | null = null;

export function loadNotificationRuntime(): Promise<ExpoNotifications | null> {
  if (!notificationRuntimeAvailable) return Promise.resolve(null);
  modulePromise ??= import('expo-notifications').catch((error: unknown) => {
    logNotificationDiagnostic('load expo-notifications module', error);
    modulePromise = null;
    throw error;
  });
  return modulePromise;
}
