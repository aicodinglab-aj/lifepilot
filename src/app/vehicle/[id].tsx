import { useThemedStyles } from '@/features/appearance/appearance-provider';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VehiclePage, vehiclePageStyles as shared } from '@/components/vehicles/vehicle-page';
import { VehiclePhotoImage } from '@/components/vehicles/vehicle-photo-image';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { useVehicle } from '@/features/vehicles/use-vehicle';
import { vehicleModules } from '@/features/vehicles/vehicle-modules';
import { useOverviewSummary } from '@/features/vehicles/use-overview-summary';
import { coverageQuickStatus, serviceQuickStatus } from '@/features/vehicles/overview-summary';
import { VehicleMileageReminder } from '@/components/vehicles/mileage-reminder';

export default function VehicleOverviewScreen() {
  const themed_styles = useThemedStyles(styles);
  const themed_shared = useThemedStyles(shared);
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
  return <VehiclePage title="My Vehicle" {...state} loading={state.loading && !vehicle} vehicleId={vehicle ? vehicleId : undefined}>
    {vehicle && <>
      <View style={themed_styles.hero}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open vehicle photos"
          onPress={() => router.push({ pathname: '/vehicle/photos', params })}>
          <VehiclePhotoImage vehicleId={vehicleId} photoId={vehicle.coverPhotoId} uri={vehicle.coverPhotoUri} style={themed_styles.cover} />
          <View pointerEvents="none" style={themed_styles.photoBadge}><Text style={themed_styles.photoBadgeText}>View photos ↗</Text></View>
        </Pressable>
        <View style={themed_styles.identity}>
          <Text style={themed_shared.eyebrow}>YOUR VEHICLE</Text>
          <Text style={themed_shared.title}>{vehicle.make} {vehicle.model}</Text>
          <Text style={themed_styles.registration}>{vehicle.registrationNumber}</Text>
          <View style={themed_styles.metrics}>
            <Metric label="MODEL YEAR" value={String(vehicle.modelYear)} />
            <Metric label="ODOMETER" value={`${vehicle.odometerKm.toLocaleString()} km`} />
            <Metric label="FUEL TYPE" value={vehicle.fuelType} />
          </View>
        </View>
      </View>
      <View style={themed_styles.section}>
        <Text style={themed_shared.sectionTitle}>Quick Status</Text>
        <View style={themed_styles.statusRow}>
          <Status label="Next Service" {...service} href={{ pathname: '/vehicle/services', params }} />
          <Status label="Insurance" {...status('insurance')} href={coverageHref('insurance')} />
          <Status label="PUC / Pollution" {...status('puc')} href={coverageHref('puc')} />
        </View>
        <VehicleMileageReminder vehicleId={vehicleId} odometer={vehicle.odometerKm} />
      </View>
      <View style={themed_styles.section}>
        <Text style={themed_shared.sectionTitle}>Manage your vehicle</Text>
        <NavigationCard icon="≡" title="Vehicle Details" subtitle="Model, chassis, engine, purchase info"
          href={{ pathname: '/vehicle/details', params }} />
        {Object.entries(vehicleModules).map(([module, item]) => <NavigationCard key={module}
          icon={module === 'service' ? '⌁' : module === 'insurance' ? '◇' : 'ϟ'} {...item}
          href={module === 'service' ? { pathname: '/vehicle/services', params } : module === 'insurance' ? { pathname: '/vehicle/insurance-puc', params } : { pathname: '/vehicle/module', params: { ...params, module } }} />)}
        <NavigationCard icon="▧" title="Documents & Photos" subtitle="Bills, certificates and vehicle photos"
          href={{ pathname: '/vehicle/photos', params }} />
      </View>
    </>}
  </VehiclePage>;
}

function Metric({ label, value }: { label: string; value: string }) {
  const themed_styles = useThemedStyles(styles);
  return <View style={themed_styles.metric}><Text style={themed_styles.metricLabel}>{label}</Text><Text style={themed_styles.metricValue}>{value}</Text></View>;
}
function Status({ label, value, detail, href }: { label: string; value: string; detail?: string; href: Href }) {
  const themed_styles = useThemedStyles(styles);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}
    onPress={() => router.push(href)} style={({ pressed }) => [themed_styles.status, pressed && { opacity: 0.7 }]}>
    <View style={themed_styles.statusMark} /><Text style={themed_styles.statusLabel}>{label}</Text>
    <Text style={themed_styles.statusValue}>{value}</Text>
    {detail && <Text style={themed_styles.statusValue}>{detail}</Text>}
  </Pressable>;
}
function NavigationCard({ icon, title, subtitle, href }: { icon: string; title: string; subtitle: string; href: Href }) {
  const themed_styles = useThemedStyles(styles);
  const themed_shared = useThemedStyles(shared);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(href)}
    style={({ pressed }) => [themed_styles.navigationCard, pressed && { opacity: 0.7 }]}>
    <View style={themed_styles.iconBox}><Text style={themed_styles.icon}>{icon}</Text></View>
    <View style={themed_styles.navigationText}><Text style={themed_styles.navigationTitle}>{title}</Text><Text style={themed_shared.body}>{subtitle}</Text></View>
    <Text style={themed_styles.chevron}>›</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  hero: { borderRadius: 22, overflow: 'hidden', backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
  cover: { height: 220, borderRadius: 0 },
  photoBadge: { position: 'absolute', bottom: 12, right: 12, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#0B1110DD' },
  photoBadgeText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  identity: { padding: 20, gap: 8 },
  registration: { color: colors.green, fontSize: 15, fontWeight: '700', letterSpacing: 0.7 },
  metrics: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  metric: { flex: 1, gap: 6 },
  metricLabel: { color: colors.muted, fontSize: 9, letterSpacing: 0.8, fontWeight: '700' },
  metricValue: { color: colors.white, fontSize: 14, fontWeight: '700' },
  section: { gap: 14 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  status: { flex: 1, minWidth: 90, padding: 13, gap: 9, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  statusMark: { width: 18, height: 3, borderRadius: 2, backgroundColor: colors.muted },
  statusLabel: { color: colors.white, fontSize: 12, fontWeight: '600' },
  statusValue: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  navigationCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  iconBox: { width: 42, height: 44, backgroundColor: '#193D2C', borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 25, color: colors.green },
  navigationText: { flex: 1, gap: 4 },
  navigationTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },
  chevron: { color: colors.green, fontSize: 26 },
});
