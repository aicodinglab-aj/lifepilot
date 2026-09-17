/* global __dirname, __filename */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
function load(relative, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Error, __DEV__: false, ...globals, require: (name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
function database(filename) {
  const raw = new DatabaseSync(filename);
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
    withTransactionAsync: async (fn) => {
      raw.exec('BEGIN');
      try { await fn(db); raw.exec('COMMIT'); }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  return { raw, db };
}
const dates = load('src/features/vehicles/coverage-status.ts');
const domain = load('src/features/reminders/reminder.ts', { '@/features/vehicles/coverage-status': dates });
function dateTests() {
  const day = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  for (const [offset, expected] of [[30, '2027-01-16'], [7, '2027-02-08'], [1, '2027-02-14'], [0, '2027-02-15']]) {
    const fire = domain.reminderFireDate('2027-02-15', offset);
    assert.equal(day(fire), expected); assert.equal(fire.getHours(), 9); assert.equal(fire.getMinutes(), 0);
  }
  for (const [due, offset, expected] of [['2027-01-01', 1, '2026-12-31'], ['2024-03-01', 1, '2024-02-29'],
    ['2026-03-09', 1, '2026-03-08'], ['2026-11-02', 1, '2026-11-01']]) {
    const fire = domain.reminderFireDate(due, offset); assert.equal(day(fire), expected); assert.equal(fire.getHours(), 9);
  }
  assert.equal(domain.reminderFireDate('2026-02-29', 0), null);
  assert.equal(domain.reminderFireDate('2027-01-01', -1), null);
  const offsets = { 'Asia/Kolkata': -330, 'America/Los_Angeles': 480, 'Pacific/Auckland': -780 };
  if (process.env.TZ in offsets) assert.equal(domain.reminderFireDate('2027-02-15', 30).getTimezoneOffset(), offsets[process.env.TZ]);
  if (process.env.TZ === 'America/Los_Angeles') assert.equal(domain.reminderFireDate('2026-03-09', 1).getTimezoneOffset(), 420);
  const source = { id: 'service:1:test', vehicleId: 1, sourceType: 'service', recordId: 'test', registration: 'TEST', dueDate: '2027-02-15', dueOdometer: null, odometer: 0 };
  const interval = [{ sourceType: 'service', offsetDays: 0, enabled: 1 }];
  assert.equal(domain.planNotifications([source], interval, new Date(2027, 1, 15, 8, 59, 59)).length, 1);
  assert.equal(domain.planNotifications([source], interval, new Date(2027, 1, 15, 9)).length, 0);
  assert.equal(domain.planNotifications([source], interval, new Date(2027, 1, 15, 10)).length, 0);
  assert.equal(domain.planNotifications([{ ...source, dueDate: null, dueOdometer: 1000 }], interval).length, 0);
}
async function debugNotificationTests() {
  const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, '../eas.json'), 'utf8')).build;
  for (const [variant, dev, expected] of [
    [profiles.preview.env.EXPO_PUBLIC_APP_VARIANT, false, true],
    [profiles.production.env.EXPO_PUBLIC_APP_VARIANT, false, false],
    ['production', true, false], [undefined, false, false], ['unknown', false, false], [undefined, true, true],
  ]) {
    const gate = load('src/features/reminders/test-build.ts', {}, { __DEV__: dev, process: { env: { EXPO_PUBLIC_APP_VARIANT: variant } } });
    assert.equal(gate.reminderTestEnabled, expected);
    const calls = [];
    let granted = true, blocked = false, fail = false;
    const native = {
      AndroidImportance: { DEFAULT: 3, NONE: 0 }, AndroidNotificationVisibility: { PRIVATE: 0 },
      SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
      setNotificationChannelAsync: async (id) => { calls.push(['channel', id]); },
      getPermissionsAsync: async () => { calls.push(['permission']); return { granted, status: 'denied' }; },
      getNotificationChannelAsync: async () => ({ importance: blocked ? 0 : 3 }),
      scheduleNotificationAsync: async (request) => { calls.push(['schedule', request]); if (fail) throw new Error('native scheduling failed'); return request.identifier; },
    };
    const api = load('src/features/reminders/notifications.ts', {
      'expo-notifications': native, 'react-native': { Platform: { OS: 'android' } }, './reminder': domain, './test-build': gate,
    });
    if (!expected) {
      await assert.rejects(api.scheduleDebugReminder(), /only available/);
      assert.equal(calls.length, 0);
      continue;
    }
    await api.scheduleDebugReminder();
    assert.deepEqual(calls.map((call) => call[0]), ['channel', 'permission', 'schedule']);
    const request = calls[2][1];
    assert.equal(request.trigger.seconds, 10); assert.equal(request.trigger.repeats, false);
    assert.equal(request.trigger.type, 'timeInterval'); assert.equal(request.trigger.channelId, api.REMINDER_CHANNEL);
    assert.equal(request.content.data.owner, api.TEST_NOTIFICATION_OWNER);
    granted = false; calls.length = 0;
    await assert.rejects(api.scheduleDebugReminder(), /Enable notifications/);
    assert.equal(calls.some((call) => call[0] === 'schedule'), false);
    granted = true; blocked = true;
    await assert.rejects(api.scheduleDebugReminder(), /channel/);
    blocked = false; fail = true;
    await assert.rejects(api.scheduleDebugReminder(), /native scheduling failed/);
  }
}
async function main() {
  dateTests();
  if (process.argv.includes('--dates-only')) return;
  await debugNotificationTests();
  for (const timezone of ['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland']) {
    execFileSync(process.execPath, [__filename, '--dates-only'], { env: { ...process.env, TZ: timezone }, stdio: 'pipe' });
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifepilot-reminders-'));
  const filename = path.join(root, 'test.sqlite');
  let { raw, db } = database(filename);
  const migration = load('src/database/migrate.ts');
  const migrations = [...fs.readFileSync(path.join(__dirname, '../src/database/migrate.ts'), 'utf8').matchAll(/await db\.execAsync\(`([\s\S]*?)`\)/g)];
  for (const step of migrations.slice(0, 6)) raw.exec(step[1]);
  for (const id of [1, 2]) raw.prepare(`INSERT INTO vehicles
    (id, vehicle_type, registration_number, make, model, model_year, fuel_type, odometer_km, created_at, updated_at)
    VALUES (?, 'Car', ?, 'Test', 'Model', 2020, 'Petrol', 9600, 'before', 'before')`).run(id, `TEST-${id}`);
  for (const id of [1, 2]) {
    raw.prepare(`INSERT INTO vehicle_insurance(id, vehicle_id, provider, policy_number, expiry_date, created_at, updated_at)
      VALUES (?, ?, 'Insurer', 'PRIVATE-POLICY', '2027-02-15', 'before', 'before')`).run(`insurance-${id}`, id);
    raw.prepare(`INSERT INTO vehicle_puc(id, vehicle_id, certificate_number, expiry_date, created_at, updated_at)
      VALUES (?, ?, 'PRIVATE-CERTIFICATE', '2027-02-15', 'before', 'before')`).run(`puc-${id}`, id);
    raw.prepare(`INSERT INTO vehicle_services(id, vehicle_id, service_date, odometer, title, next_service_date, next_service_odometer, created_at, updated_at)
      VALUES (?, ?, '2026-12-01', 9000, 'Private service details', '2027-02-15', 10000, 'before', 'before')`).run(`service-${id}`, id);
  }
  raw.exec(`INSERT INTO vehicle_photos VALUES ('gallery', 1, 'file:///gallery.jpg', 1, 'before');
    INSERT INTO service_bill_photos VALUES ('bill', 1, 'service-1', 'file:///bill.jpg', 'before');
    INSERT INTO insurance_documents VALUES ('policy-photo', 1, 'insurance-1', 'file:///policy.jpg', 'before');
    INSERT INTO puc_documents VALUES ('puc-photo', 1, 'puc-1', 'file:///puc.jpg', 'before');
    CREATE TABLE personal_expenses(id INTEGER PRIMARY KEY, amount INTEGER); INSERT INTO personal_expenses VALUES (1, 789);`);
  const snapshot = (table) => JSON.stringify(raw.prepare(`SELECT * FROM ${table}`).all());
  const preserved = ['vehicles', 'vehicle_photos', 'vehicle_services', 'service_bill_photos', 'vehicle_insurance', 'vehicle_puc', 'insurance_documents', 'puc_documents', 'personal_expenses'];
  const before = Object.fromEntries(preserved.map((table) => [table, snapshot(table)]));
  await migration.migrateDatabase(db); await migration.migrateDatabase(db);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 8);
  for (const table of preserved) assert.equal(snapshot(table), before[table]);
  assert.equal(raw.prepare('SELECT count(*) AS n FROM vehicle_reminder_sources').get().n, 6);
  assert.equal(raw.prepare('PRAGMA foreign_key_check').all().length, 0);
  const fresh = database(':memory:'); await migration.migrateDatabase(fresh.db);
  assert.equal(fresh.raw.prepare('PRAGMA user_version').get().user_version, 8); fresh.raw.close();
  const failed = database(':memory:');
  for (const step of migrations.slice(0, 6)) failed.raw.exec(step[1]);
  await assert.rejects(() => migration.migrateDatabase({ ...failed.db, execAsync: async (sql) => {
    if (sql.includes('CREATE TABLE reminder_preferences')) { failed.raw.exec('CREATE TABLE partial_migration(id INTEGER)'); throw new Error('disk full'); }
    return failed.db.execAsync(sql);
  } }));
  assert.equal(failed.raw.prepare('PRAGMA user_version').get().user_version, 6);
  assert.equal(failed.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'partial_migration'").get().n, 0); failed.raw.close();
  const repo = load('src/database/reminders.ts', { '@/features/vehicles/coverage-status': dates, '@/features/reminders/reminder': domain });
  const reconcile = load('src/features/reminders/reconcile.ts', { '@/database/reminders': repo, '@/features/vehicles/coverage-status': dates, './reminder': domain });
  const permissions = load('src/features/reminders/permission.ts', { '@/database/reminders': repo });
  const now = new Date(2027, 0, 1, 12);
  let intervals = await repo.getReminderIntervals(db);
  assert.equal(intervals.length, 12); assert.equal((await repo.getReminderPreferences(db)).mileageThreshold, 500);
  const sources = await repo.getReminderSources(db, '2027-01-01');
  const plans = domain.planNotifications(sources, intervals, now);
  assert.equal(plans.length, 24); assert.equal(new Set(plans.map((item) => item.notificationId)).size, 24);
  for (const kind of ['insurance', 'puc', 'service']) assert.equal(plans.filter((item) => item.sourceType === kind).length, 8);
  assert.ok(plans.every((item) => !item.body.includes('PRIVATE') && !item.body.includes('Private')));
  assert.equal(domain.planNotifications([...sources, ...sources], [...intervals, ...intervals], now).length, 24);
  await repo.setReminderInterval(db, 'insurance', 7, false);
  await repo.setReminderPreferences(db, true, 250);
  raw.close(); ({ raw, db } = database(filename)); await migration.migrateDatabase(db);
  intervals = await repo.getReminderIntervals(db);
  assert.equal(intervals.find((item) => item.sourceType === 'insurance' && item.offsetDays === 7).enabled, 0);
  assert.equal((await repo.getReminderPreferences(db)).mileageThreshold, 250);
  assert.equal(domain.planNotifications(sources, intervals, now).length, 22);
  await repo.setReminderInterval(db, 'insurance', 14, true);
  assert.equal(domain.planNotifications(sources, await repo.getReminderIntervals(db), now).length, 24);
  await repo.setReminderInterval(db, 'insurance', 14, false); await repo.setReminderInterval(db, 'insurance', 7, true);
  await assert.rejects(() => repo.setReminderInterval(db, 'insurance', -1, true));
  await assert.rejects(() => repo.setReminderPreferences(db, true, -1));
  assert.equal(domain.odometerStatus(9500, 10000, 500).state, 'Approaching');
  assert.equal(domain.odometerStatus(9499, 10000, 500).state, 'Upcoming');
  assert.equal(domain.odometerStatus(10000, 10000).state, 'Due');
  assert.equal(domain.odometerStatus(10001, 10000).state, 'Overdue');
  assert.equal(domain.odometerStatus(1, null), null);
  await db.runAsync('UPDATE vehicles SET odometer_km = 10000 WHERE id = 1');
  const mileage = (await repo.getReminderSources(db, '2027-01-01')).find((item) => item.id === 'service:1:service-1');
  assert.equal(domain.odometerStatus(mileage.odometer, mileage.dueOdometer).state, 'Due');
  assert.equal((await repo.getVehicleMileageTarget(db, 1)).dueOdometer, 10000);

  let permission = 'undetermined', prompts = 0;
  const request = async () => { prompts++; permission = 'denied'; return permission; };
  await permissions.requestReminderPermissionOnce(db, async () => permission, request);
  await permissions.requestReminderPermissionOnce(db, async () => permission, request);
  permission = 'undetermined'; await permissions.requestReminderPermissionOnce(db, async () => permission, request);
  assert.equal(prompts, 1);
  const scheduled = new Map([['another-domain', { id: 'another-domain', owner: 'personal', fingerprint: 'keep' }]]);
  let schedules = 0, cancels = [], failCancel = false, failSchedule = false, afterSchedule = null;
  const native = {
    capacity: 450,
    permission: async () => permission,
    scheduled: async () => [...scheduled.values()],
    cancel: async (id) => { if (failCancel) throw new Error('cancel failed'); cancels.push(id); scheduled.delete(id); },
    schedule: async (item) => {
      schedules++; scheduled.set(item.notificationId, { id: item.notificationId, owner: domain.NOTIFICATION_OWNER, fingerprint: item.fingerprint });
      if (afterSchedule) await afterSchedule(item);
      if (failSchedule) throw new Error('native reply lost after scheduling');
      return item.notificationId;
    },
  };
  permission = 'denied';
  assert.equal((await reconcile.reconcileReminders(db, native, now)).scheduled, 0);
  assert.equal(schedules, 0); assert.ok(scheduled.has('another-domain'));
  permission = 'granted';
  assert.equal((await reconcile.reconcileReminders(db, native, now)).scheduled, 24);
  assert.equal(schedules, 24);
  await reconcile.reconcileReminders(db, native, now); assert.equal(schedules, 24);
  assert.equal((await repo.getScheduledReminders(db)).length, 24);

  // Edit due date: only that source's old schedule is cancelled/replaced.
  const bBefore = JSON.stringify([...scheduled.values()].filter((item) => item.id.includes(':2:')));
  await db.runAsync("UPDATE vehicle_insurance SET expiry_date = '2027-03-15' WHERE id = 'insurance-1'");
  assert.equal((await repo.getNotificationCleanup(db)).length, 4);
  await reconcile.reconcileReminders(db, native, now);
  assert.equal(schedules, 28); assert.equal(cancels.length, 4);
  assert.equal(JSON.stringify([...scheduled.values()].filter((item) => item.id.includes(':2:'))), bBefore);
  assert.equal((await repo.getNotificationCleanup(db)).length, 0);
  assert.ok([...scheduled.values()].some((item) => item.id.includes('insurance:1:') && item.fingerprint.includes('2027-03-15')));
  await repo.setReminderInterval(db, 'puc', 1, false);
  await reconcile.reconcileReminders(db, native, now);
  assert.equal([...scheduled.values()].filter((item) => item.id.includes('puc:') && item.id.endsWith(':1')).length, 0);
  await repo.setReminderInterval(db, 'puc', 1, true); await reconcile.reconcileReminders(db, native, now);

  // OS duplicate/orphan cleanup, missing native schedules and a lost native response.
  const orphan = `${domain.NOTIFICATION_PREFIX}orphan`;
  scheduled.set(orphan, { id: orphan, owner: domain.NOTIFICATION_OWNER, fingerprint: 'obsolete' });
  const lost = plans[0].notificationId; scheduled.delete(lost);
  failSchedule = true; assert.ok((await reconcile.reconcileReminders(db, native, now)).failures > 0);
  failSchedule = false; const calls = schedules; await reconcile.reconcileReminders(db, native, now);
  assert.equal(schedules, calls); assert.equal(scheduled.has(orphan), false); assert.ok(scheduled.has('another-domain'));
  assert.ok(!cancels.includes('another-domain'));

  // Deletion commits relational cleanup even if the native cancel fails; restart retries it.
  await db.runAsync("DELETE FROM vehicle_puc WHERE id = 'puc-1'");
  assert.equal((await repo.getReminderSources(db, '2027-01-01')).some((item) => item.id === 'puc:1:puc-1'), false);
  failCancel = true; assert.ok((await reconcile.reconcileReminders(db, native, now)).failures > 0);
  assert.ok((await repo.getNotificationCleanup(db)).length > 0);
  raw.close(); ({ raw, db } = database(filename)); await migration.migrateDatabase(db);
  failCancel = false; await reconcile.reconcileReminders(db, native, now);
  assert.equal([...scheduled.keys()].some((id) => id.includes('puc:1:puc-1')), false);
  assert.equal((await repo.getNotificationCleanup(db)).length, 0);
  assert.ok([...scheduled.keys()].some((id) => id.includes('puc:2:puc-2')));
  permission = 'denied'; await reconcile.reconcileReminders(db, native, now);
  assert.equal(scheduled.size, 1);
  permission = 'granted'; await reconcile.reconcileReminders(db, native, now); assert.ok(scheduled.size > 1);
  await repo.setReminderPreferences(db, false, 500); await reconcile.reconcileReminders(db, native, now); assert.equal(scheduled.size, 1);
  await repo.setReminderPreferences(db, true, 500);

  // A newer service supersedes the old due date; odometer-only never schedules a fake date.
  await db.runAsync(`INSERT INTO vehicle_services(id,vehicle_id,service_date,odometer,title,next_service_odometer,created_at,updated_at)
    VALUES ('new-service',1,'2027-01-01',10000,'Latest service',15000,'now','now')`);
  await reconcile.reconcileReminders(db, native, now);
  assert.equal([...scheduled.keys()].some((id) => id.includes('service:1:')), false);
  const latest = (await repo.getReminderSources(db, '2027-01-01')).find((item) => item.vehicleId === 1 && item.sourceType === 'service');
  assert.equal(latest.recordId, 'new-service'); assert.equal(latest.dueDate, null);
  await db.runAsync("UPDATE vehicle_services SET next_service_date = '2027-04-01' WHERE id = 'new-service'");
  await reconcile.reconcileReminders(db, native, now);
  assert.ok([...scheduled.keys()].some((id) => id.includes('service:1:new-service')));

  // Concurrent requests share one pass. A source deleted during scheduling is cancelled again.
  scheduled.clear(); scheduled.set('another-domain', { id: 'another-domain', owner: 'personal', fingerprint: 'keep' });
  const first = reconcile.reconcileReminders(db, native, now), second = reconcile.reconcileReminders(db, native, now);
  assert.equal(first, second); await Promise.all([first, second]);
  await db.runAsync("UPDATE vehicle_insurance SET expiry_date = '2027-05-01' WHERE id = 'insurance-1'");
  afterSchedule = async (item) => {
    if (item.sourceId === 'insurance:1:insurance-1') { afterSchedule = null; await db.runAsync("DELETE FROM vehicle_insurance WHERE id = 'insurance-1'"); }
  };
  await reconcile.reconcileReminders(db, native, now); afterSchedule = null;
  await reconcile.reconcileReminders(db, native, now);
  assert.equal([...scheduled.keys()].some((id) => id.includes('insurance:1:insurance-1')), false);
  native.capacity = 4;
  const limited = await reconcile.reconcileReminders(db, native, now);
  assert.equal(limited.scheduled, 3); assert.ok(limited.deferred > 0); assert.equal(scheduled.size, 4);
  native.capacity = 450;

  // Vehicle cascade leaves cancellation jobs, not rows referencing deleted sources.
  await reconcile.reconcileReminders(db, native, now);
  const remainingBefore = JSON.stringify([...scheduled.values()].filter((item) => item.id.includes(':2:')));
  await db.runAsync('DELETE FROM vehicles WHERE id = 1'); await reconcile.reconcileReminders(db, native, now);
  assert.equal([...scheduled.keys()].some((id) => id.includes(':1:')), false);
  assert.equal(JSON.stringify([...scheduled.values()].filter((item) => item.id.includes(':2:'))), remainingBefore);
  assert.equal(snapshot('personal_expenses'), before.personal_expenses);
  assert.equal(raw.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.ok(scheduled.has('another-domain'));
  const past = await reconcile.reconcileReminders(db, native, new Date(2028, 0, 1)); assert.equal(past.scheduled, 0);
  raw.close(); assert.ok(path.basename(root).startsWith('lifepilot-reminders-')); fs.rmSync(root, { recursive: true });
  console.log('PASS: v6→v7 preservation/backfill/rollback, settings persistence, 30/7/1/0 dates across time zones/DST, odometer, denied permission, stable schedules, edit/delete/cascade isolation, restart cancellation retry, native failure recovery, concurrency and capacity.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
