import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { FlatList, View } from 'react-native';
import { Button, EmptyState, FieldMessage } from '@/components/ui';
import { FuelEntryCard, FuelFrame } from '@/components/vehicles/fuel-ui';
import { spacing } from '@/constants/design-system';
import { getFuelHistory, type FuelCursor } from '@/database/vehicle-fuel';
import type { FuelEntry } from '@/features/vehicles/fuel-entry';
import { fuelTitle } from '@/features/vehicles/fuel-presentation';
import { useVehicle } from '@/features/vehicles/use-vehicle';

export default function FuelHistory() {
  const state = useVehicle(), db = useSQLiteContext();
  const [entries, setEntries] = useState<FuelEntry[]>([]), [cursor, setCursor] = useState<FuelCursor | null>(null);
  const [loading, setLoading] = useState(true), [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null), [pageError, setPageError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0), generation = useRef(0), working = useRef(false);
  useFocusEffect(useCallback(() => {
    const token = ++generation.current;
    working.current = false; setLoading(true); setPaging(false); setError(null); setPageError(null);
    void getFuelHistory(db, state.vehicleId).then(page => {
      if (generation.current === token) { setEntries(page.entries); setCursor(page.nextCursor); }
    }).catch(() => { if (generation.current === token) setError('Could not load history. Please try again.'); })
      .finally(() => { if (generation.current === token) setLoading(false); });
    return () => { generation.current++; };
  // The retry token intentionally reloads while focused.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, state.vehicleId, retry]));
  async function more() {
    if (!cursor || working.current || loading) return;
    working.current = true; setPaging(true); setPageError(null);
    const token = generation.current;
    try {
      const page = await getFuelHistory(db, state.vehicleId, cursor);
      if (token === generation.current) { setEntries(previous => [...previous, ...page.entries]); setCursor(page.nextCursor); }
    } catch { if (token === generation.current) setPageError('Could not load more entries. Try again.'); }
    finally { if (token === generation.current) { working.current = false; setPaging(false); } }
  }
  const title = fuelTitle(state.vehicle?.fuelType ?? 'Other');
  return <FuelFrame title={`${title} history`} vehicleId={state.vehicleId} list loading={state.loading || loading}
    error={state.error ? 'This vehicle is unavailable.' : error} reload={() => { state.reload(); setRetry(n => n + 1); }}>
    <FlatList data={entries} keyExtractor={entry => String(entry.id)} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      renderItem={({ item }) => <FuelEntryCard entry={item} />}
      ListEmptyComponent={<EmptyState title="No entries yet" description="Your vehicle purchases will appear here."
        action={{ label: `Add ${title}`, onPress: () => router.push({ pathname: '/vehicle/fuel-edit', params: { id: String(state.vehicleId) } }) }} />}
      ListFooterComponent={cursor ? <View style={{ gap: spacing.md }}>{pageError && <FieldMessage error>{pageError}</FieldMessage>}
        <Button label={pageError ? 'Retry loading more' : 'Load more'} loading={paging} onPress={() => { void more(); }} /></View> : null} />
  </FuelFrame>;
}
