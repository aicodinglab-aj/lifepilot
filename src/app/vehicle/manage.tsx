import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { getVehicles } from '@/database/vehicles';
import { deleteVehicle } from '@/features/vehicles/delete-vehicle';
import type { Vehicle } from '@/features/vehicles/vehicle';

export default function ManageVehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicleId = typeof id === 'string' && /^[1-9]\d*$/.test(id) ? Number(id) : NaN;
  const db = useSQLiteContext();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      try {
        if (!Number.isSafeInteger(vehicleId)) throw new Error('Invalid vehicle.');
        const found = (await getVehicles(db, vehicleId))[0];
        if (active) { setVehicle(found ?? null); setError(found ? null : 'This vehicle no longer exists.'); }
      } catch { if (active) setError('Could not load this vehicle. Return to My Garage and try again.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [db, vehicleId]));

  function returnToGarage() {
    // Remove every deleted-vehicle screen, including when opened via a deep link.
    router.dismissAll();
    router.replace('/vehicle-manager');
  }

  function confirmDelete() {
    if (working.current || !vehicle) return;
    working.current = true;
    Alert.alert('Delete vehicle?',
      'This will permanently delete this vehicle and all of its photos and vehicle-related data. This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel', onPress: () => { working.current = false; } },
        { text: 'Delete Vehicle', style: 'destructive', onPress: () => {
          setBusy(true);
          void (async () => {
            try { await deleteVehicle(db, vehicleId); returnToGarage(); }
            catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Deletion failed. Return to My Garage and try again.');
            } finally { working.current = false; setBusy(false); }
          })();
        } },
      ], { cancelable: true, onDismiss: () => { working.current = false; } });
  }

  return <SafeAreaView edges={['bottom']} style={styles.screen}>
    {loading ? <ActivityIndicator color={colors.green} /> : <>
      {vehicle && <View style={styles.identity}>
        <Text style={styles.title}>{vehicle.make} {vehicle.model}</Text>
        <Text style={styles.registration}>{vehicle.registrationNumber}</Text>
      </View>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {vehicle && <View style={styles.dangerZone}>
        <Text style={styles.dangerTitle}>Danger Zone</Text>
        <Text style={styles.description}>Permanently remove this vehicle, its photos and all vehicle-related data.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete Vehicle" disabled={busy}
          onPress={confirmDelete} style={({ pressed }) => [styles.deleteButton, (busy || pressed) && { opacity: 0.6 }]}>
          <Text style={styles.deleteText}>{busy ? 'Deleting…' : 'Delete Vehicle'}</Text>
        </Pressable>
      </View>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={returnToGarage} style={styles.backButton}>
        <Text style={styles.registration}>Return to My Garage</Text>
      </Pressable>
    </>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 24, backgroundColor: colors.background },
  identity: { gap: 8 },
  title: { fontSize: 25, fontWeight: '800', color: colors.white },
  registration: { color: colors.green, fontSize: 16, fontWeight: '700' },
  dangerZone: { marginTop: 24, padding: 20, gap: 16, borderWidth: 1, borderColor: '#B84040', borderRadius: 16, backgroundColor: '#261616' },
  dangerTitle: { color: '#FF8585', fontSize: 20, fontWeight: '800' },
  description: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  deleteButton: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#B3261E' },
  deleteText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  error: { color: '#FF8585', lineHeight: 22 },
  backButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
