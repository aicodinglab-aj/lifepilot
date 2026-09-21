import { Linking, Platform, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { StatusCard } from '@/components/ui/card';
import { StatusBadge, type StatusTone } from '@/components/ui/status';
import { spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { useReminderRuntime } from '@/features/reminders/reminder-provider';

export function ReminderNotificationStatus() {
  const { colors } = useAppearance();
  const runtime = useReminderRuntime();
  const permission = runtime.result?.permission;
  const tone: StatusTone = permission === 'granted' ? 'success'
    : permission === 'denied' || permission === 'channel-disabled' ? 'warning' : 'neutral';
  const label = permission === 'granted' ? 'Available'
    : permission === 'unavailable' ? 'Unavailable in Expo Go'
      : permission === 'denied' || permission === 'channel-disabled' ? 'Disabled' : 'Optional';
  const message = permission === 'granted' ? 'Notification permission is enabled.'
    : permission === 'unavailable' ? (Platform.OS === 'web'
      ? 'Local notifications are available in the Android and iOS app.'
      : 'Notifications require a development, preview or production build. In-app reminders remain available in Expo Go.')
      : permission === 'denied' || permission === 'channel-disabled'
        ? 'Notifications are disabled in device settings. In-app reminders still work.'
        : 'You can continue using in-app reminders without granting notification permission.';
  return <StatusCard tone={tone}>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
      <Text style={[typography.cardTitle, { color: colors.text }]}>Local notifications</Text>
      <StatusBadge label={label} tone={tone} />
    </View>
    <Text style={[typography.caption, { color: colors.muted }]}>{message}</Text>
    {runtime.result && <Text style={[typography.caption, { color: colors.muted }]}>{runtime.result.scheduled} upcoming notifications scheduled.
      {runtime.result.deferred ? ` ${runtime.result.deferred} later notifications are queued for future reconciliation; reopen LifePilot regularly.` : ''}</Text>}
    {runtime.error && <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>{runtime.error}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {permission === 'undetermined' && <Button label="Enable notifications" variant="tertiary" disabled={runtime.busy}
        onPress={() => { void runtime.requestPermission(); }} />}
      {Platform.OS !== 'web' && permission !== 'unavailable' && <Button label="Device settings" variant="tertiary"
        onPress={() => { void Linking.openSettings().catch(() => {}); }} />}
      <Button label="Refresh" variant="tertiary" loading={runtime.busy} onPress={() => { void runtime.refresh(); }} />
    </View>
  </StatusCard>;
}
