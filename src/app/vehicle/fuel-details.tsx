import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, StandardCard, FieldMessage } from '@/components/ui';
import { FuelFrame, FuelText } from '@/components/vehicles/fuel-ui';
import { getFuelEntry, deleteFuelEntry } from '@/database/vehicle-fuel';
import { fuelDetailRows } from '@/features/vehicles/fuel-presentation';
import { useVehicle } from '@/features/vehicles/use-vehicle';
import { useFuelResource } from '@/features/vehicles/use-fuel-resource';
import { OperationSuspendedError } from '@/features/activity/operation-lifecycle';

export default function FuelDetails() {
  const state = useVehicle(), db = useSQLiteContext(), { entryId } = useLocalSearchParams<{ entryId: string }>();
  const id = Number(entryId), working = useRef(false), focused = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  const resource = useFuelResource(useCallback(() => getFuelEntry(db, state.vehicleId, id), [db, state.vehicleId, id]));
  const entry = resource.data;
  function confirmDelete() {
    if (working.current || !entry) return;
    working.current = true; setBusy(true);
    const release = () => { working.current = false; setBusy(false); };
    Alert.alert('Delete entry?', 'This removes only this entry. The vehicle odometer will not decrease.', [
      { text: 'Cancel', style: 'cancel', onPress: release },
      { text: 'Delete', style: 'destructive', onPress: () => {
        if (!focused.current) { release(); return; }
        void deleteFuelEntry(db, state.vehicleId, entry.id).then(() => {
          if (focused.current) router.dismissTo({ pathname: '/vehicle/fuel', params: { id: String(state.vehicleId) } });
        }).catch(cause => { if (focused.current) setError(cause instanceof OperationSuspendedError ? cause.message : 'Could not delete the entry. Please try again.'); })
          .finally(release);
      } },
    ], { cancelable: false });
  }
  return <FuelFrame title={entry?.kind === 'charge' ? 'Charging entry' : 'Fuel entry'} vehicleId={state.vehicleId}
    loading={state.loading || resource.loading} error={state.error ? 'This vehicle is unavailable.' : resource.error ?? (!entry ? 'This entry is no longer available for this vehicle.' : null)}
    reload={() => { state.reload(); resource.reload(); }}>
    {entry && <><StandardCard>{fuelDetailRows(entry).map(([label, value]) => <FuelText key={label}>{label}: {value}</FuelText>)}</StandardCard>
      {error && <FieldMessage error>{error}</FieldMessage>}
      <Button label="Edit entry" disabled={busy} onPress={() => router.push({ pathname: '/vehicle/fuel-edit', params: { id: String(state.vehicleId), entryId: String(entry.id) } })} />
      <Button label="Delete entry" variant="secondary" loading={busy} onPress={confirmDelete} />
    </>}
  </FuelFrame>;
}
