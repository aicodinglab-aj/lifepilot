import { useThemedStyles, useAppearance, useThemeColor } from '@/features/appearance/appearance-provider';
import { useCallback, useState } from 'react';
import { router, Stack, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VehicleCard } from '@/components/vehicles/vehicle-card';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { getVehicles } from '@/database/vehicles';
import { retryVehicleCleanup } from '@/features/vehicles/delete-vehicle';
import { retryServiceCleanup } from '@/features/vehicles/service-maintenance';
import { retryCoverageCleanup } from '@/features/vehicles/coverage-service';
import type { Vehicle } from '@/features/vehicles/vehicle';

function returnHome() {
  router.dismissTo('/(tabs)');
}

export default function VehicleManagerScreen() {
  const themed_styles = useThemedStyles(styles);
  const appearance = useAppearance();
  const themedColor = useThemeColor();
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

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        returnHome();
        return true;
      });

      return () => subscription.remove();
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      void loadGarage();
    }, [loadGarage]),
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={themed_styles.safeArea}>
      <Stack.Screen options={{
        headerBackVisible: false,
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            onPress={returnHome}
            style={({ pressed }) => [themed_styles.backButton, pressed && themed_styles.backButtonPressed]}>
            <SymbolView
              name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }}
              tintColor={appearance.colors.green}
              size={26}
            />
          </Pressable>
        ),
      }} />
      <StatusBar barStyle={appearance.isDark ? 'light-content' : 'dark-content'} backgroundColor={appearance.colors.background} />

      <View style={themed_styles.container}>
        <View style={themed_styles.heading}>
          <Text style={themed_styles.eyebrow}>VEHICLE MANAGER</Text>
          <Text style={themed_styles.title}>My Garage</Text>
          <Text style={themed_styles.subtitle}>Keep each vehicle and its costs organized in one place.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/reminders')} style={themed_styles.retryButton}>
            <Text style={themed_styles.retryText}>Vehicle Reminders</Text>
          </Pressable>
        </View>

        {cleanupError && <View style={{ marginBottom: 16, gap: 8 }}>
          <Text accessibilityRole="alert" style={{ color: themedColor('#FF8585') }}>{cleanupError}</Text>
          <Pressable accessibilityRole="button" disabled={isLoading} onPress={loadGarage} style={themed_styles.retryButton}>
            <Text style={themed_styles.retryText}>Retry cleanup</Text>
          </Pressable>
        </View>}
        {isLoading ? (
          <View style={themed_styles.centerState}>
            <ActivityIndicator color={appearance.colors.green} size="large" />
            <Text style={themed_styles.stateText}>Loading your garage…</Text>
          </View>
        ) : loadError ? (
          <View style={themed_styles.centerState}>
            <Text style={themed_styles.errorTitle}>Garage unavailable</Text>
            <Text style={themed_styles.emptyText}>{loadError}</Text>
            <Pressable accessibilityRole="button" onPress={loadGarage} style={themed_styles.retryButton}>
              <Text style={themed_styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : vehicles.length === 0 ? (
          <View style={themed_styles.centerState}>
            <View style={themed_styles.iconBox}>
              <Text style={themed_styles.icon}>🚗</Text>
            </View>
            <Text style={themed_styles.emptyTitle}>Your garage is empty</Text>
            <Text style={themed_styles.emptyText}>
              Add your first vehicle when you are ready to start managing it.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={themed_styles.vehicleList}
            showsVerticalScrollIndicator={false}>
            {vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </ScrollView>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/add-vehicle')}
          style={({ pressed }) => [themed_styles.addButton, pressed && themed_styles.addButtonPressed]}>
          <Text style={themed_styles.addButtonText}>Add Vehicle</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minWidth: 48,
    minHeight: 48,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: { opacity: 0.6 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 },
  heading: { marginBottom: 24 },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: {
    color: colors.white,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 8,
  },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 10 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#193D2C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  icon: { fontSize: 34 },
  stateText: { color: colors.muted, fontSize: 14, marginTop: 14 },
  emptyTitle: { color: colors.white, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  errorTitle: { color: colors.white, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 9,
    maxWidth: 300,
    textAlign: 'center',
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 12,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  retryText: { color: colors.green, fontSize: 14, fontWeight: '700' },
  vehicleList: { gap: 14, paddingBottom: 20 },
  addButton: {
    backgroundColor: colors.green,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  addButtonPressed: { opacity: 0.8 },
  addButtonText: { color: colors.background, fontSize: 16, fontWeight: '800' },
});
