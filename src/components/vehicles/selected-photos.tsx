import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import type { SelectedVehiclePhoto } from '@/features/vehicles/photo-service';

export function SelectedPhotos({ photos, coverId, disabled, onPick, onRemove, onCover }: {
  photos: SelectedVehiclePhoto[]; coverId?: string; disabled: boolean;
  onPick: (camera: boolean) => void; onRemove: (id: string) => void; onCover: (id: string) => void;
}) {
  return <View style={styles.section}>
    <Text style={styles.title}>Add Photos</Text>
    <Text style={styles.hint}>Optional · Choose a cover for your garage. Photos are saved when you save the vehicle.</Text>
    <View style={styles.row}>
      <Action label="Select photos" disabled={disabled} onPress={() => onPick(false)} />
      <Action label="Take photo" disabled={disabled} onPress={() => onPick(true)} />
    </View>
    <View style={styles.grid}>
      {photos.map((photo, index) => <View key={photo.id} style={styles.tile}>
        <Preview uri={photo.uri} />
        <Action label={coverId === photo.id ? 'Cover photo' : 'Set as cover'} disabled={disabled}
          selected={coverId === photo.id} onPress={() => onCover(photo.id)} />
        <Action label="Remove" accessibilityLabel={`Remove selected photo ${index + 1}`} disabled={disabled} onPress={() => onRemove(photo.id)} />
      </View>)}
    </View>
  </View>;
}

function Preview({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  return <View style={styles.preview}>{failed
    ? <Text style={styles.hint}>Preview unavailable. Remove and select again.</Text>
    : <Image source={{ uri }} accessibilityLabel="Selected vehicle photo" style={StyleSheet.absoluteFill}
        resizeMode="cover" onError={() => setFailed(true)} />}</View>;
}

function Action({ label, accessibilityLabel, disabled, selected, onPress }: {
  label: string; accessibilityLabel?: string; disabled: boolean; selected?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={[styles.button, selected && styles.selected, disabled && { opacity: 0.5 }]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 28 },
  title: { color: colors.white, fontSize: 20, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47%', padding: 8, gap: 8, borderRadius: 16, backgroundColor: colors.card },
  preview: { height: 130, borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
  button: { minHeight: 44, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: colors.green },
  buttonText: { color: colors.green, fontWeight: '700' },
});
