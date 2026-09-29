import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, InteractiveCard, ScreenHeader } from '@/components/ui';
import { spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { fuelQuantity, fuelUnit, type FuelEntry } from '@/features/vehicles/fuel-entry';
import { milliText } from '@/features/vehicles/fuel-presentation';
import { formatMoney } from '@/features/personal/money';

export function FuelText({ children, title = false }: { children: ReactNode; title?: boolean }) {
  const { colors } = useAppearance();
  return <Text style={[title ? typography.cardTitle : typography.body, { color: title ? colors.text : colors.muted }]}>{children}</Text>;
}
export function FuelFrame({ title, vehicleId, loading, error, reload, children, list = false }: {
  title: string; vehicleId: number; loading?: boolean; error?: string | null; reload?: () => void; children?: ReactNode; list?: boolean;
}) {
  const { colors } = useAppearance();
  const content = loading ? <ActivityIndicator accessibilityLabel="Loading records" color={colors.primary} />
    : error ? <View style={{ padding: spacing.lg, gap: spacing.base }}><Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>{error}</Text>
      {reload && <Button label="Try again" onPress={reload} />}</View> : children;
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title={title} fallbackHref={Number.isSafeInteger(vehicleId) ? { pathname: '/vehicle/[id]', params: { id: String(vehicleId) } } : '/vehicle-manager'} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {list ? content : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg }}>{content}</ScrollView>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function FuelEntryCard({ entry }: { entry: FuelEntry }) {
  return <InteractiveCard accessibilityLabel={`View ${entry.kind === 'charge' ? 'charging' : entry.fuelType} entry, ${entry.date}, ${formatMoney(entry.costPaise)}`}
    onPress={() => router.push({ pathname: '/vehicle/fuel-details', params: { id: String(entry.vehicleId), entryId: String(entry.id) } })}>
    <View style={{ gap: spacing.sm }}>
      <FuelText title>{entry.date} - {formatMoney(entry.costPaise)}</FuelText>
      <FuelText>{milliText(fuelQuantity(entry))} {fuelUnit(entry)} - {milliText(entry.odometerMetres)} km</FuelText>
      <FuelText>{entry.kind === 'refuel' ? `${entry.fuelType} - ${entry.fullTank ? 'Full tank' : 'Partial fill'}` : 'Charging entry'}</FuelText>
      {entry.location && <FuelText>{entry.location}</FuelText>}
    </View>
  </InteractiveCard>;
}

