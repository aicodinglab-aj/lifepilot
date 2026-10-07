import { withOperation, type OperationContext } from '@/features/activity/operation-lifecycle';
import type { SQLiteDatabase } from 'expo-sqlite';
import { insertVehicle } from '@/database/vehicles';
import { safePhotoError, saveSelectedVehiclePhotos, type SelectedVehiclePhoto } from './photo-service';
import type { NewVehicle } from './vehicle';

export async function createVehicleWithPhotos(
  db: SQLiteDatabase, vehicle: NewVehicle, photos: SelectedVehiclePhoto[], coverId?: string, context?: OperationContext
): Promise<{ vehicleId: number; photoError: string | null }> {
  return withOperation(async (operation) => {
    const vehicleId = await insertVehicle(db, vehicle, operation);
    try {
      await saveSelectedVehiclePhotos(db, vehicleId, photos, coverId, operation);
      return { vehicleId, photoError: null };
    } catch (error) {
      console.error('Vehicle photo save failed after vehicle creation.', error);
      return {
        vehicleId,
        photoError: safePhotoError(error),
      };
    }
  }, context);
}
