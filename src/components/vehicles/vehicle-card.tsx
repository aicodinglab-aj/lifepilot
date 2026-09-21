import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text, View } from 'react-native';
import { InteractiveCard } from '@/components/ui/card';
import { iconSizes, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import type { Vehicle } from '@/features/vehicles/vehicle';
import { VehiclePhotoImage } from './vehicle-photo-image';

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { colors } = useAppearance();
  const hasCover = !!vehicle.coverPhotoId && !!vehicle.coverPhotoUri;
  return <InteractiveCard accessibilityLabel={`Open ${vehicle.make} ${vehicle.model}`}
    onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: String(vehicle.id) } })}
    leading={hasCover
      ? <VehiclePhotoImage vehicleId={vehicle.id} photoId={vehicle.coverPhotoId} uri={vehicle.coverPhotoUri}
          style={{ width: 104, height: 58.5, borderRadius: radii.md }} />
      : <View style={{ width: 48, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.surfaceSecondary }}>
          <SymbolView name={{ ios: 'car.fill', android: 'directions_car', web: 'directions_car' }}
            size={iconSizes.card} tintColor={colors.primary} />
        </View>}
    trailing={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
      size={iconSizes.action} tintColor={colors.primary} />}>
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.cardTitle, { color: colors.text }]}>{vehicle.make} {vehicle.model}</Text>
      <Text style={[typography.label, { color: colors.primary }]}>{vehicle.registrationNumber}</Text>
      <Text style={[typography.secondaryBody, { color: colors.muted }]}>{vehicle.vehicleType} · {vehicle.fuelType}</Text>
      <Text style={[typography.secondaryBody, { color: colors.text }]}>{vehicle.odometerKm.toLocaleString()} km</Text>
    </View>
  </InteractiveCard>;
}
