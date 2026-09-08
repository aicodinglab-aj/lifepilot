import type { SQLiteDatabase } from 'expo-sqlite';
import { insertVehicle } from '@/database/vehicles';
import { saveSelectedVehiclePhotos, type SelectedVehiclePhoto } from './photo-service';
import type { NewVehicle } from './vehicle';

export async function createVehicleWithPhotos(
  db: SQLiteDatabase, vehicle: NewVehicle, photos: SelectedVehiclePhoto[], coverId?: string,
): Promise<{ vehicleId: number; photoError: string | null }> {
  const vehicleId = await insertVehicle(db, vehicle);
  try {
    await saveSelectedVehiclePhotos(db, vehicleId, photos, coverId);
    return { vehicleId, photoError: null };
  } catch (error) {
    return {
      vehicleId,
      photoError: error instanceof Error ? error.message : 'The photos could not be saved.',
    };
  }
}
