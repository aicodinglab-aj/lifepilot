import { useThemedStyles } from '@/features/appearance/appearance-provider';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VehicleHeader, VehiclePage } from '@/components/vehicles/vehicle-page';
import { CoverageAction, coverageStyles as styles } from '@/components/vehicles/coverage-ui';
import { ReminderNotificationStatus } from '@/components/vehicles/reminder-status';
import { getReminderPreferences, getReminderSources } from '@/database/reminders';
import { dateReminderLabel, odometerStatus, reminderTitle, type ReminderSource } from '@/features/reminders/reminder';
import { useReminderRuntime } from '@/features/reminders/reminder-provider';
import { calendarDay, coverageDate } from '@/features/vehicles/coverage-status';
import { useCoverageToday } from '@/features/vehicles/use-coverage';

export default function RemindersScreen() {
  const themed_styles = useThemedStyles(styles);
  const db = useSQLiteContext(), today = useCoverageToday();
  const runtime = useReminderRuntime();
  const [sources, setSources] = useState<ReminderSource[]>([]);
  const [threshold, setThreshold] = useState(500), [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const revision = runtime.result?.revision;
  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      try {
        const [records, settings] = await Promise.all([getReminderSources(db, today), getReminderPreferences(db)]);
        if (active) { setSources(records); setThreshold(settings.mileageThreshold); setError(null); }
      } catch { if (active) setError('Could not load vehicle reminders. Please try again.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
    // Revision/retry trigger a refresh after committed changes or an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, today, revision, retry]));
  const settings = () => router.push('/reminder-settings');
  if (loading || error) return <VehiclePage title="Vehicle Reminders" loading={loading} error={error} reload={() => setRetry((n) => n + 1)} />;
  const day = calendarDay(today)!;
  const dated = sources.filter((source) => calendarDay(source.dueDate) != null);
  const upcoming = dated.filter((source) => calendarDay(source.dueDate)! >= day).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const overdue = dated.filter((source) => calendarDay(source.dueDate)! < day).sort((a, b) => b.dueDate!.localeCompare(a.dueDate!));
  const mileage = sources.filter((source) => source.sourceType === 'service' && source.dueOdometer != null)
    .sort((a, b) => (a.dueOdometer! - a.odometer) - (b.dueOdometer! - b.odometer));
  function open(source: ReminderSource) {
    const params = { id: String(source.vehicleId) };
    if (source.sourceType === 'service') router.push({ pathname: '/vehicle/service-details', params: { ...params, serviceId: source.recordId } });
    else router.push({ pathname: '/vehicle/coverage-details', params: { ...params, kind: source.sourceType, recordId: source.recordId } });
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={themed_styles.screen}>
    <VehicleHeader title="Vehicle Reminders" action={{ label: 'Settings', onPress: settings }} />
    <SectionList sections={[{ title: 'Upcoming', data: upcoming }, { title: 'Overdue / Expired', data: overdue }, { title: 'Service mileage', data: mileage }]}
      keyExtractor={(source) => source.id} contentContainerStyle={themed_styles.content} stickySectionHeadersEnabled={false}
      ListHeaderComponent={<View style={themed_styles.section}>
        <Text style={themed_styles.title}>Vehicle Reminders</Text>
        <Text style={themed_styles.body}>Due dates across your vehicles. Notification intervals affect alerts; records remain visible here.</Text>
        <ReminderNotificationStatus />
        {!upcoming.length && <View style={themed_styles.card}><Text style={themed_styles.sectionTitle}>No upcoming date reminders</Text>
          <Text style={themed_styles.body}>Add Insurance, PUC or a next-service date to a vehicle.</Text></View>}
      </View>}
      renderSectionHeader={({ section }) => <Text style={themed_styles.sectionTitle}>{section.title}</Text>}
      renderSectionFooter={({ section }) => !section.data.length ? <Text style={themed_styles.body}>None to show</Text> : null}
      renderItem={({ item, section }) => {
        const miles = section.title === 'Service mileage' ? odometerStatus(item.odometer, item.dueOdometer, threshold) : null;
        return <Pressable accessibilityRole="button" accessibilityLabel={`View ${reminderTitle(item.sourceType)} for ${item.registration}`} onPress={() => open(item)} style={themed_styles.card}>
          <Text style={themed_styles.eyebrow}>{reminderTitle(item.sourceType)}</Text><Text style={themed_styles.sectionTitle}>{item.registration}</Text>
          <Text style={themed_styles.accent}>{miles ? `${miles.state} · ${miles.message}` : dateReminderLabel(item, today)}</Text>
          <Text style={themed_styles.body}>{miles ? `Current: ${item.odometer.toLocaleString()} km · Next service: ${item.dueOdometer?.toLocaleString()} km` : coverageDate(item.dueDate)}</Text>
          {miles && <Text style={themed_styles.body}>Based on your last entered odometer. Update Vehicle Details after driving.</Text>}
        </Pressable>;
      }}
      ListFooterComponent={<CoverageAction label="Reminder settings" onPress={settings} />} />
  </SafeAreaView>;
}
