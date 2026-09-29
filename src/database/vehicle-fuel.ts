import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { withVehicleOperation } from '@/features/vehicles/vehicle-operation';
import type { OperationContext } from '@/features/activity/operation-lifecycle';
import { localToday, monthRange, validDate } from '@/features/personal/date';
import { integerMoney } from '@/features/personal/money';
import { FUEL_PAGE_SIZE, fuelQuantity, requireFuelId, validateFuelForVehicle, validateFuelInput,
  type ChargingLocation, type FuelDraft, type FuelEntry, type FuelInput, type RefuelFuel } from '@/features/vehicles/fuel-entry';
import { createFuelEfficiencyScanner, ratio, type ExactRatio, type FuelEfficiency } from '@/features/vehicles/fuel-calculations';

type FuelRow = {
  id: number; vehicleId: number; kind: 'refuel' | 'charge'; date: string; odometerMetres: number;
  costPaise: number; quantityMilli: number; unitPricePaise: number | null; fuelType: RefuelFuel | null;
  fullTank: number | null; chargeBeforePercent: number | null; chargeAfterPercent: number | null;
  chargingLocation: ChargingLocation | null; location: string | null; notes: string | null; createdAt: string; updatedAt: string;
};
const columns = `id, vehicle_id AS vehicleId, kind, entry_date AS date, odometer_metres AS odometerMetres,
  cost_paise AS costPaise, quantity_milli AS quantityMilli, unit_price_paise AS unitPricePaise,
  fuel_type AS fuelType, full_tank AS fullTank, charge_before AS chargeBeforePercent, charge_after AS chargeAfterPercent,
  charging_location AS chargingLocation, location, notes, created_at AS createdAt, updated_at AS updatedAt`;
function fromRow(row: FuelRow): FuelEntry {
  const common = { id: row.id, vehicleId: row.vehicleId, date: row.date, odometerMetres: row.odometerMetres,
    costPaise: row.costPaise, location: row.location, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt };
  if (row.kind === 'charge') return { ...common, kind: 'charge', energyMilliKwh: row.quantityMilli,
    pricePerKwhPaise: row.unitPricePaise, chargeBeforePercent: row.chargeBeforePercent,
    chargeAfterPercent: row.chargeAfterPercent, chargingLocation: row.chargingLocation };
  if (!row.fuelType || row.fullTank === null) throw new Error('Invalid refuelling record.');
  return { ...common, kind: 'refuel', fuelType: row.fuelType, quantityMilliUnits: row.quantityMilli,
    pricePerUnitPaise: row.unitPricePaise, fullTank: row.fullTank === 1 };
}
async function vehicle(db: SQLiteDatabase, vehicleId: number) {
  requireFuelId(vehicleId);
  const row = await db.getFirstAsync<{ fuelType: string }>('SELECT fuel_type AS fuelType FROM vehicles WHERE id = ?', [vehicleId]);
  if (!row) throw new Error('This vehicle no longer exists.');
  return row;
}
function values(draft: FuelDraft) {
  return [draft.kind, draft.date, draft.odometerMetres, draft.costPaise, fuelQuantity(draft),
    draft.kind === 'refuel' ? draft.pricePerUnitPaise : draft.pricePerKwhPaise,
    draft.kind === 'refuel' ? draft.fuelType : null, draft.kind === 'refuel' ? Number(draft.fullTank) : null,
    draft.kind === 'charge' ? draft.chargeBeforePercent : null, draft.kind === 'charge' ? draft.chargeAfterPercent : null,
    draft.kind === 'charge' ? draft.chargingLocation : null, draft.location, draft.notes];
}

// Match service/coverage isolation: configure the private connection's FK pragma
// BEFORE BEGIN. The caller's vehicle lease covers open, transaction and close.
async function transaction<T>(db: SQLiteDatabase, action: (tx: SQLiteDatabase) => Promise<T>): Promise<T> {
  const slash = db.databasePath.lastIndexOf('/');
  const tx = await openDatabaseAsync(db.databasePath.slice(slash + 1),
    { ...db.options, useNewConnection: true }, db.databasePath.slice(0, slash));
  try {
    await tx.execAsync('PRAGMA foreign_keys = ON;');
    let result: { value: T } | undefined;
    await tx.withTransactionAsync(async () => { result = { value: await action(tx) }; });
    if (!result) throw new Error('Fuel transaction did not finish.');
    return result.value;
  } finally { await tx.closeAsync(); }
}
async function save(db: SQLiteDatabase, vehicleId: number, input: FuelInput, id: number | undefined, context?: OperationContext) {
  return withVehicleOperation(vehicleId, async () => {
    requireFuelId(vehicleId);
    if (id !== undefined) requireFuelId(id);
    const draft = validateFuelInput(input), now = new Date().toISOString();
    return transaction(db, async tx => {
      validateFuelForVehicle(draft, (await vehicle(tx, vehicleId)).fuelType);
      let savedId = id;
      if (id === undefined) {
        const inserted = await tx.runAsync(`INSERT INTO vehicle_fuel_entries
          (kind, entry_date, odometer_metres, cost_paise, quantity_milli, unit_price_paise, fuel_type, full_tank,
           charge_before, charge_after, charging_location, location, notes, vehicle_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...values(draft), vehicleId, now, now]);
        savedId = inserted.lastInsertRowId;
      } else {
        const updated = await tx.runAsync(`UPDATE vehicle_fuel_entries SET kind = ?, entry_date = ?, odometer_metres = ?,
          cost_paise = ?, quantity_milli = ?, unit_price_paise = ?, fuel_type = ?, full_tank = ?, charge_before = ?,
          charge_after = ?, charging_location = ?, location = ?, notes = ?, updated_at = ? WHERE vehicle_id = ? AND id = ?`,
        [...values(draft), now, vehicleId, id]);
        if (!updated.changes) throw new Error('This entry no longer exists for this vehicle.');
      }
      // A historical/lower reading and entry deletion never rewind the odometer.
      await tx.runAsync(`UPDATE vehicles SET odometer_km = ?, updated_at = ? WHERE id = ? AND odometer_km < ?`,
        [draft.odometerMetres / 1000, now, vehicleId, draft.odometerMetres / 1000]);
      if (savedId === undefined) throw new Error('Fuel entry was not saved.');
      return savedId;
    });
  }, context);
}
export function createFuelEntry(db: SQLiteDatabase, vehicleId: number, input: FuelInput, context?: OperationContext) {
  return save(db, vehicleId, input, undefined, context);
}
export function updateFuelEntry(db: SQLiteDatabase, vehicleId: number, id: number, input: FuelInput, context?: OperationContext) {
  return save(db, vehicleId, input, id, context);
}
export function deleteFuelEntry(db: SQLiteDatabase, vehicleId: number, id: number, context?: OperationContext) {
  return withVehicleOperation(vehicleId, async () => {
    requireFuelId(vehicleId); requireFuelId(id);
    return transaction(db, async tx => {
      const deleted = await tx.runAsync('DELETE FROM vehicle_fuel_entries WHERE vehicle_id = ? AND id = ?', [vehicleId, id]);
      if (!deleted.changes) throw new Error('This entry no longer exists for this vehicle.');
    });
  }, context);
}
export async function getFuelEntry(db: SQLiteDatabase, vehicleId: number, id: number): Promise<FuelEntry | null> {
  requireFuelId(vehicleId); requireFuelId(id);
  const row = await db.getFirstAsync<FuelRow>(`SELECT ${columns} FROM vehicle_fuel_entries WHERE vehicle_id = ? AND id = ?`, [vehicleId, id]);
  return row ? fromRow(row) : null;
}
export type FuelCursor = Pick<FuelEntry, 'vehicleId' | 'date' | 'id'>;
export async function getFuelHistory(db: SQLiteDatabase, vehicleId: number, cursor?: FuelCursor, limit = FUEL_PAGE_SIZE) {
  requireFuelId(vehicleId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid history page size.');
  if (cursor) {
    requireFuelId(cursor.id);
    if (cursor.vehicleId !== vehicleId || !validDate(cursor.date)) throw new Error('Invalid vehicle history cursor.');
  }
  const rows = await db.getAllAsync<FuelRow>(`SELECT ${columns} FROM vehicle_fuel_entries WHERE vehicle_id = ?
    ${cursor ? 'AND (entry_date, id) < (?, ?)' : ''} ORDER BY entry_date DESC, id DESC LIMIT ?`,
  cursor ? [vehicleId, cursor.date, cursor.id, limit + 1] : [vehicleId, limit + 1]);
  const entries = rows.slice(0, limit).map(fromRow), last = entries[entries.length - 1];
  const nextCursor: FuelCursor | null = rows.length > limit && last ? { vehicleId, date: last.date, id: last.id } : null;
  return { entries, nextCursor };
}

export type FuelTotals = {
  kind: 'refuel' | 'charge'; fuelType: RefuelFuel | null; unit: 'L' | 'kg' | 'kWh';
  entryCount: number; spendPaise: string; quantityMilli: string; averagePricePaisePerUnit: ExactRatio | null;
};
export async function getFuelSummary(db: SQLiteDatabase, vehicleId: number, month = localToday().slice(0, 7)) {
  const { fuelType } = await vehicle(db, vehicleId), range = monthRange(month);
  const groups = await db.getAllAsync<{ kind: 'refuel' | 'charge'; fuelType: RefuelFuel | null;
    count: number; spend: string; quantity: string; monthlySpend: string }>(`
    SELECT kind, fuel_type AS fuelType, COUNT(*) AS count, CAST(SUM(cost_paise) AS TEXT) AS spend,
      CAST(SUM(quantity_milli) AS TEXT) AS quantity,
      CAST(SUM(CASE WHEN entry_date BETWEEN ? AND ? THEN cost_paise ELSE 0 END) AS TEXT) AS monthlySpend
    FROM vehicle_fuel_entries WHERE vehicle_id = ? GROUP BY kind, fuel_type`, [range.start, range.end, vehicleId]);
  const totals: FuelTotals[] = groups.map(group => ({ kind: group.kind, fuelType: group.fuelType,
    unit: group.kind === 'charge' ? 'kWh' : group.fuelType === 'CNG' ? 'kg' : 'L', entryCount: group.count,
    spendPaise: integerMoney(group.spend), quantityMilli: integerMoney(group.quantity),
    averagePricePaisePerUnit: ratio(BigInt(group.spend) * BigInt(1000), BigInt(group.quantity)) }));
  const scanner = createFuelEfficiencyScanner(fuelType);
  let latestEfficiency: FuelEfficiency | null = null, cursor: FuelCursor | undefined;
  let page = await getFuelHistory(db, vehicleId);
  const recentEntries = page.entries.slice(0, 5);
  // Bounded memory, indexed pages, only this vehicle. Stop at the newest valid
  // full-to-full interval; Hybrid/Other cannot attribute mileage to one source.
  if (['Petrol', 'Diesel', 'CNG', 'Electric'].includes(fuelType)) {
    do {
      for (const entry of page.entries) { latestEfficiency = scanner.push(entry); if (latestEfficiency) break; }
      cursor = page.nextCursor ?? undefined;
      if (!latestEfficiency && cursor) page = await getFuelHistory(db, vehicleId, cursor);
    } while (!latestEfficiency && cursor);
  }
  return { month, entryCount: groups.reduce((sum, group) => sum + group.count, 0),
    totalSpendPaise: groups.reduce((sum, group) => sum + BigInt(group.spend), BigInt(0)).toString(),
    monthSpendPaise: groups.reduce((sum, group) => sum + BigInt(group.monthlySpend), BigInt(0)).toString(),
    totals, recentEntries, latestEfficiency, costPaisePerKm: latestEfficiency?.costPaisePerKm ?? null };
}
