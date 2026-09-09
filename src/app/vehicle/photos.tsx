import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VehiclePhotoImage } from '@/components/vehicles/vehicle-photo-image';
import { VehicleHeader } from '@/components/vehicles/vehicle-page';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { getVehiclePhotos } from '@/database/vehicle-photos';
import { getVehicles } from '@/database/vehicles';
import { addVehiclePhotos, chooseCover, removeVehiclePhoto } from '@/features/vehicles/photo-service';
import type { Vehicle } from '@/features/vehicles/vehicle';
import type { VehiclePhoto } from '@/features/vehicles/vehicle-photo';

export default function VehiclePhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicleId = typeof id === 'string' && /^[1-9]\d*$/.test(id) ? Number(id) : NaN;
  const db = useSQLiteContext();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [viewing, setViewing] = useState<VehiclePhoto | null>(null);

  const load = useCallback(async () => {
    try {
      if (!Number.isSafeInteger(vehicleId)) throw new Error('Invalid vehicle link.');
      const [vehicles, images] = await Promise.all([getVehicles(db, vehicleId), getVehiclePhotos(db, vehicleId)]);
      setVehicle(vehicles[0] ?? null);
      setPhotos(images);
      setError(vehicles.length ? null : 'This vehicle could not be found.');
    } catch { setError('Could not load this vehicle. Check the link and try again.'); }
    finally { setLoading(false); }
  }, [db, vehicleId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function perform(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try { await action(); }
    catch (cause) { Alert.alert('Photo action failed', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { await load(); working.current = false; setBusy(false); }
  }

  function confirmDelete(photo: VehiclePhoto) {
    Alert.alert('Delete photo?', 'This permanently removes this photo from LifePilot. Your original gallery image is kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void perform(() => removeVehiclePhoto(db, vehicleId, photo.id)); } },
    ]);
  }

  if (loading) return <View style={styles.center}><VehicleHeader title="Documents & Photos" /><ActivityIndicator color={colors.green} /></View>;
  if (error || !vehicle) return <View style={styles.center}><VehicleHeader title="Documents & Photos" /><Text style={styles.text}>{error}</Text><Action label="Try again" onPress={() => { void load(); }} /></View>;
  const cover = photos.find((photo) => photo.isCover === 1);
  return <SafeAreaView edges={['bottom']} style={styles.screen}>
    <VehicleHeader title="Documents & Photos" vehicleId={busy ? undefined : vehicleId} />
    <FlatList data={photos} keyExtractor={(photo) => photo.id} numColumns={2}
      contentContainerStyle={styles.content} columnWrapperStyle={styles.row}
      ListHeaderComponent={<View style={styles.heading}>
        <Text style={styles.title}>{vehicle.make} {vehicle.model}</Text>
        <Text style={styles.accent}>{vehicle.registrationNumber}</Text>
        <Text style={styles.text}>{vehicle.modelYear} · {vehicle.vehicleType} · {vehicle.fuelType}</Text>
        <Text style={styles.text}>{vehicle.odometerKm.toLocaleString()} km{vehicle.variant ? ` · ${vehicle.variant}` : ''}</Text>
        <VehiclePhotoImage vehicleId={vehicleId} photoId={cover?.id ?? null} uri={cover?.localUri ?? null} style={{ height: 230 }} />
        <Text style={styles.title}>Photos ({photos.length})</Text>
        <Text style={styles.text}>Your vehicle photo gallery. Document uploads are coming in a future update.</Text>
        <View style={styles.row}>
          <Action label="Add photos" disabled={busy} onPress={() => { void perform(() => addVehiclePhotos(db, vehicleId, false)); }} />
          <Action label="Take photo" disabled={busy} onPress={() => { void perform(() => addVehiclePhotos(db, vehicleId, true)); }} />
        </View>
        {busy && <ActivityIndicator color={colors.green} accessibilityLabel="Saving photo changes" />}
      </View>}
      ListEmptyComponent={<Text style={styles.text}>Add photos from your gallery or take a photo to start.</Text>}
      renderItem={({ item }) => <View style={styles.tile}>
        <Pressable accessibilityRole="button" accessibilityLabel="View photo" onPress={() => setViewing(item)}>
          <VehiclePhotoImage vehicleId={vehicleId} photoId={item.id} uri={item.localUri} style={{ height: 150 }} />
        </Pressable>
        <Action label={item.isCover ? 'Cover photo' : 'Set as cover'} disabled={busy || !!item.isCover}
          onPress={() => { void perform(() => chooseCover(db, vehicleId, item.id)); }} />
        <Action label="Delete" disabled={busy} onPress={() => confirmDelete(item)} />
      </View>} />
    <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(null)}>
      <SafeAreaView style={styles.viewer}>
        <Action label="Close photo" onPress={() => setViewing(null)} />
        {viewing && <VehiclePhotoImage vehicleId={vehicleId} photoId={viewing.id} uri={viewing.localUri} contain style={{ flex: 1 }} />}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, disabled && { opacity: 0.45 }]}><Text style={styles.accent}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  content: { padding: 20, gap: 14 },
  heading: { gap: 14, marginBottom: 10 },
  title: { color: colors.white, fontSize: 25, fontWeight: '800' },
  text: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  accent: { color: colors.green, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, maxWidth: '50%', gap: 8, padding: 8, borderRadius: 18, backgroundColor: colors.card },
  button: { minHeight: 44, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, padding: 16, gap: 16, backgroundColor: colors.background },
});
