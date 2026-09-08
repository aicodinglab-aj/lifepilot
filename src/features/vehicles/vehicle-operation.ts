const activeVehicles = new Set<number>();

// Covers asynchronous photo copies even if the user navigates away mid-save.
export async function withVehicleOperation<T>(vehicleId: number, action: () => Promise<T>): Promise<T> {
  if (activeVehicles.has(vehicleId)) throw new Error('This vehicle has an operation in progress. Please wait and try again.');
  activeVehicles.add(vehicleId);
  try { return await action(); }
  finally { activeVehicles.delete(vehicleId); }
}
