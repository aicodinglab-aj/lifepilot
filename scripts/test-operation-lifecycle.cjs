const assert = require('node:assert/strict');
const { createLoader } = require('./helpers/load-typescript.cjs');
let checks = 0;
process.on('beforeExit', () => { if (checks !== 12) { console.error('FAIL: lifecycle tests did not finish'); process.exitCode = 1; } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function test(name, action) { await action(); checks++; console.log(`PASS: ${name}`); }

async function main() {
  await test('synchronous admission closure, drain, shared cleanup, exactly-once release and exclusive token', async () => {
    const { createActivityCoordinator } = createLoader()('src/features/activity/operation-lifecycle.ts');
    const c = createActivityCoordinator(), states = [];
    c.subscribe(() => states.push(c.getState()));
    const lease = c.acquire();
    const pending = c.suspend();
    assert.equal(c.getState(), 'suspending');
    assert.throws(() => c.acquire());
    let exclusive = false; pending.then(() => { exclusive = true; });
    await Promise.resolve(); assert.equal(exclusive, false);
    const cleanup = c.acquire(lease.context);
    lease.release(); lease.release();
    assert.equal(c.getActiveCount(), 1);
    await Promise.resolve(); assert.equal(exclusive, false);
    cleanup.release();
    const owner = await pending;
    c.assertExclusive(owner.authorization);
    assert.throws(() => c.assertExclusive({ dataAccessSuspended: true }));
    assert.throws(() => c.acquire());
    assert.throws(() => c.acquire(lease.context));
    owner.resume();
    assert.throws(() => c.assertExclusive(owner.authorization));
    assert.deepEqual(states, ['suspending', 'exclusive', 'resuming', 'normal']);
    await assert.rejects(c.run(async () => { throw Error('failure'); }));
    assert.equal(c.getActiveCount(), 0);
    const retained = await c.suspend(); retained.retain();
    assert.throws(() => retained.resume());
  });

  async function delaysRestore(relative, call, setup = {}) {
    const entered = deferred(), finish = deferred();
    const events = [];
    const db = {
      runAsync: async () => { events.push('write'); entered.resolve(); await finish.promise; return { changes: 1, lastInsertRowId: 1 }; },
      getAllAsync: async () => [{ id: 'food', type: 'expense' }],
      ...setup,
    };
    const load = createLoader();
    const activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const operation = call(load(relative), db);
    await entered.promise;
    const maintenance = activity.suspend().then(owner => { events.push('exclusive'); return owner; });
    await Promise.resolve(); assert.deepEqual(events, ['write']);
    await assert.rejects(call(load(relative), db), /maintenance/);
    finish.resolve(); await operation;
    const owner = await maintenance; assert.deepEqual(events, ['write', 'exclusive']); owner.resume();
  }
  await test('vehicle repository write delays exclusive restore', () => delaysRestore('src/database/vehicles.ts',
    (r, db) => r.insertVehicle(db, { vehicleType: 'Car', registrationNumber: 'A', make: 'A', model: 'A', modelYear: 2020, fuelType: 'Petrol', odometerKm: 1 })));
  await test('Personal Expense validation + write delays exclusive restore', () => delaysRestore('src/database/personal.ts',
    (r, db) => r.saveTransaction(db, { type: 'expense', amount: '1', categoryId: 'food', transactionDate: '2026-09-28', description: '', paymentMethod: '', notes: '' })));
  await test('Task completion write delays exclusive restore', () => delaysRestore('src/database/tasks.ts', (r, db) => r.completeTask(db, 1, true)));

  await test('vehicle creation keeps its lease across insertion, nested photo workflow and error cleanup', async () => {
    const entered = deferred(), finish = deferred(), events = [];
    const mocks = {
      './photo-service': {
        safePhotoError: error => error instanceof Error ? error.message : 'photo error',
        saveSelectedVehiclePhotos: async (_db, _id, _photos, _cover, context) => {
          await activity.run(async () => { events.push('photo'); throw Error('copy failure'); }, context);
        }
      },
    };
    const load = createLoader(mocks), activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const create = load('src/features/vehicles/create-vehicle.ts').createVehicleWithPhotos;
    const db = { runAsync: async () => { entered.resolve(); await finish.promise; return { lastInsertRowId: 4 }; } };
    const task = create(db, {}, [], undefined);
    await entered.promise; const maintenance = activity.suspend(); finish.resolve();
    const result = await task;
    assert.equal(result.vehicleId, 4); assert.equal(result.photoError, 'copy failure');
    const owner = await maintenance; assert.deepEqual(events, ['photo']); owner.resume();
  });

  await test('private deletion connection, close and filesystem cleanup all precede drain', async () => {
    const opened = deferred(), finishTransaction = deferred(), closing = deferred(), finishClose = deferred();
    const cleaning = deferred(), finishCleanup = deferred(), events = [];
    const load = createLoader({
      'expo-sqlite': {
        openDatabaseAsync: async () => ({
          execAsync: async () => { }, runAsync: async () => { },
          withTransactionAsync: async action => { opened.resolve(); await finishTransaction.promise; await action(); },
          closeAsync: async () => { events.push('close'); closing.resolve(); await finishClose.promise; },
        })
      },
      '@/storage/vehicle-photos': { deleteVehiclePhotoDirectory: async () => { events.push('cleanup'); cleaning.resolve(); await finishCleanup.promise; } },
    });
    const activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const db = {
      databasePath: '/private/lifepilot.db', options: {}, getFirstAsync: async sql => sql.includes('vehicle_deletion_cleanup') ? { vehicle_id: 1 } : null,
      runAsync: async () => { events.push('cleanup-row'); }
    };
    const deletion = load('src/features/vehicles/delete-vehicle.ts').deleteVehicle(db, 1);
    await opened.promise; let exclusive = false;
    const maintenance = activity.suspend().then(o => { exclusive = true; return o; });
    finishTransaction.resolve(); await closing.promise; assert.equal(exclusive, false);
    finishClose.resolve(); await cleaning.promise; assert.equal(exclusive, false);
    finishCleanup.resolve(); await deletion; const owner = await maintenance;
    assert.deepEqual(events, ['close', 'cleanup', 'cleanup-row']); owner.resume();
  });

  await test('running task reconciliation drains; queued passes cannot start after suspension or resume', async () => {
    const entered = deferred(), finish = deferred(); let schedules = 0;
    const load = createLoader(), activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const reconcile = load('src/features/tasks/task-notifications.ts').reconcileTaskNotifications;
    const native = { permission: async () => { entered.resolve(); await finish.promise; return 'denied'; }, scheduled: async () => { schedules++; return []; }, capacity: 20 };
    const db = {};
    const running = reconcile(db, native); await entered.promise;
    const queued = reconcile(db, native);
    const maintenance = activity.suspend();
    await reconcile(db, native); assert.equal(schedules, 1);
    finish.resolve(); const owner = await maintenance; owner.resume();
    await Promise.all([running, queued]); assert.equal(schedules, 1);
  });

  await test('vehicle reconciliation continues metadata cleanup under its admitted lease', async () => {
    const entered = deferred(), finish = deferred(); let writes = 0;
    const load = createLoader(), activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const db = {
      getFirstAsync: async sql => sql.includes('revision') ? { revision: 1 } : { notificationsEnabled: 0 },
      getAllAsync: async sql => sql.includes('FROM vehicle_reminder_schedule') ? [{ notificationId: 'old', fingerprint: 'stale' }] : [],
      runAsync: async () => { writes++; },
    };
    const native = { capacity: 20, permission: async () => { entered.resolve(); await finish.promise; return 'denied'; }, scheduled: async () => [] };
    const running = load('src/features/reminders/reconcile.ts').reconcileReminders(db, native);
    await entered.promise; const maintenance = activity.suspend(); finish.resolve();
    await running; const owner = await maintenance; assert.equal(writes, 1); owner.resume();
  });

  await test('failed parallel inventory read still drains the native permission/channel continuation', async () => {
    const entered = deferred(), finish = deferred();
    const load = createLoader(), activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const running = load('src/features/tasks/task-notifications.ts').reconcileTaskNotifications({}, {
      capacity: 20,
      permission: async () => { entered.resolve(); await finish.promise; return 'denied'; },
      scheduled: async () => { throw Error('inventory unavailable'); },
    });
    await entered.promise; let exclusive = false;
    const maintenance = activity.suspend().then(o => { exclusive = true; return o; });
    await Promise.resolve(); await Promise.resolve(); assert.equal(exclusive, false);
    finish.resolve(); await running; const owner = await maintenance; owner.resume();
  });

  await test('permission continuation writes with parent ownership after suspension', async () => {
    const entered = deferred(), finish = deferred(); let wrote = false, requested = false;
    const load = createLoader(), activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const db = { getFirstAsync: async () => ({ permissionRequested: 0 }), runAsync: async () => { wrote = true; } };
    const pending = load('src/features/reminders/permission.ts').requestReminderPermissionOnce(db,
      async () => { entered.resolve(); await finish.promise; return 'undetermined'; },
      context => activity.run(async () => { requested = true; return 'granted'; }, context));
    await entered.promise; const maintenance = activity.suspend(); finish.resolve(); await pending;
    const owner = await maintenance; assert.equal(wrote && requested, true); owner.resume();
  });
  await test('all domain mutation entry points refuse admission before validation, SQL or file access', async () => {
    const load = createLoader({ 'expo-sqlite': {}, 'expo-crypto': {}, 'expo-image-picker': {}, 'expo-file-system': {}, 'react-native': {} });
    const activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const boundaries = {
      'src/database/vehicles.ts': ['insertVehicle', 'updateVehicle'],
      'src/database/personal.ts': ['saveTransaction', 'deleteTransaction'],
      'src/database/tasks.ts': ['saveTask', 'completeTask', 'deleteTask'],
      'src/database/reminders.ts': ['setReminderInterval', 'setReminderPreferences', 'markPermissionRequested', 'removeScheduledReminder', 'persistPlannedReminder', 'queueNotificationCleanup', 'clearNotificationCleanup'],
      'src/database/vehicle-photos.ts': ['insertPhoto', 'setCoverPhoto', 'deletePhotoRecord'],
      'src/database/vehicle-services.ts': ['insertService', 'deleteServiceRecord', 'queueServiceCleanup', 'clearServiceCleanup'],
      'src/database/vehicle-coverage.ts': ['writeCoverage', 'deleteCoverageRecord', 'queueCoverageCleanup', 'clearCoverageCleanup'],
      'src/features/vehicles/create-vehicle.ts': ['createVehicleWithPhotos'],
      'src/features/vehicles/details-service.ts': ['saveVehicleDetails'],
      'src/features/vehicles/photo-service.ts': ['addVehiclePhotos', 'addVehicleCoverPhoto', 'saveSelectedVehiclePhotos', 'chooseCover', 'removeVehiclePhoto'],
      'src/features/vehicles/delete-vehicle.ts': ['deleteVehicle', 'retryVehicleCleanup'],
      'src/features/vehicles/service-maintenance.ts': ['createService', 'deleteService', 'retryServiceCleanup'],
      'src/features/vehicles/coverage-service.ts': ['saveCoverage', 'deleteCoverage', 'retryCoverageCleanup'],
    };
    const owner = await activity.suspend();
    for (const [file, names] of Object.entries(boundaries)) {
      const module = load(file);
      for (const name of names) await assert.rejects(module[name](), /maintenance/, `${file}:${name}`);
    }
    owner.resume();
  });

  await test('an admitted service copy failure finishes file and SQLite cleanup before drain', async () => {
    const entered = deferred(), failCopy = deferred(), cleaning = deferred(), finishCleanup = deferred();
    const events = [];
    const load = createLoader({
      'expo-crypto': { randomUUID: () => 'id' },
      'expo-sqlite': {},
      '@/storage/service-bills': {
        validateServiceOwner() { },
        copyServiceBill: async () => { entered.resolve(); await failCopy.promise; throw Error('copy failed'); },
        deleteServiceBillDirectory: async () => { cleaning.resolve(); await finishCleanup.promise; events.push('files-cleaned'); },
      },
      './service-record': { serviceFormToDraft: () => ({}) },
    });
    const activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const db = {
      getFirstAsync: async sql => sql.includes('SELECT id FROM vehicles') ? { id: 1 } : null,
      runAsync: async sql => { if (sql.startsWith('DELETE')) events.push('cleanup-row'); }
    };
    const pending = load('src/features/vehicles/service-maintenance.ts').createService(db, 1, {}, [{ uri: 'photo' }]);
    const rejected = assert.rejects(pending, /copy failed/);
    await entered.promise; let exclusive = false;
    const maintenance = activity.suspend().then(o => { exclusive = true; return o; });
    failCopy.resolve(); await cleaning.promise; assert.equal(exclusive, false);
    finishCleanup.resolve(); await rejected; const owner = await maintenance;
    assert.deepEqual(events, ['files-cleaned', 'cleanup-row']); owner.resume();
  });
  console.log(`PASS: ${checks} operation lifecycle and cross-domain race scenarios.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
