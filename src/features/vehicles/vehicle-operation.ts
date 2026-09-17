const activeVehicles = new Set<number>();
const listeners = new Set<() => void>();

export function subscribeVehicleOperations(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Covers asynchronous photo copies even if the user navigates away mid-save.
export async function withVehicleOperation<T>(vehicleId: number, action: () => Promise<T>): Promise<T> {
  if (activeVehicles.has(vehicleId)) throw new Error('This vehicle has an operation in progress. Please wait and try again.');
  activeVehicles.add(vehicleId);
  try { return await action(); }
  finally {
    activeVehicles.delete(vehicleId);
    // Publish after commit/rollback, even when subsequent file cleanup failed.
    for (const listener of listeners) { try { listener(); } catch { /* Observers cannot fail a vehicle operation. */ } }
  }
}
