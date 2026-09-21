import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, BackHandler, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VehicleCard } from '@/components/vehicles/vehicle-card';
import { Button } from '@/components/ui/button';
import { InteractiveCard, StatusCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { iconSizes, spacing, typography } from '@/constants/design-system';
import { getVehicles } from '@/database/vehicles';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { retryCoverageCleanup } from '@/features/vehicles/coverage-service';
import { retryVehicleCleanup } from '@/features/vehicles/delete-vehicle';
import { retryServiceCleanup } from '@/features/vehicles/service-maintenance';
import type { Vehicle } from '@/features/vehicles/vehicle';

function returnHome() {
  router.dismissTo('/(tabs)');
}

export default function VehicleManagerScreen() {
  const { colors, isDark } = useAppearance();
  const db = useSQLiteContext();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const loadGarage = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      try { await retryVehicleCleanup(db); await retryServiceCleanup(db); await retryCoverageCleanup(db); setCleanupError(null); }
      catch (cause) { setCleanupError(cause instanceof Error ? cause.message : 'Vehicle file cleanup failed. Please retry.'); }
      setVehicles(await getVehicles(db));
    } catch {
      setLoadError('Your garage could not be loaded. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { returnHome(); return true; });
    return () => subscription.remove();
  }, []));
  useFocusEffect(useCallback(() => { void loadGarage(); }, [loadGarage]));

  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="Vehicle Manager" onBack={returnHome} />
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.base, paddingBottom: spacing.xl, gap: spacing.lg }}
      showsVerticalScrollIndicator={false}>
      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.label, { color: colors.primary, letterSpacing: 1.2 }]}>VEHICLE MANAGER</Text>
        <Text accessibilityRole="header" style={[typography.hero, { color: colors.text }]}>My Garage</Text>
        <Text style={[typography.body, { color: colors.muted }]}>Keep each vehicle and its costs organized in one place.</Text>
      </View>

      <InteractiveCard accessibilityLabel="Vehicle Reminders" onPress={() => router.push('/reminders')}
        leading={<SymbolView name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
          size={iconSizes.card} tintColor={colors.primary} />}
        trailing={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={iconSizes.action} tintColor={colors.primary} />}>
        <Text style={[typography.cardTitle, { color: colors.text }]}>Vehicle Reminders</Text>
        <Text style={[typography.secondaryBody, { color: colors.muted }]}>Insurance, PUC and service due dates</Text>
      </InteractiveCard>
      <Button label="Add Vehicle" icon={<Text accessible={false} style={{ color: colors.onPrimary, fontSize: 20 }}>+</Text>}
        onPress={() => router.push('/add-vehicle')} />

      {cleanupError && <StatusCard tone="warning">
        <Text accessibilityRole="alert" style={[typography.secondaryBody, { color: colors.warning }]}>{cleanupError}</Text>
        <Button label="Retry cleanup" variant="tertiary" disabled={isLoading} onPress={() => { void loadGarage(); }} />
      </StatusCard>}

      {isLoading ? <View style={{ flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[typography.secondaryBody, { color: colors.muted }]}>Loading your garage…</Text>
      </View> : loadError ? <EmptyState title="Garage unavailable" description={loadError}
        action={{ label: 'Try Again', onPress: () => { void loadGarage(); } }} />
        : vehicles.length === 0 ? <EmptyState
          icon={<SymbolView name={{ ios: 'car.fill', android: 'directions_car', web: 'directions_car' }}
            size={40} tintColor={colors.primary} />}
          title="Your garage is empty" description="Add your first vehicle when you are ready to start managing it." />
          : <View style={{ gap: spacing.md }}>
            <Text accessibilityRole="header" style={[typography.sectionHeading, { color: colors.text }]}>Your vehicles</Text>
            {vehicles.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}
          </View>}
    </ScrollView>
  </SafeAreaView>;
}
