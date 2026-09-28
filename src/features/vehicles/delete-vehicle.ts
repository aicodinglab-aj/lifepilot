import { withOperation, type OperationContext } from '@/features/activity/operation-lifecycle';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { deleteVehiclePhotoDirectory } from '@/storage/vehicle-photos';
import { withVehicleOperation } from './vehicle-operation';

// Add future vehicle-owned file stores here. Each cleanup must be idempotent,
// derive its own directory from the validated ID, and throw on failure.
// Future vehicle-owned tables must use REFERENCES vehicles(id) ON DELETE CASCADE.
// Shared/personal records must never be included in this list or those cascades.
const ownedFileCleanup = [deleteVehiclePhotoDirectory];

function validateVehicleId(vehicleId: number) {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) throw new Error('Invalid vehicle.');
}

async function finishCleanup(db: SQLiteDatabase, vehicleId: number, context?: OperationContext) {
  return withOperation(async () => {
    validateVehicleId(vehicleId);
    // Protect against an invalid/stale job ever targeting a live vehicle.
    if (await db.getFirstAsync('SELECT id FROM vehicles WHERE id = ?', [vehicleId])) {
      throw new Error('Cleanup refused: this vehicle still exists.');
    }
    try {
      for (const cleanup of ownedFileCleanup) await cleanup(vehicleId);
      await db.runAsync('DELETE FROM vehicle_deletion_cleanup WHERE vehicle_id = ?', [vehicleId]);
    } catch {
      throw new Error('The vehicle was removed, but local file cleanup is incomplete. Return to My Garage and retry cleanup.');
    }
  }, context);
}

export async function deleteVehicle(db: SQLiteDatabase, vehicleId: number, context?: OperationContext) {
  return withOperation(async (operation) => {
    validateVehicleId(vehicleId);
    return withVehicleOperation(vehicleId, () => performDeletion(db, vehicleId, operation), operation);
  }, context);
}

async function performDeletion(db: SQLiteDatabase, vehicleId: number, context?: OperationContext) {
  return withOperation(async (operation) => {
    // Commit intent and relational deletion together before touching any files.
    // A crash at any later point leaves a durable job for Garage to resume.
    // SDK 57 exclusive transactions open a new connection without inheriting
    // PRAGMA foreign_keys. Configure a private connection BEFORE its BEGIN.
    const slash = db.databasePath.lastIndexOf('/');
    const tx = await openDatabaseAsync(db.databasePath.slice(slash + 1),
      { ...db.options, useNewConnection: true }, db.databasePath.slice(0, slash));
    try {
      await tx.execAsync('PRAGMA foreign_keys = ON;');
      await tx.withTransactionAsync(async () => {
        await tx.runAsync(`INSERT OR IGNORE INTO vehicle_deletion_cleanup (vehicle_id, created_at)
          SELECT id, ? FROM vehicles WHERE id = ?`, [new Date().toISOString(), vehicleId]);
        await tx.runAsync('DELETE FROM vehicles WHERE id = ?', [vehicleId]);
      });
    } finally { await tx.closeAsync(); }
    const job = await db.getFirstAsync('SELECT vehicle_id FROM vehicle_deletion_cleanup WHERE vehicle_id = ?', [vehicleId]);
    if (job) await finishCleanup(db, vehicleId, operation);
  }, context);
}

export async function retryVehicleCleanup(db: SQLiteDatabase, context?: OperationContext) {
  return withOperation(async (operation) => {
    const jobs = await db.getAllAsync<{ vehicle_id: number }>('SELECT vehicle_id FROM vehicle_deletion_cleanup ORDER BY vehicle_id');
    let failed = false;
    for (const job of jobs) {
      try { await finishCleanup(db, job.vehicle_id, operation); }
      catch { failed = true; }
    }
    if (failed) throw new Error('Some deleted vehicle files could not be removed. Retry cleanup when device storage is available.');
  }, context);
}
