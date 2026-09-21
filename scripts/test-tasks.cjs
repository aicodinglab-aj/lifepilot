/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, Date, require: (name) => {
    if (name in mocks) return mocks[name];
    return load(`${name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(relative), name)}.ts`, mocks);
  } });
  return exports;
}
function database() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    runAsync: async (sql, params = []) => {
      const result = raw.prepare(sql).run(...params); return { ...result, lastInsertRowId: Number(result.lastInsertRowid) };
    },
    withTransactionAsync: async (fn) => {
      raw.exec('BEGIN'); try { await fn(); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  return { raw, db };
}
async function main() {
  const migration = load('src/database/migrate.ts'), repo = load('src/database/tasks.ts'), domain = load('src/features/tasks/task.ts');
  const { raw, db } = database();
  raw.exec('PRAGMA foreign_keys = ON');
  const steps = [...fs.readFileSync(path.join(__dirname, '../src/database/migrate.ts'), 'utf8').matchAll(/await db\.execAsync\(`([\s\S]*?)`\)/g)];
  for (const step of steps.slice(0, 8)) raw.exec(step[1]);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 8);
  raw.exec(`INSERT INTO vehicles (id, vehicle_type, registration_number, make, model, model_year, fuel_type, odometer_km, created_at, updated_at)
    VALUES (1, 'Car', 'PRESERVE', 'Test', 'Car', 2020, 'Petrol', 100, 'before', 'before');
    INSERT INTO vehicle_photos VALUES ('photo', 1, 'file:///owned.jpg', 1, 'before');
    INSERT INTO vehicle_services(id, vehicle_id, service_date, odometer, title, created_at, updated_at)
      VALUES ('service', 1, '2026-01-01', 100, 'Visit', 'before', 'before');
    INSERT INTO vehicle_insurance(id, vehicle_id, provider, policy_number, expiry_date, created_at, updated_at)
      VALUES ('insurance', 1, 'Provider', 'Policy', '2027-01-01', 'before', 'before');
    INSERT INTO vehicle_puc(id, vehicle_id, expiry_date, created_at, updated_at) VALUES ('puc', 1, '2027-01-01', 'before', 'before');
    INSERT INTO personal_transactions(type, amount, category_id, transaction_date, created_at, updated_at)
      VALUES ('expense', 100, 'expense-food', '2026-01-01', 'before', 'before');`);
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  const snapshot = () => JSON.stringify(tables.map((name) => [name, raw.prepare(`SELECT * FROM ${name}`).all()]));
  const before = snapshot();
  await migration.migrateDatabase(db); await migration.migrateDatabase(db);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 9);
  assert.equal(snapshot(), before);
  assert.equal((await repo.getTaskCategories(db)).length, 5);
  const fresh = database(); await migration.migrateDatabase(fresh.db);
  assert.equal((await repo.getTaskCategories(fresh.db)).length, 5);
  fresh.raw.exec('PRAGMA user_version = 10'); await assert.rejects(() => migration.migrateDatabase(fresh.db)); fresh.raw.close();
  const broken = database(); broken.raw.exec('PRAGMA user_version = 8; CREATE TABLE tasks (id INTEGER)');
  await assert.rejects(() => migration.migrateDatabase(broken.db));
  assert.equal(broken.raw.prepare('PRAGMA user_version').get().user_version, 8);
  assert.equal(broken.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'task_categories'").get(), undefined); broken.raw.close();

  const draft = { title: 'Buy groceries', description: 'Private notes', categoryId: 'shopping', priority: 'medium', dueDate: null, dueTime: null, reminderEnabled: 0 };
  await assert.rejects(() => repo.saveTask(db, { ...draft, title: ' ' }));
  await assert.rejects(() => repo.saveTask(db, { ...draft, dueDate: '2026-02-30' }));
  await assert.rejects(() => repo.saveTask(db, { ...draft, dueDate: '2026-09-18', dueTime: '24:00' }));
  await assert.rejects(() => repo.saveTask(db, { ...draft, categoryId: 'expense-food' }));
  const id = await repo.saveTask(db, draft);
  assert.equal(await repo.saveTask(db, { ...draft, title: 'Edited', priority: 'high' }, id), id);
  assert.equal((await repo.getTask(db, id)).title, 'Edited');
  await repo.completeTask(db, id, true); let row = await repo.getTask(db, id);
  assert.equal(row.completed, 1); assert.ok(row.completedAt);
  await repo.completeTask(db, id, false); row = await repo.getTask(db, id);
  assert.equal(row.completed, 0); assert.equal(row.completedAt, null);
  const today = '2026-09-18';
  for (const [date, status] of [[null, 'No due date'], ['2026-09-17', 'Overdue'], [today, 'Today'], ['2026-09-19', 'Upcoming']]) {
    await repo.saveTask(db, { ...draft, dueDate: date }, id);
    row = await repo.getTask(db, id); assert.equal(domain.taskStatus(row, today), status);
    assert.equal((await repo.getTasks(db, { view: status, today }))[0].id, id);
  }
  assert.equal((await repo.getTasks(db, { view: 'Upcoming', today, category: 'work' })).length, 0);
  assert.equal((await repo.getTasks(db, { view: 'Upcoming', today, category: 'shopping', priority: 'medium' })).length, 1);
  assert.equal((await repo.getTasks(db, { view: 'Upcoming', today, priority: 'high' })).length, 0);
  const cleaned = domain.normalizeTask({ ...draft, dueTime: '12:00', reminderEnabled: 1 });
  assert.equal(cleaned.dueTime, null); assert.equal(cleaned.reminderEnabled, 0);
  assert.equal(domain.taskFireAt({ ...draft, completed: 0 }), null);
  const now = new Date(2026, 8, 18, 23, 59, 0);
  assert.equal(domain.localToday(now), today);
  assert.equal(domain.taskStatus({ completed: 0, dueDate: '2026-09-19' }, domain.localToday(new Date(2026, 8, 19, 0, 0))), 'Today');
  const timed = { ...draft, dueDate: '2026-09-19', dueTime: '00:01', reminderEnabled: 1 };
  assert.equal(domain.taskFireAt({ ...timed, completed: 0 }), new Date(2026, 8, 19, 0, 1).getTime());
  const originalZone = process.env.TZ;
  try {
    for (const zone of ['Asia/Kolkata', 'America/New_York', 'Pacific/Auckland']) {
      process.env.TZ = zone;
      assert.equal(domain.localToday(new Date(2026, 8, 18, 23, 59)), today);
      assert.equal(domain.localToday(new Date(2026, 8, 19, 0, 0)), '2026-09-19');
      assert.equal(domain.taskFireAt({ ...timed, completed: 0 }), new Date(2026, 8, 19, 0, 1).getTime());
    }
    process.env.TZ = 'America/New_York';
    assert.equal(domain.taskFireAt({ ...timed, completed: 0, dueDate: '2026-03-08', dueTime: '02:30' }), null, 'DST gap must not silently change the time');
  } finally { if (originalZone == null) delete process.env.TZ; else process.env.TZ = originalZone; }

  const notify = load('src/features/tasks/task-notifications.ts');
  const inventory = new Map([['vehicle-id', { id: 'vehicle-id', owner: 'lifepilot.vehicle-reminders.v1', fingerprint: 'vehicle' }]]);
  let permission = 'granted', failCancel = false, failSchedule = false, schedules = 0;
  const adapter = {
    capacity: 60, permission: async () => permission, scheduled: async () => [...inventory.values()],
    cancel: async (key) => { assert.notEqual(key, 'vehicle-id'); if (failCancel) throw new Error('cancel failed'); inventory.delete(key); },
    schedule: async (plan) => { if (failSchedule) throw new Error('schedule failed'); schedules++; inventory.set(plan.id, { id: plan.id, owner: notify.TASK_NOTIFICATION_OWNER, fingerprint: plan.fingerprint }); return plan.id; },
  };
  const reconcile = () => notify.reconcileTaskNotifications(db, adapter, new Date(2026, 8, 18, 23, 59));
  await repo.saveTask(db, timed, id); await reconcile();
  const key = `${notify.TASK_NOTIFICATION_PREFIX}${id}`;
  assert.ok(inventory.has(key)); assert.equal(schedules, 1);
  await Promise.all([reconcile(), reconcile()]); assert.equal(schedules, 1, 'no duplicate scheduling');
  await repo.saveTask(db, { ...timed, dueTime: '00:02' }, id); await reconcile(); assert.equal(schedules, 2);
  await repo.completeTask(db, id, true); await reconcile(); assert.equal(inventory.has(key), false);
  await repo.completeTask(db, id, false); await reconcile(); assert.equal(inventory.has(key), true);
  await repo.saveTask(db, { ...timed, reminderEnabled: 0 }, id); await reconcile(); assert.equal(inventory.has(key), false);
  await repo.saveTask(db, { ...timed, dueDate: today, dueTime: '23:58' }, id); await reconcile(); assert.equal(inventory.has(key), false);
  permission = 'denied'; await repo.saveTask(db, timed, id); await reconcile(); assert.ok(await repo.getTask(db, id)); assert.equal(inventory.has(key), false);
  permission = 'granted'; failSchedule = true; assert.match(await reconcile(), /could not be updated/); assert.ok(await repo.getTask(db, id));
  failSchedule = false; await reconcile(); failCancel = true;
  await repo.deleteTask(db, id); assert.match(await reconcile(), /could not be updated/); assert.equal(await repo.getTask(db, id), null);
  failCancel = false; await reconcile(); assert.equal(inventory.has(key), false); assert.ok(inventory.has('vehicle-id'));
  const missingNative = { ...adapter, permission: async () => { throw new Error('unavailable'); } };
  const saved = await repo.saveTask(db, timed);
  assert.match(await notify.reconcileTaskNotifications(db, missingNative, now), /unavailable/); assert.ok(await repo.getTask(db, saved));
  adapter.capacity = 1; await reconcile(); assert.equal(inventory.size, 1, 'reserve other domains capacity');
  await repo.deleteTask(db, saved);

  for (let index = 0; index < 95; index++) {
    const task = await repo.saveTask(db, { ...draft, title: `Task ${index}` }); await repo.completeTask(db, task, true);
  }
  const seen = new Set();
  for (let offset = 0; offset < 95; offset += repo.TASK_PAGE_SIZE) {
    const page = await repo.getTasks(db, { view: 'Completed', today }, offset);
    for (const task of page) { assert.ok(!seen.has(task.id)); seen.add(task.id); }
  }
  assert.equal(seen.size, 95); assert.equal((await repo.getTaskSummary(db, today)).completed, 95);
  assert.equal(snapshot(), before, 'task mutations must not alter any pre-existing domain tables');
  let permissionResult = { status: 'undetermined', granted: false, canAskAgain: true };
  let requests = 0, payload;
  const native = load('src/features/tasks/notifications.ts', {
    'react-native': { Platform: { OS: 'android' } },
    '@/features/reminders/notifications': { notificationAdapter: { capacity: 450, scheduled: adapter.scheduled, cancel: adapter.cancel } },
    '@/features/notifications/runtime': { loadNotificationRuntime: async () => ({
      AndroidImportance: { DEFAULT: 3, NONE: 0 }, AndroidNotificationVisibility: { PRIVATE: 0 },
      SchedulableTriggerInputTypes: { DATE: 'date' },
      setNotificationChannelAsync: async (channel) => assert.equal(channel, 'task-reminders'),
      getNotificationChannelAsync: async () => ({ importance: 3 }),
      getPermissionsAsync: async () => permissionResult,
      requestPermissionsAsync: async () => { requests++; permissionResult = { status: 'denied', granted: false, canAskAgain: true }; },
      scheduleNotificationAsync: async (value) => { payload = value; return value.identifier; },
    }) },
  });
  await Promise.all([native.requestTaskPermission(), native.requestTaskPermission()]);
  await native.requestTaskPermission(); assert.equal(requests, 1, 'denied permission must never reprompt');
  permissionResult = { status: 'granted', granted: true, canAskAgain: true };
  assert.equal(await native.taskNotificationPermission(), 'granted');
  await native.taskNotificationAdapter.schedule({ id: 'task-notification', taskId: 1, title: 'Buy groceries', fireAt: Date.now() + 60000, fingerprint: 'test' });
  assert.equal(payload.content.title, 'LifePilot Task'); assert.equal(payload.content.body, 'Buy groceries');
  assert.equal(payload.trigger.channelId, 'task-reminders'); assert.equal(payload.content.data.owner, 'lifepilot.tasks.v1');
  assert.ok(!JSON.stringify(payload).includes('Private notes'));
  await assert.rejects(() => native.taskNotificationAdapter.schedule({ fireAt: Date.now() - 1000 }));
  let handler;
  const existingNotifications = load('src/features/reminders/notifications.ts', {
    'react-native': { Platform: { OS: 'android' } },
    '@/features/notifications/runtime': { loadNotificationRuntime: async () => ({ setNotificationHandler: (value) => { handler = value; } }) },
    './test-build': { reminderTestEnabled: false },
  });
  await existingNotifications.installReminderNotificationHandler();
  const foreground = (owner, identifier) => handler.handleNotification({ request: { identifier, content: { data: { owner } } } });
  assert.equal((await foreground('lifepilot.tasks.v1', 'lifepilot.tasks.v1:1')).shouldShowBanner, true);
  assert.equal((await foreground('lifepilot.tasks.v1', 'unrelated')).shouldShowBanner, false);
  assert.equal((await foreground('lifepilot.vehicle-reminders.v1', 'lifepilot.vehicle-reminders.v1:1')).shouldShowBanner, true);

  const theme = load('src/features/appearance/theme.ts');
  let resolved, wentBack = false;
  const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
  const ui = load('src/components/tasks/task-ui.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { Stack: { Screen: 'Screen' }, router: { canGoBack: () => true, back: () => { wentBack = true; } } },
    '@/components/ui/screen-header': { ScreenHeader: ({ title }) => jsx('Screen', { options: { title, headerLeft: () => jsx('Pressable', { onPress: () => { wentBack = true; } }) } }) },
    '@/features/appearance/appearance-provider': { useAppearance: () => resolved },
  });
  for (const preference of ['lifepilot', 'light', 'system', 'custom']) {
    for (const base of ['light', 'dark']) {
      resolved = theme.resolveTheme(preference, base, { base, accent: 'purple' });
      const page = ui.TaskPage({ title: 'Tasks / To-Do', children: null });
      assert.equal(page.props.style.backgroundColor, resolved.colors.background);
      page.props.children[0].props.options.headerLeft().props.onPress(); assert.equal(wentBack, true);
      const metadata = ui.TaskMetadata({ task: { ...draft, dueDate: '2026-09-17', completed: 0 }, today });
      assert.equal(metadata.props.children[0].props.style.color, resolved.colors.danger);
      const action = ui.TaskAction({ label: 'Mark Complete', disabled: true, onPress: () => {} });
      assert.equal(action.props.accessibilityState.disabled, true);
    }
  }
  raw.close();
  console.log('PASS: v8→v9/fresh migration, rollback, preservation, seeds, task CRUD/completion, validation, filters, local dates, reminders/edit/cancel/retry/capacity, pagination and domain isolation.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
