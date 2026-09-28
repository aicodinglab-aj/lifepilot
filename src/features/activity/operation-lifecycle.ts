// Process-local mutation ownership. Reads and the device-local appearance store
// are outside this contract. See docs/BACKUP_FORMAT.md for integration rules.
const operationBrand = Symbol('operation');
const exclusiveBrand = Symbol('exclusive');
export type OperationContext = { readonly [operationBrand]: true };
export type MaintenanceAuthorization = {
  readonly [exclusiveBrand]: true;
  readonly dataAccessSuspended: true;
};
export type ActivityState = 'normal' | 'suspending' | 'exclusive' | 'resuming';

export class OperationSuspendedError extends Error {
  constructor() { super('LifePilot maintenance is in progress. Please wait.'); }
}

export function createActivityCoordinator() {
  let state: ActivityState = 'normal';
  let active = 0;
  let drained: (() => void) | undefined;
  let authorization: MaintenanceAuthorization | undefined;
  let retained = false;
  let generation = 0;
  const contexts = new WeakMap<OperationContext, number>();
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) {
      try { listener(); } catch { /* Observers cannot interrupt ownership. */ }
    }
  };
  function acquire(parent?: OperationContext) {
    if (parent ? !contexts.get(parent) : state !== 'normal') throw new OperationSuspendedError();
    const context: OperationContext = parent ?? Object.freeze({ [operationBrand]: true });
    contexts.set(context, (contexts.get(context) ?? 0) + 1);
    active++;
    let released = false;
    return { context, release() {
      if (released) return;
      released = true;
      const remaining = (contexts.get(context) ?? 1) - 1;
      if (remaining) contexts.set(context, remaining); else contexts.delete(context);
      active--;
      if (active === 0) { drained?.(); drained = undefined; }
    } };
  }
  async function run<T>(action: (context: OperationContext) => Promise<T>, parent?: OperationContext): Promise<T> {
    const lease = acquire(parent);
    try { return await action(lease.context); }
    finally { lease.release(); }
  }
  // Calling this function closes admission BEFORE it returns its promise.
  function suspend() {
    if (state !== 'normal') throw new OperationSuspendedError();
    state = 'suspending';
    generation++;
    const wait = active === 0 ? Promise.resolve() : new Promise<void>((resolve) => { drained = resolve; });
    publish();
    return wait.then(() => {
      state = 'exclusive';
      const token: MaintenanceAuthorization = Object.freeze({ [exclusiveBrand]: true as const, dataAccessSuspended: true as const });
      authorization = token;
      publish();
      return {
        authorization: token,
        resume() {
          if (authorization !== token || retained) throw new Error('Maintenance ownership cannot be released.');
          authorization = undefined;
          state = 'resuming'; publish();
          state = 'normal'; publish();
        },
        retain() {
          if (authorization !== token) throw new Error('Maintenance ownership has ended.');
          retained = true;
        },
      };
    });
  }
  return {
    acquire, run, suspend,
    getState: () => state,
    getActiveCount: () => active,
    getGeneration: () => generation,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    assertExclusive(token: MaintenanceAuthorization) {
      if (state !== 'exclusive' || active !== 0 || token !== authorization) {
        throw new Error('Restore requires exclusive maintenance ownership.');
      }
    },
  };
}

export const applicationActivity = createActivityCoordinator();
export const withOperation = applicationActivity.run;
