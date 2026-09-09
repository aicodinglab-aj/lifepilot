export const vehicleTypes = ['Car', 'Motorcycle', 'Scooter', 'Other'] as const;
export const fuelTypes = ['Petrol', 'Diesel', 'CNG', 'Hybrid', 'Electric', 'Other'] as const;

export type VehicleForm = {
  vehicleType: string;
  registrationNumber: string;
  make: string;
  model: string;
  variant: string;
  modelYear: string;
  fuelType: string;
  odometerKm: string;
};

export type VehicleFormErrors = Partial<Record<keyof VehicleForm, string>>;

export type NewVehicle = {
  vehicleType: string;
  registrationNumber: string;
  make: string;
  model: string;
  variant: string | null;
  modelYear: number;
  fuelType: string;
  odometerKm: number;
};

export type VehicleInformation = {
  chassisNumber: string | null;
  engineNumber: string | null;
  engineCapacity: number | null;
  transmission: string | null;
  color: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  dealer: string | null;
  warrantyValidUntil: string | null;
  notes: string | null;
};

export type Vehicle = NewVehicle & VehicleInformation & {
  id: number;
  createdAt: string;
  updatedAt: string;
  coverPhotoId: string | null;
  coverPhotoUri: string | null;
};

export const initialVehicleForm: VehicleForm = {
  vehicleType: '',
  registrationNumber: '',
  make: '',
  model: '',
  variant: '',
  modelYear: '',
  fuelType: '',
  odometerKm: '',
};

export function validateVehicleForm(form: VehicleForm): VehicleFormErrors {
  const errors: VehicleFormErrors = {};
  const year = Number(form.modelYear);
  const maximumYear = new Date().getFullYear() + 1;
  const odometer = Number(form.odometerKm);

  if (!form.vehicleType) errors.vehicleType = 'Select a vehicle type.';
  if (!form.registrationNumber.trim()) errors.registrationNumber = 'Registration number is required.';
  if (!form.make.trim()) errors.make = 'Make is required.';
  if (!form.model.trim()) errors.model = 'Model is required.';

  if (!form.modelYear.trim()) {
    errors.modelYear = 'Model year is required.';
  } else if (!/^\d{4}$/.test(form.modelYear) || year < 1886 || year > maximumYear) {
    errors.modelYear = `Enter a valid year from 1886 to ${maximumYear}.`;
  }

  if (!form.fuelType) errors.fuelType = 'Select a fuel type.';

  if (!form.odometerKm.trim()) {
    errors.odometerKm = 'Current odometer is required.';
  } else if (!/^\d+(\.\d+)?$/.test(form.odometerKm) || !Number.isFinite(odometer) || odometer > Number.MAX_SAFE_INTEGER || odometer < 0) {
    errors.odometerKm = 'Enter a valid non-negative number.';
  }

  return errors;
}

export function vehicleFormToNewVehicle(form: VehicleForm): NewVehicle {
  const variant = form.variant.trim();

  return {
    vehicleType: form.vehicleType,
    registrationNumber: form.registrationNumber.trim().toUpperCase(),
    make: form.make.trim(),
    model: form.model.trim(),
    variant: variant || null,
    modelYear: Number(form.modelYear),
    fuelType: form.fuelType,
    odometerKm: Number(form.odometerKm),
  };
}
