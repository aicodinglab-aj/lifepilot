import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { clearServiceCleanup, deleteServiceRecord, getService, getServiceCleanup, insertService, queueServiceCleanup } from '@/database/vehicle-services';
import { copyServiceBill, deleteServiceBillDirectory, validateServiceOwner } from '@/storage/service-bills';
import type { SelectedVehiclePhoto } from './photo-service';
import { serviceFormToDraft, type ServiceBill, type ServiceForm } from './service-record';
import { withVehicleOperation } from './vehicle-operation';

async function finishCleanup(db: SQLiteDatabase, vehicleId: number, serviceId: string) {
  validateServiceOwner(vehicleId, serviceId);
  if (await getService(db, vehicleId, serviceId)) throw new Error('Cleanup refused: this service still exists.');
  await deleteServiceBillDirectory(vehicleId, serviceId);
  await clearServiceCleanup(db, vehicleId, serviceId);
}
export async function createService(db: SQLiteDatabase, vehicleId: number, form: ServiceForm, photos: SelectedVehiclePhoto[]) {
  const draft = serviceFormToDraft(form);
  const id = randomUUID();
  validateServiceOwner(vehicleId, id);
  return withVehicleOperation(vehicleId, async () => {
    if (!await db.getFirstAsync('SELECT id FROM vehicles WHERE id = ?', [vehicleId])) throw new Error('This vehicle no longer exists.');
    // Persist cleanup intent BEFORE copying. Commit clears it atomically with metadata.
    await queueServiceCleanup(db, vehicleId, id);
    try {
      const bills: ServiceBill[] = [];
      for (const photo of photos) {
        const photoId = randomUUID();
        const localUri = await copyServiceBill(vehicleId, id, photoId, photo.uri);
        bills.push({ id: photoId, vehicleId, serviceId: id, localUri, createdAt: new Date().toISOString() });
      }
      await insertService(db, vehicleId, id, draft, bills);
      return id;
    } catch (cause) {
      // Never remove files if a committed record exists (including a connection-close error).
      if (await getService(db, vehicleId, id)) return id;
      try { await finishCleanup(db, vehicleId, id); }
      catch { throw new Error('Service was not saved. Some temporary bill files need cleanup; return to My Garage to retry.'); }
      throw cause;
    }
  });
}
export async function deleteService(db: SQLiteDatabase, vehicleId: number, serviceId: string) {
  validateServiceOwner(vehicleId, serviceId);
  return withVehicleOperation(vehicleId, async () => {
    await deleteServiceRecord(db, vehicleId, serviceId);
    const jobs = await getServiceCleanup(db, vehicleId);
    if (!jobs.some((job) => job.serviceId === serviceId)) return { cleanupPending: false };
    try { await finishCleanup(db, vehicleId, serviceId); return { cleanupPending: false }; }
    catch { return { cleanupPending: true }; }
  });
}
export async function retryServiceCleanup(db: SQLiteDatabase, vehicleId?: number) {
  const jobs = await getServiceCleanup(db, vehicleId);
  let failed = false;
  for (const job of jobs) {
    try { await withVehicleOperation(job.vehicleId, () => finishCleanup(db, job.vehicleId, job.serviceId)); }
    catch { failed = true; }
  }
  if (failed) throw new Error('Some service bill files still need cleanup. Retry cleanup when storage is available.');
}
