import { useThemedStyles } from '@/features/appearance/appearance-provider';
import { Linking, Platform, Text, View } from 'react-native';
import { CoverageAction, coverageStyles as styles } from './coverage-ui';
import { useReminderRuntime } from '@/features/reminders/reminder-provider';

export function ReminderNotificationStatus() {
  const themed_styles = useThemedStyles(styles);
  const runtime = useReminderRuntime();
  const permission = runtime.result?.permission;
  return <View style={themed_styles.card}>
    <Text style={themed_styles.sectionTitle}>Local notifications</Text>
    <Text style={themed_styles.body}>{permission === 'granted' ? 'Notification permission is enabled.'
      : permission === 'unavailable' ? 'Local notifications are available in the Android and iOS app.'
        : permission === 'denied' || permission === 'channel-disabled' ? 'Notifications are disabled in device settings. Your in-app reminders still work.'
          : 'Notifications are optional. You can continue using in-app reminders without granting permission.'}</Text>
    {permission === 'undetermined' && <CoverageAction label="Enable notifications" disabled={runtime.busy} onPress={() => { void runtime.requestPermission(); }} />}
    {Platform.OS !== 'web' && <CoverageAction label="Open device settings" onPress={() => { void Linking.openSettings().catch(() => {}); }} />}
    {runtime.result && <Text style={themed_styles.body}>{runtime.result.scheduled} upcoming notifications scheduled.
      {runtime.result.deferred ? ` ${runtime.result.deferred} later notifications are queued for future reconciliation; reopen LifePilot regularly.` : ''}</Text>}
    {runtime.error && <Text accessibilityRole="alert" style={themed_styles.body}>{runtime.error}</Text>}
    <CoverageAction label={runtime.busy ? 'Updating notifications…' : 'Refresh notifications'} disabled={runtime.busy} onPress={() => { void runtime.refresh(); }} />
  </View>;
}
