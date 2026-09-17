/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Error, require: (name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
function database(filename) {
  const raw = new DatabaseSync(filename);
  const db = {
    databasePath: filename.replaceAll('\\', '/'), options: {},
    closeAsync: async () => raw.close(),
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
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifepilot-services-'));
  const filename = path.join(root, 'test.sqlite');
  let { raw, db } = database(filename);
  const migrations = [...fs.readFileSync(path.join(__dirname, '../src/database/migrate.ts'), 'utf8').matchAll(/await db\.execAsync\(`([\s\S]*?)`\)/g)];
  const migration = load('src/database/migrate.ts');
  for (const migration of migrations.slice(0, 4)) raw.exec(migration[1]);
  for (const id of [1, 2]) raw.prepare(`INSERT INTO vehicles
    (id, vehicle_type, registration_number, make, model, model_year, fuel_type, odometer_km, created_at, updated_at)
    VALUES (?, 'Car', ?, 'Test', 'Model', 2020, 'Petrol', 500, 'before', 'before')`).run(id, `SERVICE-${id}`);
  raw.exec(`INSERT INTO vehicle_photos VALUES ('gallery', 1, 'file:///gallery.jpg', 1, 'before');
    CREATE TABLE personal_expenses (id INTEGER PRIMARY KEY, amount INTEGER);
    INSERT INTO personal_expenses VALUES (1, 12345);`);
  const snapshot = (table) => JSON.stringify(raw.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
  const vehiclesBefore = snapshot('vehicles');
  const galleryBefore = snapshot('vehicle_photos');
  const personalBefore = snapshot('personal_expenses');
  await migration.migrateDatabase(db); await migration.migrateDatabase(db);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 7);
  assert.equal(snapshot('vehicles'), vehiclesBefore); assert.equal(snapshot('vehicle_photos'), galleryBefore);
  assert.equal(snapshot('personal_expenses'), personalBefore);
  const fresh = database(':memory:'); await migration.migrateDatabase(fresh.db);
  assert.equal(fresh.raw.prepare('PRAGMA user_version').get().user_version, 7);
  fresh.raw.close();
  const repo = load('src/database/vehicle-services.ts', { 'expo-sqlite': {
    openDatabaseAsync: async (name, options, directory) => {
      assert.equal(options.useNewConnection, true);
      const connection = database(path.join(directory, name));
      // Simulate Expo's new connection NOT inheriting PRAGMA foreign_keys.
      connection.raw.exec('PRAGMA foreign_keys = OFF');
      return connection.db;
    },
  } });
  let failCopy = false, failDelete = false, failRead = false;
  let copies = 0;
  let gate = null;
  const document = pathToFileURL(path.join(root, 'documents')).href;
  fs.mkdirSync(fileURLToPath(document));
  class Directory {
    constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join('/'); }
    get name() { return path.basename(fileURLToPath(this.uri)); }
    get exists() { return fs.existsSync(fileURLToPath(this.uri)); }
    create() { fs.mkdirSync(fileURLToPath(this.uri), { recursive: true }); }
    list() {
      if (failRead) throw new Error('Access denied');
      return fs.readdirSync(fileURLToPath(this.uri)).map((name) => ({ name }));
    }
    delete() {
      const target = path.resolve(fileURLToPath(this.uri));
      assert.ok(target.startsWith(path.resolve(root) + path.sep));
      if (failDelete) throw new Error('Storage unavailable');
      fs.rmSync(target, { recursive: true });
    }
  }
  class File extends Directory {
    get size() { return this.exists ? fs.statSync(fileURLToPath(this.uri)).size : 0; }
    async copy(destination) {
      if (gate) await gate;
      copies++;
      fs.writeFileSync(fileURLToPath(destination.uri), 'bill fixture');
      if (failCopy) throw new Error('Copy failed');
    }
  }
  const storage = load('src/storage/service-bills.ts', { 'expo-file-system': { Directory, File, Paths: { document } } });
  const domain = load('src/features/vehicles/service-record.ts');
  const operation = load('src/features/vehicles/vehicle-operation.ts');
  const service = load('src/features/vehicles/service-maintenance.ts', {
    'expo-crypto': { randomUUID }, '@/database/vehicle-services': repo, '@/storage/service-bills': storage,
    './service-record': domain, './vehicle-operation': operation,
  });
  const form = { ...domain.emptyServiceForm, serviceDate: '2026-01-01', odometer: '0', title: ' Oil service ',
    partsCost: '100.10', labourCost: '0.20', otherCost: '', workshop: ' Workshop ', description: 'Oil and filter',
    nextServiceDate: '2027-01-01', nextServiceOdometer: '10000', notes: 'Keep receipt' };
  const photos = [{ id: randomUUID(), uri: 'file:///source/receipt.jpg' }, { id: randomUUID(), uri: 'file:///source/receipt%20two.png' }];
  const id = await service.createService(db, 1, form, photos);
  let record = await repo.getService(db, 1, id);
  assert.equal(record.title, 'Oil service'); assert.equal(record.workshop, 'Workshop'); assert.equal(record.odometer, 0);
  assert.equal(record.totalCost, 100.3); assert.equal(record.otherCost, null);
  assert.equal(record.description, form.description); assert.equal(record.notes, form.notes);
  assert.equal(record.nextServiceDate, form.nextServiceDate); assert.equal(record.nextServiceOdometer, 10000);
  assert.equal(domain.calculateServiceTotal(record), record.totalCost);
  assert.equal(domain.calculateServiceTotal({ partsCost: null, labourCost: null, otherCost: null }), null);
  assert.equal(domain.calculateServiceTotal({ partsCost: 0, labourCost: null, otherCost: null }), 0);
  assert.equal((await repo.getServiceBills(db, 1, id)).length, 2);
  assert.equal((await repo.getServiceBills(db, 2, id)).length, 0);
  assert.equal(await repo.getService(db, 2, id), null);
  assert.equal((await repo.getServiceCleanup(db)).length, 0);
  const bills = await repo.getServiceBills(db, 1, id);
  for (const bill of bills) assert.ok(storage.availableServiceBillUri(1, id, bill.id, bill.localUri));
  const normalPhoto = path.join(fileURLToPath(document), 'vehicle-photos', '1', 'normal-gallery.jpg');
  fs.writeFileSync(normalPhoto, 'normal vehicle gallery');
  const personalFile = path.join(fileURLToPath(document), 'personal-receipt.jpg');
  fs.writeFileSync(personalFile, 'personal receipt');
  await repo.queueServiceCleanup(db, 1, id);
  await assert.rejects(() => service.retryServiceCleanup(db, 1));
  assert.ok(fs.existsSync(fileURLToPath(bills[0].localUri)));
  await repo.clearServiceCleanup(db, 1, id);
  assert.equal(snapshot('vehicle_photos'), galleryBefore);
  for (const [key, value] of [['partsCost', '-1'], ['labourCost', 'Infinity'], ['otherCost', '1.001'], ['partsCost', '1e2'],
    ['partsCost', '1000000001'], ['odometer', '-1'], ['odometer', 'NaN'], ['nextServiceOdometer', '-1'], ['title', ' '],
    ['serviceDate', '2025-02-29'], ['nextServiceDate', '2026-02-30'], ['serviceDate', '']]) {
    assert.ok(domain.validateServiceForm({ ...form, [key]: value })[key]);
    await assert.rejects(() => service.createService(db, 1, { ...form, [key]: value }, []));
  }
  const blank = { ...domain.emptyServiceForm, serviceDate: '2026-02-28', odometer: '10', title: 'Inspection' };
  const latest = await service.createService(db, 1, blank, []);
  assert.equal((await repo.getService(db, 1, latest)).totalCost, null);
  const other = await service.createService(db, 2, form, photos.slice(0, 1));
  assert.equal((await repo.getServiceHistory(db, 1))[0].id, latest);
  assert.equal((await repo.getServiceSummary(db, 1)).total, 100.3);
  assert.equal((await repo.getServiceSummary(db, 1)).missing, 1);
  await assert.rejects(() => service.createService(db, 999, form, []), /no longer exists/);
  await assert.rejects(() => service.createService(db, -1, form, []), /Invalid vehicle/);
  await assert.rejects(() => db.runAsync(`INSERT INTO service_bill_photos VALUES (?, 2, ?, ?, 'now')`, [randomUUID(), id, 'file:///bad-owner.jpg']));
  await assert.rejects(() => db.runAsync('UPDATE vehicle_services SET parts_cost = -1 WHERE id = ?', [id]));
  await service.deleteService(db, 2, id);
  assert.ok(await repo.getService(db, 1, id));
  raw.exec(`CREATE TRIGGER fail_delete BEFORE DELETE ON vehicle_services BEGIN SELECT RAISE(ABORT, 'delete failed'); END;`);
  await assert.rejects(() => service.deleteService(db, 1, id), /delete failed/);
  assert.equal((await repo.getServiceBills(db, 1, id)).length, 2);
  assert.ok(fs.existsSync(fileURLToPath(bills[0].localUri)));
  assert.equal((await repo.getServiceCleanup(db)).length, 0);
  raw.exec('DROP TRIGGER fail_delete');
  // A malicious metadata URI must never become a deletion target.
  await db.runAsync('UPDATE service_bill_photos SET local_uri = ? WHERE id = ?', [pathToFileURL(personalFile).href, bills[0].id]);
  await service.deleteService(db, 1, id);
  assert.equal(await repo.getService(db, 1, id), null); assert.equal((await repo.getServiceBills(db, 1, id)).length, 0);
  for (const bill of bills) assert.equal(fs.existsSync(fileURLToPath(bill.localUri)), false);
  assert.equal(fs.readFileSync(normalPhoto, 'utf8'), 'normal vehicle gallery');
  assert.equal(fs.readFileSync(personalFile, 'utf8'), 'personal receipt');
  assert.ok(await repo.getService(db, 2, other));
  assert.equal(snapshot('vehicles'), vehiclesBefore); assert.equal(snapshot('vehicle_photos'), galleryBefore);
  assert.equal(snapshot('personal_expenses'), personalBefore);

  // Exact path suffix, encoded scope, old sandbox rebasing and adversarial paths.
  const billId = randomUUID(), serviceId = randomUUID();
  const suffix = `vehicle-photos/1/service-bills/${serviceId}/${billId}.jpg`;
  const validUri = `file:///old/%40scope%2Fbad/${suffix}`;
  assert.throws(() => storage.ownedServiceBillFile(1, serviceId, billId, validUri));
  assert.equal(storage.ownedServiceBillFile(1, serviceId, billId, `file:///old/%40scope%25/${suffix}`).uri, `${document}/${suffix}`);
  for (const uri of [`file:///old/../${suffix}`, `file:///old/%2e%2e/${suffix}`, `file:///old/%2f/${suffix}`,
    `file:///old/%5c/${suffix}`, `file:///old/%00/${suffix}`, `file:///old/%/${suffix}`, `file:///old/${suffix}?x`,
    `file:///old/${suffix}#x`, `content:///old/${suffix}`, `file:///old/vehicle-photos/1/${billId}.jpg`,
    `file:///old/${suffix.replace('/1/', '/2/')}`, `file:///old/${suffix.replace(serviceId, randomUUID())}`]) {
    assert.throws(() => storage.ownedServiceBillFile(1, serviceId, billId, uri), uri);
  }
  await assert.rejects(() => storage.deleteServiceBillDirectory(1, '../2'));
  await assert.rejects(() => storage.deleteServiceBillDirectory(-1, serviceId));
  failRead = true; await assert.rejects(() => storage.deleteServiceBillDirectory(1, serviceId)); failRead = false;

  // Failure after a partial copy leaves no record and retries safely after restart.
  const beforeCount = raw.prepare('SELECT count(*) AS n FROM vehicle_services').get().n;
  failCopy = true;
  await assert.rejects(() => service.createService(db, 1, form, photos), /Copy failed/);
  assert.equal(raw.prepare('SELECT count(*) AS n FROM vehicle_services').get().n, beforeCount);
  assert.equal((await repo.getServiceCleanup(db)).length, 0);
  failDelete = true;
  await assert.rejects(() => service.createService(db, 1, form, photos), /temporary bill files/);
  assert.equal((await repo.getServiceCleanup(db)).length, 1);
  failCopy = false;
  const failedDelete = await service.createService(db, 1, form, photos);
  assert.equal((await service.deleteService(db, 1, failedDelete)).cleanupPending, true);
  assert.equal(await repo.getService(db, 1, failedDelete), null);
  assert.equal((await repo.getServiceBills(db, 1, failedDelete)).length, 0);
  raw.close(); ({ raw, db } = database(filename)); await migration.migrateDatabase(db);
  await assert.rejects(() => service.retryServiceCleanup(db), /Retry cleanup/);
  failDelete = false; await service.retryServiceCleanup(db); await service.retryServiceCleanup(db);
  assert.equal((await repo.getServiceCleanup(db)).length, 0);

  // DB failure rolls back service+metadata, retaining cleanup intent until files are removed.
  raw.exec(`CREATE TRIGGER fail_bill BEFORE INSERT ON service_bill_photos BEGIN SELECT RAISE(ABORT, 'bill insert failed'); END;`);
  await assert.rejects(() => service.createService(db, 1, form, photos), /bill insert failed/);
  raw.exec('DROP TRIGGER fail_bill');
  assert.equal((await repo.getServiceCleanup(db)).length, 0);
  assert.equal(raw.prepare('SELECT count(*) AS n FROM vehicle_services').get().n, beforeCount);

  // In-flight copies cannot be swept by cleanup or race vehicle-scoped operations.
  let release; gate = new Promise((resolve) => { release = resolve; });
  const pending = service.createService(db, 1, form, photos);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(() => service.retryServiceCleanup(db, 1));
  await assert.rejects(() => service.deleteService(db, 1, latest), /operation in progress/);
  release(); gate = null; await pending;

  // Multiple pages, including same-date ties, have no duplicates or omissions.
  for (let i = 0; i < 85; i++) await service.createService(db, 1, { ...blank, title: `Paged ${i}` }, []);
  const seen = [];
  let cursor;
  do {
    const page = await repo.getServiceHistory(db, 1, cursor);
    seen.push(...page.map((item) => item.id)); cursor = page.at(-1);
    if (page.length < repo.SERVICE_PAGE_SIZE) break;
  } while (true);
  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual(seen, raw.prepare('SELECT id FROM vehicle_services WHERE vehicle_id = 1 ORDER BY service_date DESC, created_at DESC, id DESC').all().map((row) => row.id));
  assert.ok(copies >= 6);

  // Parent deletion cascades services and bills and leaves durable file-cleanup jobs.
  await db.runAsync('DELETE FROM vehicles WHERE id = 1');
  assert.equal((await repo.getServiceHistory(db, 1)).length, 0);
  assert.equal(raw.prepare('SELECT count(*) AS n FROM service_bill_photos WHERE vehicle_id = 1').get().n, 0);
  assert.ok((await repo.getServiceCleanup(db, 1)).length > 0);
  await service.retryServiceCleanup(db, 1);
  assert.ok(await repo.getService(db, 2, other));
  const otherBill = (await repo.getServiceBills(db, 2, other))[0];
  assert.ok(fs.existsSync(fileURLToPath(otherBill.localUri)));
  assert.equal(snapshot('personal_expenses'), personalBefore);
  assert.equal(raw.prepare('PRAGMA foreign_key_check').all().length, 0);
  raw.close();
  assert.ok(path.basename(root).startsWith('lifepilot-services-'));
  fs.rmSync(root, { recursive: true });
  console.log('PASS: v4→v5 preservation, fresh schema, validation, create/read, derived costs, owner isolation, pagination, delete/cascades, bill isolation, URI safety, async copy, rollback, cleanup failure/restart/retry, operation locking.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
