import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getVehicles } from '@/database/vehicles';
import type { Vehicle } from './vehicle';
import { parseVehicleId } from './vehicle-details';

export function useVehicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicleId = parseVehicleId(id);
  const db = useSQLiteContext();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        if (!Number.isSafeInteger(vehicleId)) throw new Error('Invalid vehicle link.');
        const found = (await getVehicles(db, vehicleId))[0] ?? null;
        if (active) { setVehicle(found); setError(found ? null : 'This vehicle no longer exists.'); }
      } catch (cause) {
        if (active) { setVehicle(null); setError(cause instanceof Error ? cause.message : 'Could not load this vehicle.'); }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  // The retry token intentionally reruns the focus effect while already focused.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, vehicleId, retry]));
  return { vehicle, vehicleId, loading, error, reload: () => setRetry((value) => value + 1) };
}
