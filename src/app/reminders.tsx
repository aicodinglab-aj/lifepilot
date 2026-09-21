import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReminderNotificationStatus } from '@/components/vehicles/reminder-status';
import { VehiclePage } from '@/components/vehicles/vehicle-page';
import { InteractiveCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatusBadge, type StatusTone } from '@/components/ui/status';
import { iconSizes, spacing, typography } from '@/constants/design-system';
import { getReminderPreferences, getReminderSources } from '@/database/reminders';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { dateReminderLabel, odometerStatus, reminderTitle, type ReminderSource } from '@/features/reminders/reminder';
import { useReminderRuntime } from '@/features/reminders/reminder-provider';
import { calendarDay, coverageDate } from '@/features/vehicles/coverage-status';
import { useCoverageToday } from '@/features/vehicles/use-coverage';

type ReminderSection = { title: 'Upcoming' | 'Overdue / Expired' | 'Service mileage'; data: ReminderSource[] };

export default function RemindersScreen() {
  const { colors } = useAppearance();
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
  const sections: ReminderSection[] = [
    { title: 'Upcoming', data: upcoming }, { title: 'Overdue / Expired', data: overdue }, { title: 'Service mileage', data: mileage },
  ];
  const allEmpty = sections.every((section) => section.data.length === 0);
  function open(source: ReminderSource) {
    const params = { id: String(source.vehicleId) };
    if (source.sourceType === 'service') router.push({ pathname: '/vehicle/service-details', params: { ...params, serviceId: source.recordId } });
    else router.push({ pathname: '/vehicle/coverage-details', params: { ...params, kind: source.sourceType, recordId: source.recordId } });
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="Vehicle Reminders" fallbackHref="/vehicle-manager" rightAction={{ accessibilityLabel: 'Reminder settings', onPress: settings,
      icon: <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={iconSizes.navigation} tintColor={colors.primary} /> }} />
    <SectionList sections={sections} keyExtractor={(source) => source.id} stickySectionHeadersEnabled={false}
      contentContainerStyle={{ flexGrow: 1, padding: spacing.base, paddingBottom: spacing.xl, gap: spacing.md }}
      ListHeaderComponent={<View style={{ gap: spacing.xs, marginBottom: spacing.sm }}>
        <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.text }]}>What needs attention</Text>
        <Text style={[typography.secondaryBody, { color: colors.muted }]}>Due dates and service mileage across your vehicles.</Text>
      </View>}
      renderSectionHeader={({ section }) => <Text accessibilityRole="header"
        style={[typography.sectionHeading, { color: colors.text, marginTop: spacing.md }]}>{section.title}</Text>}
      renderSectionFooter={({ section }) => !section.data.length ? allEmpty
        ? <Text style={[typography.secondaryBody, { color: colors.muted, paddingVertical: spacing.sm }]}>{emptyDescription(section.title)}</Text>
        : <EmptyState title={`No ${section.title.toLowerCase()} reminders`} description={emptyDescription(section.title)} /> : null}
      renderItem={({ item, section }) => {
        const miles = section.title === 'Service mileage' ? odometerStatus(item.odometer, item.dueOdometer, threshold) : null;
        const status = miles ? `${miles.state} · ${miles.message}` : dateReminderLabel(item, today);
        return <InteractiveCard accessibilityLabel={`View ${reminderTitle(item.sourceType)} for ${item.registration}`}
          onPress={() => open(item)} leading={<SymbolView name={reminderIcon(item.sourceType)} size={iconSizes.card} tintColor={colors.primary} />}
          trailing={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={iconSizes.action} tintColor={colors.primary} />}>
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
              <Text style={[typography.cardTitle, { color: colors.text }]}>{item.registration}</Text>
              <StatusBadge label={reminderTitle(item.sourceType)} />
            </View>
            <StatusBadge label={status} tone={reminderTone(section.title, miles?.state, status)} />
            <Text style={[typography.secondaryBody, { color: colors.muted }]}>{miles
              ? `Current ${item.odometer.toLocaleString()} km · Service at ${item.dueOdometer?.toLocaleString()} km`
              : coverageDate(item.dueDate)}</Text>
            {miles && <Text style={[typography.caption, { color: colors.muted }]}>Based on the last entered odometer.</Text>}
          </View>
        </InteractiveCard>;
      }}
      ListFooterComponent={<View style={{ paddingTop: spacing.lg, gap: spacing.sm }}>
        <Text accessibilityRole="header" style={[typography.sectionHeading, { color: colors.text }]}>Notification delivery</Text>
        <ReminderNotificationStatus />
      </View>} />
  </SafeAreaView>;
}

function emptyDescription(title: ReminderSection['title']) {
  if (title === 'Upcoming') return 'Add an Insurance, PUC or next-service date to see it here.';
  if (title === 'Overdue / Expired') return 'No recorded vehicle dates are currently overdue or expired.';
  return 'Add a next-service odometer to track mileage reminders.';
}

function reminderTone(section: ReminderSection['title'], mileageState: string | undefined, label: string): StatusTone {
  if (section === 'Overdue / Expired' || mileageState === 'Overdue') return 'danger';
  if (mileageState === 'Due' || mileageState === 'Approaching' || /today|in 1 day/i.test(label)) return 'warning';
  return 'neutral';
}

function reminderIcon(type: ReminderSource['sourceType']) {
  if (type === 'insurance') return { ios: 'shield', android: 'shield', web: 'shield' } as const;
  if (type === 'puc') return { ios: 'checkmark.seal', android: 'verified', web: 'verified' } as const;
  return { ios: 'wrench.and.screwdriver', android: 'build', web: 'build' } as const;
}
