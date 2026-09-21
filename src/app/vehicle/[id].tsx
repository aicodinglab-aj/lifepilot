import { router, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { VehicleMileageReminder } from '@/components/vehicles/mileage-reminder';
import { VehiclePage } from '@/components/vehicles/vehicle-page';
import { VehiclePhotoImage } from '@/components/vehicles/vehicle-photo-image';
import { InteractiveCard, StandardCard } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { StatusBadge, type StatusTone } from '@/components/ui/status';
import { iconSizes, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { coverageQuickStatus, serviceQuickStatus } from '@/features/vehicles/overview-summary';
import { useOverviewSummary } from '@/features/vehicles/use-overview-summary';
import { useVehicle } from '@/features/vehicles/use-vehicle';
import { vehicleModules } from '@/features/vehicles/vehicle-modules';

type SymbolName = SymbolViewProps['name'];

export default function VehicleOverviewScreen() {
  const { colors } = useAppearance();
  const state = useVehicle();
  const { vehicleId } = state;
  const vehicle = state.vehicle?.id === vehicleId ? state.vehicle : null;
  const summary = useOverviewSummary(vehicleId);
  const pending = { value: summary.error ?? 'Loading…', detail: undefined };
  const status = (kind: 'insurance' | 'puc') => summary.data
    ? coverageQuickStatus(summary.data[kind], summary.today) : pending;
  const service = summary.data && vehicle ? serviceQuickStatus(summary.data.service, vehicle.odometerKm, summary.today) : pending;
  const params = { id: String(vehicleId) };
  const coverageHref = (kind: 'insurance' | 'puc'): Href => {
    const record = summary.data?.[kind];
    return record ? { pathname: '/vehicle/coverage-details', params: { ...params, kind, recordId: record.id } }
      : { pathname: '/vehicle/coverage-history', params: { ...params, kind } };
  };
  const hasCover = !!vehicle?.coverPhotoId && !!vehicle.coverPhotoUri;

  return <VehiclePage title="My Vehicle" {...state} loading={state.loading && !vehicle} vehicleId={vehicle ? vehicleId : undefined}>
    {vehicle && <>
      <StandardCard style={{ padding: 0, overflow: 'hidden' }}>
        {hasCover && <Pressable accessibilityRole="button" accessibilityLabel="Open vehicle photos"
          onPress={() => router.push({ pathname: '/vehicle/photos', params })}>
          <VehiclePhotoImage vehicleId={vehicleId} photoId={vehicle.coverPhotoId} uri={vehicle.coverPhotoUri}
            style={{ width: '100%', height: undefined, aspectRatio: 16 / 9, borderRadius: 0 }} />
          <View pointerEvents="none" style={{ position: 'absolute', right: spacing.md, bottom: spacing.md,
            borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: `${colors.background}DD` }}>
            <Text style={[typography.caption, { color: colors.text, fontWeight: '700' }]}>View photos</Text>
          </View>
        </Pressable>}
        <View style={{ padding: spacing.base, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            {!hasCover && <View style={{ width: 52, height: 52, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.surfaceSecondary }}>
              <SymbolView name={{ ios: 'car.fill', android: 'directions_car', web: 'directions_car' }}
                size={iconSizes.card} tintColor={colors.primary} />
            </View>}
            <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
              <Text style={[typography.label, { color: colors.primary, letterSpacing: 1.1 }]}>YOUR VEHICLE</Text>
              <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.text }]}>{vehicle.make} {vehicle.model}</Text>
              <Text style={[typography.label, { color: colors.primary }]}>{vehicle.registrationNumber}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <StatusBadge label={`${vehicle.modelYear}`} />
            <StatusBadge label={vehicle.vehicleType} />
            <StatusBadge label={vehicle.fuelType} />
            <StatusBadge label={`${vehicle.odometerKm.toLocaleString()} km`} />
          </View>
        </View>
      </StandardCard>

      <Section title="Quick Status" subtitle="Current service and compliance information.">
        <View style={{ gap: spacing.md }}>
          <QuickStatus label="Next Service" {...service} tone={serviceStatusTone(service.value, service.detail)}
            href={{ pathname: '/vehicle/services', params }} icon={{ ios: 'wrench.and.screwdriver', android: 'build', web: 'build' }} />
          <QuickStatus label="Insurance" {...status('insurance')} tone={coverageStatusTone(status('insurance').value)}
            href={coverageHref('insurance')} icon={{ ios: 'shield', android: 'shield', web: 'shield' }} />
          <QuickStatus label="PUC / Pollution" {...status('puc')} tone={coverageStatusTone(status('puc').value)}
            href={coverageHref('puc')} icon={{ ios: 'checkmark.seal', android: 'verified', web: 'verified' }} />
          <VehicleMileageReminder vehicleId={vehicleId} odometer={vehicle.odometerKm} />
        </View>
      </Section>

      <Section title="Manage Vehicle" subtitle="Details, records, expenses and documents.">
        <View style={{ gap: spacing.md }}>
          <NavigationCard title="Vehicle Details" subtitle="Model, chassis, engine and purchase information"
            icon={{ ios: 'list.bullet.rectangle', android: 'description', web: 'description' }}
            href={{ pathname: '/vehicle/details', params }} />
          {Object.entries(vehicleModules).map(([module, item]) => <NavigationCard key={module} {...item}
            icon={module === 'service' ? { ios: 'wrench.and.screwdriver', android: 'build', web: 'build' }
              : module === 'insurance' ? { ios: 'shield', android: 'shield', web: 'shield' }
                : { ios: 'fuelpump', android: 'local_gas_station', web: 'local_gas_station' }}
            href={module === 'service' ? { pathname: '/vehicle/services', params }
              : module === 'insurance' ? { pathname: '/vehicle/insurance-puc', params }
                : { pathname: '/vehicle/module', params: { ...params, module } }} />)}
          <NavigationCard title="Documents & Photos" subtitle="Bills, certificates and vehicle photos"
            icon={{ ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' }}
            href={{ pathname: '/vehicle/photos', params }} />
        </View>
      </Section>
    </>}
  </VehiclePage>;
}

function coverageStatusTone(value: string): StatusTone {
  if (value === 'Valid') return 'success';
  if (value === 'Expiring soon') return 'warning';
  if (value === 'Expired') return 'danger';
  return 'neutral';
}

function serviceStatusTone(value: string, detail?: string): StatusTone {
  if (detail?.includes('Overdue')) return 'danger';
  if (detail?.includes('Due today') || detail?.includes('Due tomorrow')) return 'warning';
  return value === 'Not scheduled' || value === 'Loading…' || value === 'Could not load' ? 'neutral' : 'success';
}

function QuickStatus({ label, value, detail, tone, href, icon }: {
  label: string; value: string; detail?: string; tone: StatusTone; href: Href; icon: SymbolName;
}) {
  const { colors } = useAppearance();
  return <InteractiveCard accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}
    onPress={() => router.push(href)} leading={<SymbolView name={icon} size={iconSizes.card} tintColor={colors.primary} />}
    trailing={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
      size={iconSizes.action} tintColor={colors.primary} />}>
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.cardTitle, { color: colors.text }]}>{label}</Text>
      <StatusBadge label={value} tone={tone} />
      {detail && <Text style={[typography.caption, { color: colors.muted }]}>{detail}</Text>}
    </View>
  </InteractiveCard>;
}

function NavigationCard({ title, subtitle, href, icon }: { title: string; subtitle: string; href: Href; icon: SymbolName }) {
  const { colors } = useAppearance();
  return <InteractiveCard accessibilityLabel={title} onPress={() => router.push(href)}
    leading={<SymbolView name={icon} size={iconSizes.card} tintColor={colors.primary} />}
    trailing={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
      size={iconSizes.action} tintColor={colors.primary} />}>
    <Text style={[typography.cardTitle, { color: colors.text }]}>{title}</Text>
    <Text style={[typography.secondaryBody, { color: colors.muted }]}>{subtitle}</Text>
  </InteractiveCard>;
}
