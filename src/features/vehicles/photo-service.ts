import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { deletePhotoRecord, getVehiclePhotos, insertPhoto, setCoverPhoto } from '@/database/vehicle-photos';
import { availablePhotoUri, copyPhoto, ownedPhotoFile } from '@/storage/vehicle-photos';
import { withVehicleOperation } from './vehicle-operation';

export type SelectedVehiclePhoto = { id: string; uri: string; };

export async function pickVehiclePhotos(camera: boolean, cover = false): Promise<SelectedVehiclePhoto[]> {
  if (Platform.OS === 'web') throw new Error('Vehicle photo storage is available in the Android and iOS app.');
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is required. Enable it in device Settings, or choose photos from your gallery.');
  }
  // The system photo picker grants access only to selected images; no broad library permission is needed.
  // SDK 57 supports a wide crop on Android; iOS's native editor is square.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'], quality: 0.9, allowsEditing: cover,
    allowsMultipleSelection: !camera && !cover,
    ...(cover && Platform.OS === 'android' ? { aspect: [16, 9] as [number, number] } : {}),
  };
  // Temporary diagnostics: only configuration, never assets, paths or vehicle IDs.
  if (process.env.EXPO_PUBLIC_APP_VARIANT !== 'production'
    && (__DEV__ || process.env.EXPO_PUBLIC_APP_VARIANT === 'preview')) {
    console.info('[vehicle-photo-picker] launch', {
      source: camera ? 'camera' : 'gallery', purpose: cover ? 'cover' : 'normal',
      allowsEditing: options.allowsEditing,
      allowsMultipleSelection: options.allowsMultipleSelection,
      aspect: options.aspect ?? null,
    });
  }
  const result = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  return result.assets.map((asset) => ({ id: randomUUID(), uri: asset.uri }));
}

export async function addVehiclePhotos(db: SQLiteDatabase, vehicleId: number, camera: boolean) {
  await saveSelectedVehiclePhotos(db, vehicleId, await pickVehiclePhotos(camera));
}

export async function addVehicleCoverPhoto(db: SQLiteDatabase, vehicleId: number, camera: boolean) {
  const photos = await pickVehiclePhotos(camera, true);
  if (!photos.length) return;
  await withVehicleOperation(vehicleId, () => savePhotos(db, vehicleId, photos.slice(0, 1), undefined, true));
}

export async function saveSelectedVehiclePhotos(
  db: SQLiteDatabase, vehicleId: number, photos: SelectedVehiclePhoto[], coverId?: string,
) {
  return withVehicleOperation(vehicleId, () => savePhotos(db, vehicleId, photos, coverId));
}

async function savePhotos(
  db: SQLiteDatabase, vehicleId: number, photos: SelectedVehiclePhoto[], coverId?: string, makeCover = false,
) {
  if (!await db.getFirstAsync('SELECT id FROM vehicles WHERE id = ?', [vehicleId])) {
    throw new Error('This vehicle no longer exists.');
  }
  // Save the selected cover first so a new vehicle gets the correct cover even
  // if a later image fails. Existing galleries retain their current cover.
  const ordered = coverId
    ? [...photos.filter((photo) => photo.id === coverId), ...photos.filter((photo) => photo.id !== coverId)]
    : photos;
  let saved = 0;
  for (const asset of ordered) {
    const id = asset.id;
    let uri: string | undefined;
    try {
      uri = await copyPhoto(vehicleId, id, asset.uri);
      await insertPhoto(db, { id, vehicleId, localUri: uri, isCover: 0, createdAt: new Date().toISOString() }, makeCover);
      saved++;
    } catch (error) {
      console.error('Vehicle photo save failed.');

      if (uri) {
        try {
          const file = ownedPhotoFile(vehicleId, id, uri);
          if (file.exists) file.delete();
        } catch {
          console.error('Vehicle photo cleanup failed.');
        }
      }

      throw new Error(
        error instanceof Error
          ? `${saved} photos saved. ${error.message}`
          : `${saved} photos saved. Could not save the next image.`
      );
    }
  }
}

export async function chooseCover(db: SQLiteDatabase, vehicleId: number, photoId: string) {
  const photo = (await getVehiclePhotos(db, vehicleId)).find((item) => item.id === photoId);
  if (!photo || !availablePhotoUri(vehicleId, photo.id, photo.localUri)) throw new Error('This image is missing. Add it again or delete its entry.');
  await setCoverPhoto(db, vehicleId, photoId);
}

export async function removeVehiclePhoto(db: SQLiteDatabase, vehicleId: number, photoId: string) {
  const photo = (await getVehiclePhotos(db, vehicleId)).find((item) => item.id === photoId);
  if (!photo) return;
  const file = ownedPhotoFile(vehicleId, photoId, photo.localUri);
  // File first: on a filesystem error the row remains available for retry. If the
  // database fails afterwards, the missing-file entry can be safely deleted again.
  if (file.exists) file.delete();
  await deletePhotoRecord(db, vehicleId, photoId);
}
