import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Text, View } from 'react-native';
import { ReminderNotificationStatus } from '@/components/vehicles/reminder-status';
import { VehiclePage } from '@/components/vehicles/vehicle-page';
import { Button } from '@/components/ui/button';
import { StandardCard } from '@/components/ui/card';
import { FormInput, ToggleRow } from '@/components/ui/form-controls';
import { Section } from '@/components/ui/section';
import { spacing, typography } from '@/constants/design-system';
import { getReminderIntervals, getReminderPreferences, setReminderInterval, setReminderPreferences } from '@/database/reminders';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { intervalLabel, reminderTitle, type ReminderInterval, type ReminderPreferences } from '@/features/reminders/reminder';
import { scheduleDebugReminder } from '@/features/reminders/notifications';
import { useReminderRuntime } from '@/features/reminders/reminder-provider';
import { reminderTestEnabled } from '@/features/reminders/test-build';

export default function ReminderSettingsScreen() {
  const { colors } = useAppearance();
  const db = useSQLiteContext(), runtime = useReminderRuntime();
  const [intervals, setIntervals] = useState<ReminderInterval[]>([]), [preferences, setPreferences] = useState<ReminderPreferences | null>(null);
  const [threshold, setThreshold] = useState('500'), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const working = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      try {
        const [rows, settings] = await Promise.all([getReminderIntervals(db), getReminderPreferences(db)]);
        if (active) { setIntervals(rows); setPreferences(settings); setThreshold(String(settings.mileageThreshold)); setError(null); }
      } catch { if (active) setError('Could not load reminder settings.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
    // Retry reloads settings while focused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, retry]));
  async function perform(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true);
    try { await action(); await runtime.refresh(); }
    catch (cause) { Alert.alert('Could not update reminders', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function testNotification() {
    if (working.current) return;
    working.current = true; setBusy(true);
    try {
      await scheduleDebugReminder();
      Alert.alert('Test scheduled', 'A local test notification is due in approximately 10 seconds. Background the app and check the notification tray. Android power settings may delay delivery.');
    } catch (cause) {
      console.error('LifePilot test notification failed', cause);
      Alert.alert('Test notification failed', cause instanceof Error ? cause.message : 'Could not schedule the local notification. Please try again.');
    } finally { working.current = false; setBusy(false); }
  }
  return <VehiclePage title="Reminder Settings" loading={loading} error={error} reload={() => setRetry((n) => n + 1)}>
    {preferences && <>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.text }]}>Reminder Settings</Text>
        <Text style={[typography.secondaryBody, { color: colors.muted }]}>Defaults apply to every vehicle and existing record. Date alerts target 9:00 a.m. local time.</Text>
      </View>

      <StandardCard>
        <Section title="Local notifications">
          <ToggleRow label="Schedule local notifications"
            description="Turning this off keeps in-app reminders and cancels pending vehicle notifications."
            disabled={busy} value={!!preferences.notificationsEnabled} onValueChange={(enabled) => { void perform(async () => {
              await setReminderPreferences(db, enabled, preferences.mileageThreshold);
              setPreferences({ ...preferences, notificationsEnabled: enabled ? 1 : 0 });
            }); }} />
        </Section>
      </StandardCard>

      <StandardCard>
        <Section title="Date reminder intervals" subtitle="Choose when Insurance, PUC and Service alerts should be scheduled.">
          {(['insurance', 'puc', 'service'] as const).map((type, index) => <View key={type}
            style={{ gap: spacing.xs, paddingTop: index ? spacing.sm : 0, borderTopWidth: index ? 1 : 0, borderTopColor: colors.divider }}>
            <Text style={[typography.label, { color: colors.text }]}>{reminderTitle(type)}</Text>
            {intervals.filter((item) => item.sourceType === type).map((item) => <ToggleRow key={item.offsetDays}
              label={intervalLabel(item.offsetDays)} disabled={busy} value={!!item.enabled}
              onValueChange={(enabled) => { void perform(async () => {
                await setReminderInterval(db, type, item.offsetDays, enabled);
                setIntervals((current) => current.map((row) => row.sourceType === type && row.offsetDays === item.offsetDays
                  ? { ...row, enabled: enabled ? 1 : 0 } : row));
              }); }} />)}
          </View>)}
        </Section>
      </StandardCard>

      <StandardCard>
        <Section title="Service mileage warning" subtitle="Mileage reminders use the odometer saved in Vehicle Details.">
          <FormInput label="Warn this many km before service" value={threshold} onChangeText={setThreshold}
            keyboardType="decimal-pad" editable={!busy} />
          <Text style={[typography.caption, { color: colors.muted }]}>Mileage alone never schedules a calendar notification.</Text>
          <Button label="Save mileage threshold" variant="secondary" disabled={busy} onPress={() => { void perform(async () => {
            if (!/^\d+(\.\d+)?$/.test(threshold.trim())) throw new Error('Enter a non-negative number of kilometres.');
            await setReminderPreferences(db, !!preferences.notificationsEnabled, Number(threshold));
            setPreferences({ ...preferences, mileageThreshold: Number(threshold) });
          }); }} />
        </Section>
      </StandardCard>

      {reminderTestEnabled && <StandardCard>
        <Section title="Notification testing" subtitle="Available only in preview and development builds.">
          <Text style={[typography.secondaryBody, { color: colors.muted }]}>Sends one local test without changing vehicle records or reminder intervals.</Text>
          <Button label="Test notification in 10 seconds" variant="secondary" disabled={busy} onPress={() => { void testNotification(); }} />
        </Section>
      </StandardCard>}

      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={[typography.sectionHeading, { color: colors.text }]}>Notification status</Text>
        <ReminderNotificationStatus />
      </View>
    </>}
  </VehiclePage>;
}
