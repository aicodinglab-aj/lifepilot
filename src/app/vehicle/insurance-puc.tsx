import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Text, View } from 'react-native';
import { VehiclePage } from '@/components/vehicles/vehicle-page';
import { CoverageAction, CoverageStatusBadge, coverageStyles as styles } from '@/components/vehicles/coverage-ui';
import { coverageTitle } from '@/features/vehicles/coverage-record';
import { retryCoverageCleanup } from '@/features/vehicles/coverage-service';
import { useCoverageSummary } from '@/features/vehicles/use-coverage';
import { useVehicle } from '@/features/vehicles/use-vehicle';

export default function InsurancePucScreen() {
  const state = useVehicle();
  const summary = useCoverageSummary(state.vehicleId);
  const db = useSQLiteContext();
  const [warning, setWarning] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (Number.isSafeInteger(state.vehicleId)) void retryCoverageCleanup(db, state.vehicleId)
      .then(() => { if (active) setWarning(null); })
      .catch((cause: unknown) => { if (active) setWarning(cause instanceof Error ? cause.message : 'Document cleanup needs retry.'); });
    return () => { active = false; };
    // Retry reruns cleanup while focused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, state.vehicleId, retry]));
  return <VehiclePage title="Insurance & PUC" loading={state.loading || summary.loading} error={state.error || summary.error}
    reload={() => { state.reload(); summary.reload(); }}>
    {state.vehicle && summary.data && <>
      <Text style={styles.eyebrow}>{state.vehicle.registrationNumber}</Text>
      <Text style={styles.title}>Insurance & PUC</Text>
      {warning && <View style={styles.card}><Text accessibilityRole="alert" style={styles.body}>{warning}</Text>
        <CoverageAction label="Retry cleanup" onPress={() => setRetry((n) => n + 1)} /></View>}
      {(['insurance', 'puc'] as const).map((kind) => {
        const record = summary.data?.[kind] ?? null;
        const params = { id: String(state.vehicleId), kind };
        return <View key={kind} style={styles.card}>
          <Text style={styles.sectionTitle}>{coverageTitle(kind)}</Text>
          <CoverageStatusBadge record={record} today={summary.today} />
          {record?.provider && <Text style={styles.body}>{record.provider}</Text>}
          {record && <CoverageAction label={`View ${coverageTitle(kind)}`} onPress={() => router.push({ pathname: '/vehicle/coverage-details', params: { ...params, recordId: record.id } })} />}
          <CoverageAction label={`Add ${coverageTitle(kind)}`} onPress={() => router.push({ pathname: '/vehicle/coverage-edit', params })} />
          <CoverageAction label={`${coverageTitle(kind)} history`} onPress={() => router.push({ pathname: '/vehicle/coverage-history', params })} />
        </View>;
      })}
      <Text style={styles.body}>Expiring soon means within 30 days. Current coverage is shown before future renewals; all records remain in history.</Text>
    </>}
  </VehiclePage>;
}
