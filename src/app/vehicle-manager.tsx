import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  ActivityIndicator,
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
import type { Vehicle } from '@/features/vehicles/vehicle';

export default function VehicleManagerScreen() {
  const db = useSQLiteContext();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const loadGarage = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      try { await retryVehicleCleanup(db); setCleanupError(null); }
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
      void loadGarage();
    }, [loadGarage]),
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.container}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>VEHICLE MANAGER</Text>
          <Text style={styles.title}>My Garage</Text>
          <Text style={styles.subtitle}>Keep each vehicle and its costs organized in one place.</Text>
        </View>

        {cleanupError && <View style={{ marginBottom: 16, gap: 8 }}>
          <Text accessibilityRole="alert" style={{ color: '#FF8585' }}>{cleanupError}</Text>
          <Pressable accessibilityRole="button" disabled={isLoading} onPress={loadGarage} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry cleanup</Text>
          </Pressable>
        </View>}
        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.green} size="large" />
            <Text style={styles.stateText}>Loading your garage…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Garage unavailable</Text>
            <Text style={styles.emptyText}>{loadError}</Text>
            <Pressable accessibilityRole="button" onPress={loadGarage} style={styles.retryButton}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : vehicles.length === 0 ? (
          <View style={styles.centerState}>
            <View style={styles.iconBox}>
              <Text style={styles.icon}>🚗</Text>
            </View>
            <Text style={styles.emptyTitle}>Your garage is empty</Text>
            <Text style={styles.emptyText}>
              Add your first vehicle when you are ready to start managing it.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.vehicleList}
            showsVerticalScrollIndicator={false}>
            {vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </ScrollView>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/add-vehicle')}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}>
          <Text style={styles.addButtonText}>Add Vehicle</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
