import { useCallback } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, EmptyState, StandardCard, Section } from '@/components/ui';
import { FuelEntryCard, FuelFrame, FuelText } from '@/components/vehicles/fuel-ui';
import { getFuelSummary } from '@/database/vehicle-fuel';
import { useVehicle } from '@/features/vehicles/use-vehicle';
import { useFuelResource } from '@/features/vehicles/use-fuel-resource';
import { fuelTitle, rupeeRatio } from '@/features/vehicles/fuel-presentation';
import { formatFuelRatio } from '@/features/vehicles/fuel-calculations';
import { formatMoney } from '@/features/personal/money';

export default function FuelDashboard() {
  const state = useVehicle(), db = useSQLiteContext();
  const resource = useFuelResource(useCallback(() => getFuelSummary(db, state.vehicleId), [db, state.vehicleId]));
  const summary = resource.data, vehicle = state.vehicle, params = { id: String(state.vehicleId) };
  const title = fuelTitle(vehicle?.fuelType ?? 'Other');
  const add = () => router.push({ pathname: '/vehicle/fuel-edit', params });
  const efficiency = summary?.latestEfficiency;
  return <FuelFrame title={title} vehicleId={state.vehicleId} loading={state.loading || resource.loading}
    error={state.error ? 'This vehicle is unavailable.' : resource.error} reload={() => { state.reload(); resource.reload(); }}>
    {vehicle && summary && <>
      <FuelText title>{vehicle.registrationNumber}</FuelText>
      <Button label={`Add ${title}`} onPress={add} />
      <StandardCard>
        <FuelText>This month - {summary.month}</FuelText><FuelText title>{formatMoney(summary.monthSpendPaise)}</FuelText>
        <FuelText>Total spent - {formatMoney(summary.totalSpendPaise)}</FuelText>
        <FuelText>{summary.entryCount} {summary.entryCount === 1 ? 'entry' : 'entries'}</FuelText>
      </StandardCard>
      <StandardCard>
        <FuelText title>Latest calculated efficiency</FuelText>
        <FuelText>{efficiency ? `${formatFuelRatio(efficiency.kmPerUnit)} km/${efficiency.unit}`
          : ['Hybrid', 'Other'].includes(vehicle.fuelType) ? 'Efficiency unavailable for this vehicle type' : 'Not enough data yet'}</FuelText>
        <FuelText>Cost/km - {rupeeRatio(summary.costPaisePerKm)}</FuelText>
        {efficiency ? <FuelText>{efficiency.startDate} - {efficiency.endDate}. Based on all logged purchases between full {vehicle.fuelType === 'Electric' ? 'charges' : 'fills'}.</FuelText>
          : <FuelText>{['Hybrid', 'Other'].includes(vehicle.fuelType) ? 'Distance cannot be reliably attributed to one energy source. Purchases and costs are still tracked.' : vehicle.fuelType === 'Electric' ? 'Needs two recorded 100% charges, measured energy added and increasing odometers.' : 'Needs two full fills with all purchases logged and increasing odometers.'}</FuelText>}
        {vehicle.fuelType === 'Electric' && <FuelText>Uses energy added, including any charging losses.</FuelText>}
      </StandardCard>
      {summary.totals.length > 0 && <StandardCard><FuelText title>Average paid price</FuelText>
        {summary.totals.map(total => <FuelText key={`${total.kind}-${total.fuelType}`}>{total.fuelType ?? 'Charging'} - {rupeeRatio(total.averagePricePaisePerUnit)}/{total.unit}</FuelText>)}
      </StandardCard>}
      {summary.entryCount === 0 ? <EmptyState title={`No ${title.toLowerCase()} entries yet`} description="Track purchases, costs and odometer readings for this vehicle." action={{ label: `Add ${title}`, onPress: add }} />
        : <Section title="Recent entries">{summary.recentEntries.map(entry => <FuelEntryCard key={entry.id} entry={entry} />)}
          <Button label="View history" variant="secondary" onPress={() => router.push({ pathname: '/vehicle/fuel-history', params })} /></Section>}
    </>}
  </FuelFrame>;
}
