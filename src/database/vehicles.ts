import type { SQLiteDatabase } from 'expo-sqlite';

import type { NewVehicle, Vehicle } from '@/features/vehicles/vehicle';

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
    await db.runAsync(
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
  } catch (error) {
    if (error instanceof Error && /unique constraint failed/i.test(error.message)) {
      throw new DuplicateRegistrationError();
    }

    throw error;
  }
}

export async function getVehicles(db: SQLiteDatabase): Promise<Vehicle[]> {
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
      updated_at
    FROM vehicles
    ORDER BY created_at DESC, id DESC`,
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
  }));
}
