import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { Button, Chip, FieldMessage, FormInput, ToggleRow } from '@/components/ui';
import { FuelFrame, FuelText } from '@/components/vehicles/fuel-ui';
import { spacing } from '@/constants/design-system';
import { createFuelEntry, updateFuelEntry, getFuelEntry } from '@/database/vehicle-fuel';
import { fuelFormInput, fuelTitle, initialFuelForm, previewPaidPrice, validateFuelForm, type FuelForm } from '@/features/vehicles/fuel-presentation';
import type { FuelEntry } from '@/features/vehicles/fuel-entry';
import type { Vehicle } from '@/features/vehicles/vehicle';
import { useVehicle } from '@/features/vehicles/use-vehicle';
import { useFuelResource } from '@/features/vehicles/use-fuel-resource';
import { OperationSuspendedError } from '@/features/activity/operation-lifecycle';

export default function FuelEditorScreen() {
  const state = useVehicle(), db = useSQLiteContext(), { entryId } = useLocalSearchParams<{ entryId?: string }>();
  const id = entryId === undefined ? null : Number(entryId);
  const resource = useFuelResource(useCallback(() => id === null ? Promise.resolve(null) : getFuelEntry(db, state.vehicleId, id), [db, state.vehicleId, id]));
  const title = `${id === null ? 'Add' : 'Edit'} ${fuelTitle(state.vehicle?.fuelType ?? 'Other')}`;
  return <FuelFrame title={title} vehicleId={state.vehicleId} loading={state.loading || resource.loading}
    error={state.error ? 'This vehicle is unavailable.' : resource.error ?? (id !== null && !resource.data ? 'This entry is no longer available for this vehicle.' : null)}
    reload={() => { state.reload(); resource.reload(); }}>
    {state.vehicle && (id === null || resource.data) && <FuelEditor key={`${state.vehicleId}-${id}`} db={db} vehicle={state.vehicle} entry={resource.data ?? undefined} />}
  </FuelFrame>;
}

export function FuelEditor({ db, vehicle, entry }: { db: SQLiteDatabase; vehicle: Vehicle; entry?: FuelEntry }) {
  const [form, setForm] = useState(() => initialFuelForm(vehicle, entry));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const working = useRef(false), focused = useRef(false);
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  const charge = form.kind === 'charge', mixed = ['Hybrid', 'Other'].includes(vehicle.fuelType);
  const unit = charge ? 'kWh' : form.fuelType === 'CNG' ? 'kg' : 'L';
  const paidPrice = previewPaidPrice(form);
  function change<K extends keyof FuelForm>(key: K, value: FuelForm[K]) { setForm(previous => ({ ...previous, [key]: value })); }
  async function save() {
    if (working.current) return;
    const message = validateFuelForm(form, vehicle.fuelType);
    setError(message); if (message) return;
    working.current = true; setBusy(true);
    try {
      const input = fuelFormInput(form);
      const saved = entry ? await updateFuelEntry(db, vehicle.id, entry.id, input) : await createFuelEntry(db, vehicle.id, input);
      if (focused.current) router.dismissTo({ pathname: '/vehicle/fuel-details', params: { id: String(vehicle.id), entryId: String(saved) } });
    } catch (cause) { if (focused.current) setError(cause instanceof OperationSuspendedError ? cause.message : 'Could not save the entry. Please check the vehicle and try again.'); }
    finally { working.current = false; if (focused.current) setBusy(false); }
  }
  const field = (key: 'date' | 'odometerKm' | 'totalCost' | 'quantity' | 'price' | 'before' | 'after' | 'location' | 'notes', label: string, optional = false, helper?: string) =>
    <FormInput label={label} value={form[key]} onChangeText={value => change(key, value)} optional={optional} editable={!busy}
      keyboardType={['odometerKm', 'totalCost', 'quantity', 'price'].includes(key) ? 'decimal-pad' : ['before', 'after'].includes(key) ? 'number-pad' : 'default'}
      placeholder={key === 'date' ? 'YYYY-MM-DD' : undefined} multiline={key === 'notes'} helper={helper} />;
  return <>
    <FuelText title>{vehicle.registrationNumber}</FuelText>
    {mixed && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      <Chip label="Refuel" selected={!charge} disabled={busy} onPress={() => change('kind', 'refuel')} />
      <Chip label="Charging" selected={charge} disabled={busy} onPress={() => change('kind', 'charge')} />
    </View>}
    {!charge && (mixed ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {(['Petrol', 'Diesel', 'CNG'] as const).map(type => <Chip key={type} label={type} selected={form.fuelType === type} disabled={busy} onPress={() => change('fuelType', type)} />)}
    </View> : <FuelText>{form.fuelType}</FuelText>)}
    {field('date', 'Date')}
    {field('odometerKm', 'Odometer (km)', false, 'Higher readings update your vehicle. Historical readings never reduce its odometer.')}
    {field('quantity', charge ? 'Energy added (kWh)' : `Quantity (${unit})`, false, charge ? 'Enter measured energy added, not an estimate from battery percentages.' : undefined)}
    {field('totalCost', 'Total paid (\u20b9)', false, 'The amount you paid is authoritative. Enter 0 for a free purchase.')}
    {field('price', `Quoted price (\u20b9/${unit})`, true, 'Optional receipt rate. Changing this does not change total paid.')}
    {paidPrice && <FuelText>Actual paid price: {paidPrice}/{unit} - calculated from total paid / quantity.</FuelText>}
    {charge ? <>
      {field('before', 'Battery before (%)', true)}
      {field('after', 'Battery after (%)', true, 'Two recorded 100% charges with all energy logged help calculate efficiency.')}
      <FuelText>Charging location (optional)</FuelText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip label="Not added" selected={form.chargingLocation === null} disabled={busy} onPress={() => change('chargingLocation', null)} />
        {(['Home', 'Work', 'Public', 'Other'] as const).map(location => <Chip key={location} label={location} selected={form.chargingLocation === location} disabled={busy} onPress={() => change('chargingLocation', location)} />)}
      </View>
    </> : <ToggleRow label="Full tank" description="Mark only when filled completely. Efficiency needs two full fills and all purchases between them; a single fill is not enough."
      value={form.fullTank} disabled={busy} onValueChange={value => change('fullTank', value)} />}
    {field('location', charge ? 'Location' : 'Station / location', true)}
    {field('notes', 'Notes', true)}
    {error && <FieldMessage error>{error}</FieldMessage>}
    <Button label={charge ? 'Save charging entry' : 'Save fuel entry'} loading={busy} onPress={() => { void save(); }} />
  </>;
}
