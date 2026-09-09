import type { SQLiteDatabase } from 'expo-sqlite';

import type { NewVehicle, Vehicle, VehicleInformation } from '@/features/vehicles/vehicle';

type VehicleRow = {
  id: number;
  vehicle_type: string;
  registration_number: string;
  make: string;
  model: string;
  variant: string | null;
  model_year: number;
  fuel_type: string;
  odometer_km: number;
  created_at: string;
  updated_at: string;
  cover_photo_id: string | null;
  cover_photo_uri: string | null;
  chassis_number: string | null;
  engine_number: string | null;
  engine_capacity: number | null;
  transmission: string | null;
  color: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  dealer: string | null;
  warranty_valid_until: string | null;
  notes: string | null;
};

export class DuplicateRegistrationError extends Error {
  constructor() {
    super('A vehicle with this registration number already exists.');
    this.name = 'DuplicateRegistrationError';
  }
}

export async function insertVehicle(db: SQLiteDatabase, vehicle: NewVehicle) {
  const timestamp = new Date().toISOString();

  try {
    const result = await db.runAsync(
      `INSERT INTO vehicles (
        vehicle_type,
        registration_number,
        make,
        model,
        variant,
        model_year,
        fuel_type,
        odometer_km,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicle.vehicleType,
        vehicle.registrationNumber,
        vehicle.make,
        vehicle.model,
        vehicle.variant,
        vehicle.modelYear,
        vehicle.fuelType,
        vehicle.odometerKm,
        timestamp,
        timestamp,
      ],
    );
    return result.lastInsertRowId;
  } catch (error) {
    if (error instanceof Error && /unique constraint failed/i.test(error.message)) {
      throw new DuplicateRegistrationError();
    }

    throw error;
  }
}

export async function getVehicles(db: SQLiteDatabase, vehicleId?: number): Promise<Vehicle[]> {
  const rows = await db.getAllAsync<VehicleRow>(
    `SELECT
      id,
      vehicle_type,
      registration_number,
      make,
      model,
      variant,
      model_year,
      fuel_type,
      odometer_km,
      created_at,
      updated_at,
      chassis_number, engine_number, engine_capacity, transmission, color,
      purchase_date, purchase_price, dealer, warranty_valid_until, notes,
      (SELECT id FROM vehicle_photos WHERE vehicle_id = vehicles.id AND is_cover = 1) AS cover_photo_id,
      (SELECT local_uri FROM vehicle_photos WHERE vehicle_id = vehicles.id AND is_cover = 1) AS cover_photo_uri
    FROM vehicles
    WHERE (? IS NULL OR id = ?)
    ORDER BY created_at DESC, id DESC`,
    [vehicleId ?? null, vehicleId ?? null],
  );

  return rows.map((row) => ({
    id: row.id,
    vehicleType: row.vehicle_type,
    registrationNumber: row.registration_number,
    make: row.make,
    model: row.model,
    variant: row.variant,
    modelYear: row.model_year,
    fuelType: row.fuel_type,
    odometerKm: row.odometer_km,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    coverPhotoId: row.cover_photo_id,
    coverPhotoUri: row.cover_photo_uri,
    chassisNumber: row.chassis_number,
    engineNumber: row.engine_number,
    engineCapacity: row.engine_capacity,
    transmission: row.transmission,
    color: row.color,
    purchaseDate: row.purchase_date,
    purchasePrice: row.purchase_price,
    dealer: row.dealer,
    warrantyValidUntil: row.warranty_valid_until,
    notes: row.notes,
  }));
}

export async function updateVehicle(db: SQLiteDatabase, vehicleId: number,
  vehicle: Omit<NewVehicle, 'vehicleType'> & VehicleInformation) {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) throw new Error('Invalid vehicle.');
  try {
    const result = await db.runAsync(`UPDATE vehicles SET
      make = ?, model = ?, variant = ?, model_year = ?, registration_number = ?,
      fuel_type = ?, odometer_km = ?, chassis_number = ?, engine_number = ?,
      engine_capacity = ?, transmission = ?, color = ?, purchase_date = ?,
      purchase_price = ?, dealer = ?, warranty_valid_until = ?, notes = ?, updated_at = ?
      WHERE id = ?`, [vehicle.make, vehicle.model, vehicle.variant, vehicle.modelYear,
      vehicle.registrationNumber, vehicle.fuelType, vehicle.odometerKm, vehicle.chassisNumber,
      vehicle.engineNumber, vehicle.engineCapacity, vehicle.transmission, vehicle.color,
      vehicle.purchaseDate, vehicle.purchasePrice, vehicle.dealer, vehicle.warrantyValidUntil,
      vehicle.notes, new Date().toISOString(), vehicleId]);
    if (result.changes !== 1) throw new Error('This vehicle no longer exists.');
  } catch (error) {
    if (error instanceof Error && /unique constraint failed/i.test(error.message)) {
      throw new DuplicateRegistrationError();
    }
    throw error;
  }
}
