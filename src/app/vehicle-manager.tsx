import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, BackHandler, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VehicleCard } from '@/components/vehicles/vehicle-card';
import { Button } from '@/components/ui/button';
import { StatusCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { spacing, typography } from '@/constants/design-system';
import { getVehicles } from '@/database/vehicles';
import { getVehiclePhotos } from '@/database/vehicle-photos';
import { getCurrentCoverage } from '@/database/vehicle-coverage';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { localToday } from '@/features/vehicles/coverage-status';
import { retryCoverageCleanup } from '@/features/vehicles/coverage-service';
import { retryVehicleCleanup } from '@/features/vehicles/delete-vehicle';
import { retryServiceCleanup } from '@/features/vehicles/service-maintenance';
import type { Vehicle } from '@/features/vehicles/vehicle';
import type { VehiclePhoto } from '@/features/vehicles/vehicle-photo';
import type { CoverageRecord } from '@/features/vehicles/coverage-record';

type GarageVehicle = { vehicle: Vehicle; photo: VehiclePhoto | null; insurance: CoverageRecord | null; puc: CoverageRecord | null };

function returnHome() {
  router.dismissTo('/(tabs)');
}

export default function VehicleManagerScreen() {
  const { colors, isDark } = useAppearance();
  const db = useSQLiteContext();
  const [vehicles, setVehicles] = useState<GarageVehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const loadGarage = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      try { await retryVehicleCleanup(db); await retryServiceCleanup(db); await retryCoverageCleanup(db); setCleanupError(null); }
      catch (cause) { setCleanupError(cause instanceof Error ? cause.message : 'Vehicle file cleanup failed. Please retry.'); }
      const today = localToday();
      const records = await getVehicles(db);
      setVehicles(await Promise.all(records.map(async (vehicle) => {
        const [photos, insurance, puc] = await Promise.all([
          getVehiclePhotos(db, vehicle.id),
          getCurrentCoverage(db, 'insurance', vehicle.id, today),
          getCurrentCoverage(db, 'puc', vehicle.id, today),
        ]);
        return { vehicle, photo: photos[0] ?? null, insurance, puc };
      })));
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
      <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <Text accessibilityRole="header" style={[typography.hero, { color: colors.text, flexShrink: 1 }]}>My Garage</Text>
        <Button label="+ Add" style={{ minHeight: 44, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}
          onPress={() => router.push('/add-vehicle')} />
      </View>

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
            {vehicles.map((item) => <VehicleCard key={item.vehicle.id} {...item} />)}
          </View>}
    </ScrollView>
  </SafeAreaView>;
}
