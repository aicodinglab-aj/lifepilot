import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VehiclePage, vehiclePageStyles as shared } from '@/components/vehicles/vehicle-page';
import { VehiclePhotoImage } from '@/components/vehicles/vehicle-photo-image';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { useVehicle } from '@/features/vehicles/use-vehicle';
import { vehicleModules } from '@/features/vehicles/vehicle-modules';

export default function VehicleOverviewScreen() {
  const state = useVehicle();
  const { vehicle, vehicleId } = state;
  const params = { id: String(vehicleId) };
  return <VehiclePage title="My Vehicle" {...state} vehicleId={vehicle ? vehicleId : undefined}>
    {vehicle && <>
      <View style={styles.hero}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open vehicle photos"
          onPress={() => router.push({ pathname: '/vehicle/photos', params })}>
          <VehiclePhotoImage vehicleId={vehicleId} photoId={vehicle.coverPhotoId} uri={vehicle.coverPhotoUri} style={styles.cover} />
          <View pointerEvents="none" style={styles.photoBadge}><Text style={styles.photoBadgeText}>View photos ↗</Text></View>
        </Pressable>
        <View style={styles.identity}>
          <Text style={shared.eyebrow}>YOUR VEHICLE</Text>
          <Text style={shared.title}>{vehicle.make} {vehicle.model}</Text>
          <Text style={styles.registration}>{vehicle.registrationNumber}</Text>
          <View style={styles.metrics}>
            <Metric label="MODEL YEAR" value={String(vehicle.modelYear)} />
            <Metric label="ODOMETER" value={`${vehicle.odometerKm.toLocaleString()} km`} />
            <Metric label="FUEL TYPE" value={vehicle.fuelType} />
          </View>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={shared.sectionTitle}>Quick Status</Text>
        <View style={styles.statusRow}>
          <Status label="Next Service" value="No service scheduled" />
          <Status label="Insurance" value="Not added" />
          <Status label="PUC / Pollution" value="Not added" />
        </View>
      </View>
      <View style={styles.section}>
        <Text style={shared.sectionTitle}>Manage your vehicle</Text>
        <NavigationCard icon="≡" title="Vehicle Details" subtitle="Model, chassis, engine, purchase info"
          href={{ pathname: '/vehicle/details', params }} />
        {Object.entries(vehicleModules).map(([module, item]) => <NavigationCard key={module}
          icon={module === 'service' ? '⌁' : module === 'insurance' ? '◇' : 'ϟ'} {...item}
          href={{ pathname: '/vehicle/module', params: { ...params, module } }} />)}
        <NavigationCard icon="▧" title="Documents & Photos" subtitle="Bills, certificates and vehicle photos"
          href={{ pathname: '/vehicle/photos', params }} />
      </View>
    </>}
  </VehiclePage>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}
function Status({ label, value }: { label: string; value: string }) {
  return <View style={styles.status}><View style={styles.statusMark} /><Text style={styles.statusLabel}>{label}</Text><Text style={styles.statusValue}>{value}</Text></View>;
}
function NavigationCard({ icon, title, subtitle, href }: { icon: string; title: string; subtitle: string; href: Href }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(href)}
    style={({ pressed }) => [styles.navigationCard, pressed && { opacity: 0.7 }]}>
    <View style={styles.iconBox}><Text style={styles.icon}>{icon}</Text></View>
    <View style={styles.navigationText}><Text style={styles.navigationTitle}>{title}</Text><Text style={shared.body}>{subtitle}</Text></View>
    <Text style={styles.chevron}>›</Text>
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
