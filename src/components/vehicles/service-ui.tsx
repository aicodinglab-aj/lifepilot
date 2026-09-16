import { useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { vehiclePageStyles } from './vehicle-page';

export function ServiceAction({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[serviceStyles.button, disabled && { opacity: 0.45 }]}><Text style={serviceStyles.accent}>{label}</Text></Pressable>;
}
export function BillImage({ uri, full = false }: { uri: string | null; full?: boolean }) {
  const [failed, setFailed] = useState(false);
  return uri && !failed ? <Image source={{ uri }} contentFit="contain" style={full ? { flex: 1 } : serviceStyles.thumbnail}
    accessibilityLabel="Service bill" onError={() => setFailed(true)} />
    : <View style={serviceStyles.card}><Text style={serviceStyles.body}>Bill image unavailable</Text></View>;
}
export function BillViewer({ uri, close }: { uri: string | null; close: () => void }) {
  return <Modal visible={uri != null} onRequestClose={close} animationType="fade">
    <SafeAreaView style={serviceStyles.viewer}>
      <ServiceAction label="Close bill" onPress={close} />
      {uri && <BillImage key={uri} uri={uri} full />}
    </SafeAreaView>
  </Modal>;
}
export const serviceStyles = StyleSheet.create({
  ...vehiclePageStyles,
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  section: { gap: 14 },
  accent: { color: colors.green, fontSize: 15, fontWeight: '700' },
  button: { minHeight: 48, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  thumbnail: { width: '100%', height: 180, backgroundColor: colors.card, borderRadius: 12 },
  viewer: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 16 },
});
