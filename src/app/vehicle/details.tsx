import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { VehiclePage, vehiclePageStyles as shared } from '@/components/vehicles/vehicle-page';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { useVehicle } from '@/features/vehicles/use-vehicle';
import { vehicleDetailSections, vehicleDetailValue } from '@/features/vehicles/vehicle-details';

export default function VehicleDetailsScreen() {
  const state = useVehicle();
  const { vehicle, vehicleId } = state;
  return <VehiclePage title="Vehicle Details" {...state} action={vehicle ? { label: 'Edit',
    onPress: () => router.push({ pathname: '/vehicle/edit', params: { id: String(vehicleId) } }) } : undefined}>
    {vehicle && <>
      <View style={styles.identity}><Text style={shared.eyebrow}>{vehicle.registrationNumber}</Text>
        <Text style={shared.title}>{vehicle.make} {vehicle.model}</Text></View>
      {vehicleDetailSections.map((section) => <View key={section.title} style={styles.section}>
        <Text style={shared.sectionTitle}>{section.title}</Text>
        <View style={styles.card}>{section.fields.map(({ key, label }, index) => <View key={key}
          style={[styles.field, index > 0 && styles.divider]}>
          <Text style={styles.label}>{label}</Text>
          <Text selectable style={[styles.value, vehicleDetailValue(vehicle, key) === 'Not added' && styles.missing]}>{vehicleDetailValue(vehicle, key)}</Text>
        </View>)}</View>
      </View>)}
    </>}
  </VehiclePage>;
}
const styles = StyleSheet.create({
  identity: { gap: 8 }, section: { gap: 14 },
  card: { borderRadius: 18, backgroundColor: colors.card, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.border },
  field: { paddingVertical: 15, gap: 6 }, divider: { borderTopWidth: 1, borderTopColor: colors.border },
  label: { color: colors.muted, fontSize: 12 }, value: { color: colors.white, fontSize: 16, lineHeight: 23 }, missing: { color: colors.muted },
});
