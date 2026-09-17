import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Switch, Text, View } from 'react-native';
import { VehiclePage } from '@/components/vehicles/vehicle-page';
import { CoverageAction, coverageStyles as styles } from '@/components/vehicles/coverage-ui';
import { FormTextField } from '@/components/forms/form-text-field';
import { ReminderNotificationStatus } from '@/components/vehicles/reminder-status';
import { getReminderIntervals, getReminderPreferences, setReminderInterval, setReminderPreferences } from '@/database/reminders';
import { intervalLabel, reminderTitle, type ReminderInterval, type ReminderPreferences } from '@/features/reminders/reminder';
import { useReminderRuntime } from '@/features/reminders/reminder-provider';
import { scheduleDebugReminder } from '@/features/reminders/notifications';
import { reminderTestEnabled } from '@/features/reminders/test-build';

export default function ReminderSettingsScreen() {
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
      <Text style={styles.title}>Reminder Settings</Text>
      <Text style={styles.body}>Defaults apply to all vehicles and existing records. Date reminders target 9:00 a.m. local time; device power settings may delay delivery.</Text>
      <ReminderNotificationStatus />
      <View style={styles.card}><Text style={styles.sectionTitle}>Schedule local notifications</Text>
        <Switch accessibilityLabel="Schedule local notifications" disabled={busy} value={!!preferences.notificationsEnabled} onValueChange={(enabled) => { void perform(async () => {
          await setReminderPreferences(db, enabled, preferences.mileageThreshold);
          setPreferences({ ...preferences, notificationsEnabled: enabled ? 1 : 0 });
        }); }} />
        <Text style={styles.body}>Turning this off keeps in-app reminders and cancels pending vehicle notifications.</Text>
      </View>
      {(['insurance', 'puc', 'service'] as const).map((type) => <View key={type} style={styles.card}>
        <Text style={styles.sectionTitle}>{reminderTitle(type)} reminders</Text>
        {intervals.filter((item) => item.sourceType === type).map((item) => <View key={item.offsetDays} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={styles.body}>{intervalLabel(item.offsetDays)}</Text>
          <Switch accessibilityLabel={`${reminderTitle(type)}: ${intervalLabel(item.offsetDays)}`} disabled={busy} value={!!item.enabled}
            onValueChange={(enabled) => { void perform(async () => {
              await setReminderInterval(db, type, item.offsetDays, enabled);
              setIntervals((current) => current.map((row) => row.sourceType === type && row.offsetDays === item.offsetDays ? { ...row, enabled: enabled ? 1 : 0 } : row));
            }); }} />
        </View>)}
      </View>)}
      <View style={styles.card}><Text style={styles.sectionTitle}>Service mileage warning</Text>
        <FormTextField label="Warn this many km before service" value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" editable={!busy} />
        <Text style={styles.body}>Uses your entered odometer. Mileage alone never schedules a calendar notification.</Text>
        <CoverageAction label="Save mileage threshold" disabled={busy} onPress={() => { void perform(async () => {
          if (!/^\d+(\.\d+)?$/.test(threshold.trim())) throw new Error('Enter a non-negative number of kilometres.');
          await setReminderPreferences(db, !!preferences.notificationsEnabled, Number(threshold));
          setPreferences({ ...preferences, mileageThreshold: Number(threshold) });
        }); }} />
      </View>
      {reminderTestEnabled && <View style={styles.card}>
        <Text style={styles.sectionTitle}>Notification testing</Text>
        <Text style={styles.body}>Preview/development only. Sends one local test even if regular scheduling is off. No vehicle records or reminder intervals are changed. Enable notification permission above first.</Text>
        <CoverageAction label="Test notification in 10 seconds" disabled={busy} onPress={() => { void testNotification(); }} />
      </View>}
    </>}
  </VehiclePage>;
}
