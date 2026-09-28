import { applicationActivity, type MaintenanceAuthorization } from '@/features/activity/operation-lifecycle';
import { RollbackFailureError, type RestoreResult } from './restore-service';

export type RestoreState = 'idle' | 'suspending' | 'restoring' | 'success' | 'recovery';
export const restoreBlocksNavigation = (state: RestoreState) => state !== 'idle';

// Test ownership/outcomes with real operations independently of rendering.
export function createRestoreSession() {
  let state: RestoreState = 'idle';
  let lastError: string | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: RestoreState) => {
    state = next;
    for (const listener of listeners) { try { listener(); } catch { /* Observers cannot change ownership. */ } }
  };
  return {
    getState: () => state,
    getError: () => lastError,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async run(restore: (authorization: MaintenanceAuthorization) => Promise<RestoreResult>) {
      if (state !== 'idle') throw new Error('Restore is already in progress.');
      const ownership = applicationActivity.suspend();
      lastError = null;
      publish('suspending');
      const owner = await ownership;
      publish('restoring');
      try {
        const result = await restore(owner.authorization);
        owner.retain(); publish('success');
        return result;
      } catch (error) {
        if (error instanceof RollbackFailureError) {
          owner.retain(); publish('recovery');
        } else {
          lastError = 'Restore did not complete. Your previous LifePilot data remains available.';
          owner.resume(); publish('idle');
        }
        throw error;
      }
    },
  };
}
