import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { ServiceBill, ServiceDraft, ServiceRecord } from '@/features/vehicles/service-record';

const totalSql = `CASE WHEN parts_cost IS NULL AND labour_cost IS NULL AND other_cost IS NULL THEN NULL
  ELSE ROUND(COALESCE(parts_cost, 0) + COALESCE(labour_cost, 0) + COALESCE(other_cost, 0), 2) END`;
const columns = `id, vehicle_id AS vehicleId, service_date AS serviceDate, odometer, title, workshop, description,
  parts_cost AS partsCost, labour_cost AS labourCost, other_cost AS otherCost, ${totalSql} AS totalCost,
  next_service_date AS nextServiceDate, next_service_odometer AS nextServiceOdometer, notes,
  created_at AS createdAt, updated_at AS updatedAt`;
export const SERVICE_PAGE_SIZE = 40;

export function getServiceHistory(db: SQLiteDatabase, vehicleId: number, cursor?: ServiceRecord) {
  return db.getAllAsync<ServiceRecord>(`SELECT ${columns} FROM vehicle_services WHERE vehicle_id = ?
    ${cursor ? 'AND (service_date, created_at, id) < (?, ?, ?)' : ''}
    ORDER BY service_date DESC, created_at DESC, id DESC LIMIT ?`,
  cursor ? [vehicleId, cursor.serviceDate, cursor.createdAt, cursor.id, SERVICE_PAGE_SIZE] : [vehicleId, SERVICE_PAGE_SIZE]);
}
export function getService(db: SQLiteDatabase, vehicleId: number, serviceId: string) {
  return db.getFirstAsync<ServiceRecord>(`SELECT ${columns} FROM vehicle_services WHERE vehicle_id = ? AND id = ?`, [vehicleId, serviceId]);
}
export async function getServiceSummary(db: SQLiteDatabase, vehicleId: number) {
  const latest = await db.getFirstAsync<ServiceRecord>(`SELECT ${columns} FROM vehicle_services WHERE vehicle_id = ?
    ORDER BY service_date DESC, created_at DESC, id DESC LIMIT 1`, [vehicleId]);
  const totals = await db.getFirstAsync<{ total: number | null; missing: number }>(
    `SELECT ROUND(SUM(${totalSql}), 2) AS total,
    COALESCE(SUM(CASE WHEN parts_cost IS NULL AND labour_cost IS NULL AND other_cost IS NULL THEN 1 ELSE 0 END), 0) AS missing
    FROM vehicle_services WHERE vehicle_id = ?`, [vehicleId]);
  return { latest, total: totals?.total ?? null, missing: totals?.missing ?? 0 };
}
export function getServiceBills(db: SQLiteDatabase, vehicleId: number, serviceId: string) {
  return db.getAllAsync<ServiceBill>(`SELECT id, vehicle_id AS vehicleId, service_id AS serviceId,
    local_uri AS localUri, created_at AS createdAt FROM service_bill_photos
    WHERE vehicle_id = ? AND service_id = ? ORDER BY created_at, id`, [vehicleId, serviceId]);
}

// Like vehicle deletion, use a private connection with foreign keys enabled BEFORE BEGIN.
async function transaction(db: SQLiteDatabase, action: (tx: SQLiteDatabase) => Promise<void>) {
  const slash = db.databasePath.lastIndexOf('/');
  const tx = await openDatabaseAsync(db.databasePath.slice(slash + 1),
    { ...db.options, useNewConnection: true }, db.databasePath.slice(0, slash));
  try {
    await tx.execAsync('PRAGMA foreign_keys = ON;');
    await tx.withTransactionAsync(() => action(tx));
  } finally { await tx.closeAsync(); }
}
export async function insertService(db: SQLiteDatabase, vehicleId: number, id: string, draft: ServiceDraft, bills: ServiceBill[]) {
  await transaction(db, async (tx) => {
    const now = new Date().toISOString();
    await tx.runAsync(`INSERT INTO vehicle_services (id, vehicle_id, service_date, odometer, title, workshop,
      description, parts_cost, labour_cost, other_cost, next_service_date, next_service_odometer, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, vehicleId, draft.serviceDate, draft.odometer, draft.title, draft.workshop, draft.description,
      draft.partsCost, draft.labourCost, draft.otherCost, draft.nextServiceDate, draft.nextServiceOdometer, draft.notes, now, now]);
    for (const bill of bills) {
      if (bill.vehicleId !== vehicleId || bill.serviceId !== id) throw new Error('Invalid bill owner.');
      await tx.runAsync(`INSERT INTO service_bill_photos (id, vehicle_id, service_id, local_uri, created_at) VALUES (?, ?, ?, ?, ?)`,
        [bill.id, vehicleId, id, bill.localUri, bill.createdAt]);
    }
    await clearServiceCleanup(tx, vehicleId, id);
  });
}
export async function deleteServiceRecord(db: SQLiteDatabase, vehicleId: number, serviceId: string) {
  // The trigger queues cleanup in the same transaction; FK cascades remove only this service's bills.
  await transaction(db, async (tx) => {
    await tx.runAsync('DELETE FROM vehicle_services WHERE vehicle_id = ? AND id = ?', [vehicleId, serviceId]);
  });
}
export async function queueServiceCleanup(db: SQLiteDatabase, vehicleId: number, serviceId: string) {
  await db.runAsync('INSERT INTO service_bill_cleanup (vehicle_id, service_id, created_at) VALUES (?, ?, ?)',
    [vehicleId, serviceId, new Date().toISOString()]);
}
export function getServiceCleanup(db: SQLiteDatabase, vehicleId?: number) {
  return db.getAllAsync<{ vehicleId: number; serviceId: string }>(
    `SELECT vehicle_id AS vehicleId, service_id AS serviceId FROM service_bill_cleanup ${vehicleId == null ? '' : 'WHERE vehicle_id = ?'}`,
    vehicleId == null ? [] : [vehicleId]);
}
export async function clearServiceCleanup(db: SQLiteDatabase, vehicleId: number, serviceId: string) {
  await db.runAsync('DELETE FROM service_bill_cleanup WHERE vehicle_id = ? AND service_id = ?', [vehicleId, serviceId]);
}
