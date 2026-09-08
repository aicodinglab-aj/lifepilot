import type { SQLiteDatabase } from 'expo-sqlite';
import type { VehiclePhoto } from '@/features/vehicles/vehicle-photo';

export function getVehiclePhotos(db: SQLiteDatabase, vehicleId: number) {
  return db.getAllAsync<VehiclePhoto>(
    `SELECT id, vehicle_id AS vehicleId, local_uri AS localUri,
      is_cover AS isCover, created_at AS createdAt FROM vehicle_photos
      WHERE vehicle_id = ? ORDER BY created_at, id`, [vehicleId]);
}

export async function insertPhoto(db: SQLiteDatabase, photo: VehiclePhoto) {
  await db.runAsync(
    `INSERT INTO vehicle_photos (id, vehicle_id, local_uri, is_cover, created_at)
     VALUES (?, ?, ?, CASE WHEN EXISTS (
       SELECT 1 FROM vehicle_photos WHERE vehicle_id = ? AND is_cover = 1
     ) THEN 0 ELSE 1 END, ?)`,
    [photo.id, photo.vehicleId, photo.localUri, photo.vehicleId, photo.createdAt]);
}

export async function setCoverPhoto(db: SQLiteDatabase, vehicleId: number, photoId: string) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const photo = await tx.getFirstAsync('SELECT id FROM vehicle_photos WHERE vehicle_id = ? AND id = ?', [vehicleId, photoId]);
    if (!photo) throw new Error('This photo no longer exists.');
    await tx.runAsync('UPDATE vehicle_photos SET is_cover = 0 WHERE vehicle_id = ?', [vehicleId]);
    await tx.runAsync('UPDATE vehicle_photos SET is_cover = 1 WHERE vehicle_id = ? AND id = ?', [vehicleId, photoId]);
  });
}

export async function deletePhotoRecord(db: SQLiteDatabase, vehicleId: number, photoId: string) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM vehicle_photos WHERE vehicle_id = ? AND id = ?', [vehicleId, photoId]);
    await tx.runAsync(`UPDATE vehicle_photos SET is_cover = 1 WHERE id = (
      SELECT id FROM vehicle_photos WHERE vehicle_id = ? ORDER BY created_at, id LIMIT 1
    ) AND NOT EXISTS (SELECT 1 FROM vehicle_photos WHERE vehicle_id = ? AND is_cover = 1)`, [vehicleId, vehicleId]);
  });
}
