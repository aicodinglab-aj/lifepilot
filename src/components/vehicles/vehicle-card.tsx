import { StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { VehiclePhotoImage } from './vehicle-photo-image';

import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import type { Vehicle } from '@/features/vehicles/vehicle';

type VehicleCardProps = {
  vehicle: Vehicle;
};

export function VehicleCard({ vehicle }: VehicleCardProps) {
  return (
    <Pressable style={styles.card} accessibilityRole="button" accessibilityLabel={`Open ${vehicle.make} ${vehicle.model}`} onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: String(vehicle.id) } })}>
      <VehiclePhotoImage vehicleId={vehicle.id} photoId={vehicle.coverPhotoId} uri={vehicle.coverPhotoUri} style={{ marginBottom: 16 }} />
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>🚗</Text>
        </View>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>
            {vehicle.make} {vehicle.model}
          </Text>
          <Text style={styles.registration}>{vehicle.registrationNumber}</Text>
        </View>
      </View>

      <View style={styles.details}>
        <Detail label="Type" value={vehicle.vehicleType} />
        <Detail label="Fuel" value={vehicle.fuelType} />
        <Detail label="Odometer" value={`${vehicle.odometerKm.toLocaleString()} km`} />
      </View>
    </Pressable>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#193D2C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  icon: { fontSize: 24 },
  titleGroup: { flex: 1 },
  title: { color: colors.white, fontSize: 18, fontWeight: '800' },
  registration: { color: colors.green, fontSize: 13, fontWeight: '700', marginTop: 5 },
  details: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 16,
    paddingTop: 15,
  },
  detail: { flex: 1 },
  detailLabel: { color: colors.muted, fontSize: 11, marginBottom: 5 },
  detailValue: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
