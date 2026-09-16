import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, Text, View } from 'react-native';
import { VehiclePage } from '@/components/vehicles/vehicle-page';
import { CoverageAction, CoverageDocumentImage, CoverageDocumentViewer, CoverageStatusBadge, coverageStyles as styles } from '@/components/vehicles/coverage-ui';
import { getCoverageDocuments, getCoverageRecord } from '@/database/vehicle-coverage';
import { coverageFields, parseCoverageKind, type CoverageDocument, type CoverageRecord } from '@/features/vehicles/coverage-record';
import { deleteCoverage } from '@/features/vehicles/coverage-service';
import { coverageDate } from '@/features/vehicles/coverage-status';
import { useCoverageToday } from '@/features/vehicles/use-coverage';
import { parseVehicleId } from '@/features/vehicles/vehicle-details';
import { serviceMoney } from '@/features/vehicles/service-record';
import { availableCoverageDocumentUri } from '@/storage/coverage-documents';

export default function CoverageDetailsScreen() {
  const { kind: routeKind, id, recordId } = useLocalSearchParams<{ kind: string; id: string; recordId: string }>();
  const vehicleId = parseVehicleId(id);
  const db = useSQLiteContext(), today = useCoverageToday();
  const [record, setRecord] = useState<CoverageRecord | null>(null);
  const [documents, setDocuments] = useState<CoverageDocument[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [viewing, setViewing] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const focused = useRef(false), working = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true; focused.current = true; setLoading(true);
    void (async () => {
      try {
        const kind = parseCoverageKind(routeKind);
        if (typeof recordId !== 'string') throw new Error('Invalid record link.');
        const [found, docs] = await Promise.all([getCoverageRecord(db, kind, vehicleId, recordId), getCoverageDocuments(db, kind, vehicleId, recordId)]);
        if (active) { setRecord(found); setDocuments(docs); setError(found ? null : 'This record no longer exists.'); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load record.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; focused.current = false; };
    // Retry reruns the load while focused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, routeKind, vehicleId, recordId, retry]));
  async function remove() {
    if (working.current) return;
    working.current = true; setBusy(true);
    try {
      const kind = parseCoverageKind(routeKind);
      const result = await deleteCoverage(db, kind, vehicleId, recordId);
      if (focused.current) {
        if (result.cleanupPending) Alert.alert('Record deleted', 'Document cleanup is pending. Retry from Insurance & PUC or My Garage.');
        router.dismissTo({ pathname: '/vehicle/insurance-puc', params: { id: String(vehicleId) } });
      }
    } catch (cause) { if (focused.current) Alert.alert('Could not delete record', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  const title = routeKind === 'insurance' ? 'Insurance' : 'PUC';
  function confirmDelete() {
    Alert.alert(`Delete ${title}?`, 'Permanently delete this record and its attached document photos?', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void remove(); } },
    ]);
  }
  if (loading || error || !record) return <VehiclePage title={`${title} Details`} loading={loading} error={error} reload={() => setRetry((n) => n + 1)} />;
  const kind = parseCoverageKind(routeKind);
  return <VehiclePage title={`${title} Details`}>
    <Text style={styles.title}>{title} Details</Text>
    <View style={styles.card}><CoverageStatusBadge record={record} today={today} /></View>
    <View style={styles.card}>{coverageFields(kind).map((field) => {
      const value = record[field.key];
      return <View key={field.key} style={styles.section}><Text style={styles.body}>{field.label}</Text>
        <Text selectable style={styles.accent}>{field.numeric ? serviceMoney(record.amount) : field.date ? coverageDate(typeof value === 'string' ? value : null) : value == null ? 'Not added' : String(value)}</Text></View>;
    })}</View>
    <CoverageAction label={`Edit ${title}`} disabled={busy} onPress={() => router.push({ pathname: '/vehicle/coverage-edit', params: { id: String(vehicleId), kind, recordId } })} />
    <Text style={styles.sectionTitle}>Attached Documents</Text>
    {!documents.length && <Text style={styles.body}>Not added</Text>}
    {documents.map((doc, index) => {
      const uri = availableCoverageDocumentUri(kind, doc);
      return <Pressable key={doc.id} accessibilityRole="button" accessibilityLabel={`View document ${index + 1}`} disabled={!uri} onPress={() => setViewing(uri)}>
        <CoverageDocumentImage uri={uri} /></Pressable>;
    })}
    <CoverageAction label={busy ? 'Deleting…' : `Delete ${title}`} disabled={busy} onPress={confirmDelete} />
    <CoverageDocumentViewer uri={viewing} close={() => setViewing(null)} />
  </VehiclePage>;
}
