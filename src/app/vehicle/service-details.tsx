import { useThemedStyles } from '@/features/appearance/appearance-provider';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, Text, View } from 'react-native';
import { VehiclePage } from '@/components/vehicles/vehicle-page';
import { BillImage, BillViewer, ServiceAction, serviceStyles as styles } from '@/components/vehicles/service-ui';
import { getService, getServiceBills } from '@/database/vehicle-services';
import { deleteService } from '@/features/vehicles/service-maintenance';
import { serviceFields, serviceMoney, type ServiceBill, type ServiceRecord } from '@/features/vehicles/service-record';
import { parseVehicleId } from '@/features/vehicles/vehicle-details';
import { availableServiceBillUri, validateServiceOwner } from '@/storage/service-bills';

export default function ServiceDetailsScreen() {
  const themed_styles = useThemedStyles(styles);
  const params = useLocalSearchParams<{ id: string; serviceId: string }>();
  const vehicleId = parseVehicleId(params.id);
  const serviceId = typeof params.serviceId === 'string' ? params.serviceId : '';
  const db = useSQLiteContext();
  const [record, setRecord] = useState<ServiceRecord | null>(null);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const focused = useRef(false);
  const [viewing, setViewing] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true; focused.current = true; setLoading(true);
    void (async () => {
      try {
        validateServiceOwner(vehicleId, serviceId);
        const [found, photos] = await Promise.all([getService(db, vehicleId, serviceId), getServiceBills(db, vehicleId, serviceId)]);
        if (active) { setRecord(found); setBills(photos); setError(found ? null : 'This service no longer exists.'); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load service.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; focused.current = false; };
    // Retry reruns the load while focused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, vehicleId, serviceId, retry]));
  async function remove() {
    if (working.current) return;
    working.current = true; setBusy(true);
    try {
      const result = await deleteService(db, vehicleId, serviceId);
      if (focused.current) {
        if (result.cleanupPending) Alert.alert('Service deleted', 'Bill file cleanup is pending. Retry cleanup from Service & Maintenance or My Garage.');
        router.dismissTo({ pathname: '/vehicle/services', params: { id: String(vehicleId) } });
      }
    } catch (cause) { if (focused.current) Alert.alert('Could not delete service', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  function confirmDelete() {
    Alert.alert('Delete service?', 'Permanently delete this service record and its bill photos?', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete Service', style: 'destructive', onPress: () => { void remove(); } },
    ]);
  }
  return <VehiclePage title="Service Details" loading={loading} error={error} reload={() => setRetry((n) => n + 1)}>
    {record && <>
      <Text style={themed_styles.title}>{record.title}</Text>
      <View style={themed_styles.card}>{serviceFields.map((field) => {
        const value = record[field.key];
        const formatted = field.key.endsWith('Cost') ? serviceMoney(typeof value === 'number' ? value : null)
          : value == null ? 'Not added' : field.key === 'odometer' || field.key === 'nextServiceOdometer' ? `${Number(value).toLocaleString()} km` : String(value);
        return <View key={field.key} style={themed_styles.section}><Text style={themed_styles.body}>{field.label}</Text><Text selectable style={themed_styles.accent}>{formatted}</Text></View>;
      })}<Text style={themed_styles.body}>Total Cost</Text><Text style={themed_styles.sectionTitle}>{serviceMoney(record.totalCost)}</Text></View>
      <Text style={themed_styles.sectionTitle}>Bill / Receipt Photos</Text>
      {!bills.length && <Text style={themed_styles.body}>Not added</Text>}
      {bills.map((bill, index) => {
        const uri = availableServiceBillUri(vehicleId, serviceId, bill.id, bill.localUri);
        return <Pressable key={bill.id} accessibilityRole="button" accessibilityLabel={`View bill ${index + 1}`}
          disabled={!uri} onPress={() => setViewing(uri)}><BillImage uri={uri} /></Pressable>;
      })}
      <ServiceAction label={busy ? 'Deleting…' : 'Delete Service'} disabled={busy} onPress={confirmDelete} />
      <BillViewer uri={viewing} close={() => setViewing(null)} />
    </>}
  </VehiclePage>;
}
