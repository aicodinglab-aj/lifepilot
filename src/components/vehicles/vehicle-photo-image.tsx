import { useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { availablePhotoUri } from '@/storage/vehicle-photos';

export function VehiclePhotoImage({ vehicleId, photoId, uri, style, contain = false }: {
  vehicleId: number; photoId: string | null; uri: string | null;
  style?: StyleProp<ViewStyle>; contain?: boolean;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const resolved = photoId && uri ? availablePhotoUri(vehicleId, photoId, uri) : null;
  return <View style={[styles.frame, style]}>
    {resolved && failedUri !== resolved
      ? <Image accessibilityLabel="Vehicle photo" source={{ uri: resolved }} style={StyleSheet.absoluteFill}
          resizeMode={contain ? 'contain' : 'cover'} onError={(event) => {
            if (__DEV__) console.debug('[vehicle-photo] image error', {
              vehicleId, photoId, savedUri: uri, resolvedUri: resolved, error: event.nativeEvent.error,
            });
            setFailedUri(resolved);
          }} />
      : <Text style={styles.placeholder}>{uri ? 'Photo unavailable' : 'No vehicle photo yet'}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  placeholder: { color: colors.muted, textAlign: 'center', padding: 12 },
});
