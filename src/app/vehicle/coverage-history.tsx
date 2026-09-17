import { useThemedStyles, useAppearance } from '@/features/appearance/appearance-provider';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VehicleHeader, VehiclePage } from '@/components/vehicles/vehicle-page';
import { CoverageAction, CoverageStatusBadge, coverageStyles as styles } from '@/components/vehicles/coverage-ui';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { COVERAGE_PAGE_SIZE, getCoverageHistory } from '@/database/vehicle-coverage';
import { coverageTitle, parseCoverageKind, type CoverageRecord } from '@/features/vehicles/coverage-record';
import { serviceMoney } from '@/features/vehicles/service-record';
import { useCoverageToday } from '@/features/vehicles/use-coverage';
import { useVehicle } from '@/features/vehicles/use-vehicle';

export default function CoverageHistoryScreen() {
  const themed_styles = useThemedStyles(styles);
  const appearance = useAppearance();
  const { kind: routeKind } = useLocalSearchParams<{ kind: string }>();
  const state = useVehicle();
  const db = useSQLiteContext();
  const today = useCoverageToday();
  const [records, setRecords] = useState<CoverageRecord[]>([]);
  const [loading, setLoading] = useState(true), [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null), [pageError, setPageError] = useState<string | null>(null);
  const [more, setMore] = useState(false), [retry, setRetry] = useState(0);
  const generation = useRef(0), fetching = useRef(false);
  useFocusEffect(useCallback(() => {
    const token = ++generation.current; fetching.current = false; setPaging(false); setLoading(true); setPageError(null);
    void (async () => {
      try {
        const rows = await getCoverageHistory(db, parseCoverageKind(routeKind), state.vehicleId);
        if (generation.current === token) { setRecords(rows); setMore(rows.length === COVERAGE_PAGE_SIZE); setError(null); }
      } catch (cause) { if (generation.current === token) setError(cause instanceof Error ? cause.message : 'Could not load history.'); }
      finally { if (generation.current === token) setLoading(false); }
    })();
    return () => { generation.current++; };
    // Retry refreshes while focused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, routeKind, state.vehicleId, retry]));
  async function loadMore() {
    if (!more || fetching.current || loading) return;
    const token = generation.current; fetching.current = true; setPaging(true); setPageError(null);
    try {
      const rows = await getCoverageHistory(db, parseCoverageKind(routeKind), state.vehicleId, records[records.length - 1]);
      if (generation.current === token) { setRecords((previous) => [...previous, ...rows]); setMore(rows.length === COVERAGE_PAGE_SIZE); }
    } catch { if (generation.current === token) setPageError('Could not load more records.'); }
    finally { if (generation.current === token) { fetching.current = false; setPaging(false); } }
  }
  const title = routeKind === 'insurance' ? 'Insurance' : 'PUC';
  if (loading || state.loading || error || state.error) return <VehiclePage title={`${title} History`} loading={loading || state.loading}
    error={error || state.error} reload={() => { state.reload(); setRetry((n) => n + 1); }} />;
  const kind = parseCoverageKind(routeKind);
  const params = { id: String(state.vehicleId), kind };
  const add = () => router.push({ pathname: '/vehicle/coverage-edit', params });
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={themed_styles.screen}>
    <VehicleHeader title={`${title} History`} action={{ label: `Add ${title}`, onPress: add }} />
    <FlatList data={records} keyExtractor={(record) => record.id} contentContainerStyle={themed_styles.content}
      onEndReached={() => { if (!pageError) void loadMore(); }} onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={themed_styles.section}><Text style={themed_styles.eyebrow}>{state.vehicle?.registrationNumber}</Text>
        <Text style={themed_styles.title}>{title} History</Text><Text style={themed_styles.body}>Latest expiry first. Previous records stay here when you add a renewal.</Text></View>}
      ListEmptyComponent={<View style={themed_styles.card}><Text style={themed_styles.sectionTitle}>No {title} records yet</Text>
        <CoverageAction label={`Add ${title}`} onPress={add} /></View>}
      ListFooterComponent={paging ? <ActivityIndicator color={appearance.colors.green} /> : pageError ? <View style={themed_styles.section}>
        <Text style={themed_styles.body}>{pageError}</Text><CoverageAction label="Try again" onPress={() => { void loadMore(); }} /></View> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`View ${coverageTitle(kind)} ${item.number ?? item.expiryDate}`}
        style={themed_styles.card} onPress={() => router.push({ pathname: '/vehicle/coverage-details', params: { ...params, recordId: item.id } })}>
        <Text style={themed_styles.sectionTitle}>{item.provider ?? title}</Text><Text style={themed_styles.body}>{item.number ?? 'Not added'}</Text>
        <CoverageStatusBadge record={item} today={today} /><Text style={themed_styles.accent}>{serviceMoney(item.amount)}</Text>
      </Pressable>} />
  </SafeAreaView>;
}
