import type { SQLiteDatabase } from 'expo-sqlite';
import { updateVehicle } from '@/database/vehicles';
import { detailsFormToVehicle, validateVehicleDetails, type VehicleDetailsForm } from './vehicle-details';
import { withVehicleOperation } from './vehicle-operation';

export async function saveVehicleDetails(db: SQLiteDatabase, vehicleId: number, form: VehicleDetailsForm) {
  const errors = validateVehicleDetails(form);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  await withVehicleOperation(vehicleId, () => updateVehicle(db, vehicleId, detailsFormToVehicle(form)));
}
