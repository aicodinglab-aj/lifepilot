import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VehicleHeader, VehiclePage } from '@/components/vehicles/vehicle-page';
import { ServiceAction, serviceStyles as styles } from '@/components/vehicles/service-ui';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { getServiceHistory, getServiceSummary, SERVICE_PAGE_SIZE } from '@/database/vehicle-services';
import { nextServiceLabel, serviceMoney, type ServiceRecord } from '@/features/vehicles/service-record';
import { retryServiceCleanup } from '@/features/vehicles/service-maintenance';
import { useVehicle } from '@/features/vehicles/use-vehicle';

export default function ServiceHistoryScreen() {
  const vehicleState = useVehicle();
  const { vehicle, vehicleId } = vehicleState;
  const db = useSQLiteContext();
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getServiceSummary>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [paging, setPaging] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const generation = useRef(0);
  const fetching = useRef(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    const token = ++generation.current;
    setLoading(true); fetching.current = false; setPaging(false); setPageError(null);
    void (async () => {
      try {
        if (!Number.isSafeInteger(vehicleId)) throw new Error('Invalid vehicle link.');
        let warning: string | null = null;
        try { await retryServiceCleanup(db, vehicleId); }
        catch (cause) { warning = cause instanceof Error ? cause.message : 'Bill cleanup needs retry.'; }
        const [history, totals] = await Promise.all([getServiceHistory(db, vehicleId), getServiceSummary(db, vehicleId)]);
        if (generation.current === token) {
          setRecords(history); setSummary(totals); setMore(history.length === SERVICE_PAGE_SIZE); setError(null); setCleanupError(warning);
        }
      } catch (cause) { if (generation.current === token) setError(cause instanceof Error ? cause.message : 'Could not load services.'); }
      finally { if (generation.current === token) setLoading(false); }
    })();
    return () => { generation.current++; };
    // Retry reruns the load while focused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, vehicleId, retry]));
  async function loadMore() {
    if (!more || fetching.current || loading) return;
    fetching.current = true; setPaging(true); setPageError(null);
    const token = generation.current;
    try {
      const page = await getServiceHistory(db, vehicleId, records[records.length - 1]);
      if (token === generation.current) { setRecords((previous) => [...previous, ...page]); setMore(page.length === SERVICE_PAGE_SIZE); }
    } catch { if (token === generation.current) setPageError('Could not load more services.'); }
    finally { if (token === generation.current) { fetching.current = false; setPaging(false); } }
  }
  const add = () => router.push({ pathname: '/vehicle/add-service', params: { id: String(vehicleId) } });
  if (vehicleState.loading || loading || vehicleState.error || error || !vehicle) {
    return <VehiclePage title="Service & Maintenance" loading={vehicleState.loading || loading}
      error={vehicleState.error || error} reload={() => { vehicleState.reload(); setRetry((n) => n + 1); }} />;
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
    <VehicleHeader title="Service & Maintenance" action={{ label: 'Add Service', onPress: add }} />
    <FlatList data={records} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
      onEndReached={() => { if (!pageError) void loadMore(); }} onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={styles.section}>
        <Text style={styles.eyebrow}>{vehicle.registrationNumber}</Text>
        <Text style={styles.title}>Service & Maintenance</Text>
        <View style={styles.card}>
          <Text style={styles.body}>Latest Service</Text><Text style={styles.accent}>{summary?.latest?.serviceDate ?? 'Not added'}</Text>
          <Text style={styles.body}>Next Service</Text><Text style={styles.accent}>{nextServiceLabel(summary?.latest ?? null)}</Text>
          <Text style={styles.body}>Total Maintenance Cost</Text><Text style={styles.sectionTitle}>{serviceMoney(summary?.total ?? null)}</Text>
          {!!summary?.missing && <Text style={styles.body}>{summary.missing} service(s) have no costs added.</Text>}
          <Text style={styles.body}>Next service uses the latest service record.</Text>
        </View>
        {cleanupError && <View style={styles.card}><Text accessibilityRole="alert" style={styles.body}>{cleanupError}</Text>
          <ServiceAction label="Retry cleanup" onPress={() => setRetry((n) => n + 1)} /></View>}
      </View>}
      ListEmptyComponent={<View style={styles.card}><Text style={styles.sectionTitle}>No service records yet</Text>
        <Text style={styles.body}>Keep workshop visits, maintenance costs and bills together for this vehicle.</Text>
        <ServiceAction label="Add Service" onPress={add} /></View>}
      ListFooterComponent={paging ? <ActivityIndicator color={colors.green} /> : pageError ? <View style={styles.section}>
        <Text style={styles.body}>{pageError}</Text><ServiceAction label="Try again" onPress={() => { void loadMore(); }} /></View> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.title}, ${item.serviceDate}`}
        onPress={() => router.push({ pathname: '/vehicle/service-details', params: { id: String(vehicleId), serviceId: item.id } })} style={styles.card}>
        <Text style={styles.eyebrow}>{item.serviceDate} · {item.odometer.toLocaleString()} km</Text>
        <Text style={styles.sectionTitle}>{item.title}</Text>
        {item.workshop && <Text style={styles.body}>{item.workshop}</Text>}
        <Text style={styles.accent}>{serviceMoney(item.totalCost)}</Text>
        {(item.nextServiceDate || item.nextServiceOdometer != null) && <Text style={styles.body}>Next: {nextServiceLabel(item)}</Text>}
      </Pressable>} />
  </SafeAreaView>;
}
