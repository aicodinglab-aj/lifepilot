import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { deletePhotoRecord, getVehiclePhotos, insertPhoto, setCoverPhoto } from '@/database/vehicle-photos';
import { availablePhotoUri, copyPhoto, ownedPhotoFile } from '@/storage/vehicle-photos';
import { withVehicleOperation } from './vehicle-operation';

export type SelectedVehiclePhoto = { id: string; uri: string; };

export async function pickVehiclePhotos(camera: boolean): Promise<SelectedVehiclePhoto[]> {
  if (Platform.OS === 'web') throw new Error('Vehicle photo storage is available in the Android and iOS app.');
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is required. Enable it in device Settings, or choose photos from your gallery.');
  }
  // The system photo picker grants access only to selected images; no broad library permission is needed.
  const result = camera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({ id: randomUUID(), uri: asset.uri }));
}

export async function addVehiclePhotos(db: SQLiteDatabase, vehicleId: number, camera: boolean) {
  await saveSelectedVehiclePhotos(db, vehicleId, await pickVehiclePhotos(camera));
}

export async function saveSelectedVehiclePhotos(
  db: SQLiteDatabase, vehicleId: number, photos: SelectedVehiclePhoto[], coverId?: string,
) {
  return withVehicleOperation(vehicleId, () => savePhotos(db, vehicleId, photos, coverId));
}

async function savePhotos(
  db: SQLiteDatabase, vehicleId: number, photos: SelectedVehiclePhoto[], coverId?: string,
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
      await insertPhoto(db, { id, vehicleId, localUri: uri, isCover: 0, createdAt: new Date().toISOString() });
      if (__DEV__) console.debug('[vehicle-photo] saved', { vehicleId, photoId: id, savedUri: uri });
      saved++;
    } catch (error) {
      console.error('Vehicle photo save failed:', {
        vehicleId,
        photoId: id,
        sourceUri: asset.uri,
        destinationUri: uri,
        error,
      });

      if (uri) {
        try {
          const file = ownedPhotoFile(vehicleId, id, uri);
          if (file.exists) file.delete();
        } catch (cleanupError) {
          console.error('Vehicle photo cleanup failed:', cleanupError);
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
