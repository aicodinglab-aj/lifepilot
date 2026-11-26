import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { iconSizes, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import type { DateFormat } from '@/features/dates/date-format';
import { coverageDate, coverageStatus, localToday } from '@/features/vehicles/coverage-status';
import type { CoverageRecord } from '@/features/vehicles/coverage-record';
import type { Vehicle } from '@/features/vehicles/vehicle';
import type { VehiclePhoto } from '@/features/vehicles/vehicle-photo';
import { VehiclePhotoImage } from './vehicle-photo-image';

type Props = { vehicle: Vehicle; photo: VehiclePhoto | null; insurance: CoverageRecord | null; puc: CoverageRecord | null };

function vehicleIcon(type: string): SymbolViewProps['name'] {
  switch (type.toLowerCase()) {
    case 'motorcycle': return { ios: 'bicycle', android: 'motorcycle', web: 'motorcycle' };
    case 'scooter': return { ios: 'bicycle', android: 'scooter', web: 'scooter' };
    case 'car': return { ios: 'car.fill', android: 'directions_car', web: 'directions_car' };
    default: return { ios: 'car.side.fill', android: 'commute', web: 'commute' };
  }
}

function CoverageInfo({ kind, record, dateFormat, today }: {
  kind: 'insurance' | 'puc'; record: CoverageRecord | null; dateFormat: DateFormat; today: string;
}) {
  const { colors } = useAppearance();
  const label = kind === 'insurance' ? 'Insurance' : 'PUC';
  const status = record ? coverageStatus(record.expiryDate, record.startDate, today) : 'Not added';
  const statusColor = status === 'Valid' ? colors.success : status === 'Expiring soon' ? colors.warning
    : status === 'Expired' ? colors.danger : colors.muted;
  const icon: SymbolViewProps['name'] = kind === 'insurance' ? { ios: 'shield.fill', android: 'verified_user', web: 'verified_user' }
    : { ios: 'doc.text.fill', android: 'description', web: 'description' };
  return <View accessibilityLabel={`${label}: ${coverageDate(record?.expiryDate, dateFormat)}, ${status}`}
    style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <SymbolView name={icon} size={iconSizes.status} tintColor={colors.primary} />
      <Text style={[typography.label, { color: colors.muted }]}>{label}</Text>
    </View>
    <Text style={[typography.secondaryBody, { color: colors.text }]}>{coverageDate(record?.expiryDate, dateFormat)}</Text>
    <Text style={[typography.caption, { color: statusColor }]}>{status}</Text>
  </View>;
}

export function VehicleCard({ vehicle, photo, insurance, puc }: Props) {
  const { colors, dateFormat } = useAppearance();
  const today = localToday();
  const name = `${vehicle.make} ${vehicle.model}`;
  const icon = vehicleIcon(vehicle.vehicleType);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}, registration ${vehicle.registrationNumber}`}
    onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: String(vehicle.id) } })}
    style={({ pressed }) => ({ borderRadius: radii.lg, padding: spacing.base, gap: spacing.md,
      backgroundColor: colors.surface, borderColor: colors.divider, borderWidth: 1, opacity: pressed ? 0.76 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      {photo
        ? <VehiclePhotoImage vehicleId={vehicle.id} photoId={photo.id} uri={photo.localUri}
            fallback={<SymbolView name={icon} size={iconSizes.card} tintColor={colors.primary} />}
            style={{ width: 64, height: 64, borderRadius: radii.md }} />
        : <View style={{ width: 64, height: 64, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.surfaceSecondary }}><SymbolView name={icon} size={iconSizes.card} tintColor={colors.primary} /></View>}
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <Text numberOfLines={2} style={[typography.cardTitle, { color: colors.text }]}>{name}</Text>
        <Text style={[typography.label, { color: colors.primary }]}>{vehicle.registrationNumber}</Text>
        <Text style={[typography.secondaryBody, { color: colors.muted }]}>{vehicle.vehicleType} · {vehicle.fuelType}</Text>
      </View>
      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={iconSizes.action} tintColor={colors.muted} />
    </View>
    <View style={{ height: 1, backgroundColor: colors.divider }} />
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <CoverageInfo kind="insurance" record={insurance} dateFormat={dateFormat} today={today} />
      <View style={{ width: 1, backgroundColor: colors.divider }} />
      <CoverageInfo kind="puc" record={puc} dateFormat={dateFormat} today={today} />
    </View>
  </Pressable>;
}
