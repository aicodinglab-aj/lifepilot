/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Error, __DEV__: false, require: (name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
function database(filename) {
  const raw = new DatabaseSync(filename);
  const db = {
    databasePath: filename.replaceAll('\\', '/'),
    options: {},
    closeAsync: async () => raw.close(),
    execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params),
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
    withTransactionAsync: async (fn) => {
      raw.exec('BEGIN');
      try { await fn(db); raw.exec('COMMIT'); }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  db.withExclusiveTransactionAsync = db.withTransactionAsync;
  return { raw, db };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifepilot-deletion-'));
  const filename = path.join(root, 'test.sqlite');
  let { raw, db } = database(filename);
  const migration = load('src/database/migrate.ts');
  const migrationSource = fs.readFileSync(path.join(__dirname, '../src/database/migrate.ts'), 'utf8');
  const migrations = [...migrationSource.matchAll(/await db\.execAsync\(`([\s\S]*?)`\)/g)];
  // Start from actual v2 with populated photos and unrelated data.
  raw.exec(migrations[0][1]); raw.exec(migrations[1][1]);
  const seed = (id) => raw.prepare(`INSERT INTO vehicles VALUES (?, 'Car', ?, 'Test', 'Deletion', NULL, 2020, 'Petrol', 0, 'now', 'now')`).run(id, `DELETE-TEST-${id}`);
  seed(1); seed(2); seed(3); seed(4);
  raw.exec(`INSERT INTO vehicle_photos VALUES ('a', 1, 'file:///arbitrary/personal/a.jpg', 1, 'now'),
    ('b', 1, 'file:///other/b.jpg', 0, 'now'), ('c', 2, 'file:///other/c.jpg', 1, 'now');
    CREATE TABLE personal_expenses (id INTEGER PRIMARY KEY, amount INTEGER);
    INSERT INTO personal_expenses VALUES (1, 12345);`);
  const beforePhotos = raw.prepare('SELECT * FROM vehicle_photos ORDER BY id').all();
  await migration.migrateDatabase(db);
  await migration.migrateDatabase(db);
  assert.deepEqual(raw.prepare('SELECT * FROM vehicle_photos ORDER BY id').all(), beforePhotos);
  assert.equal(raw.prepare('PRAGMA foreign_key_list(vehicle_photos)').get().on_delete, 'CASCADE');
  assert.equal(raw.prepare('PRAGMA foreign_key_check').all().length, 0);
  const beforeOther = raw.prepare('SELECT * FROM vehicles WHERE id = 2').get();
  let failFiles = false;
  let failRead = false;
  const deleted = [];
  class Directory {
    constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join('/'); }
    list() {
      if (failRead) throw new Error('access denied');
      return fs.readdirSync(this.uri).map((name) => ({ name }));
    }
    get exists() { return fs.existsSync(this.uri); }
    delete() {
      // Test double executes real filesystem removal, constrained to this temp fixture.
      const resolved = path.resolve(this.uri);
      assert.ok(resolved.startsWith(path.resolve(root) + path.sep));
      deleted.push(this.uri);
      if (failFiles) throw new Error('simulated filesystem failure');
      fs.rmSync(resolved, { recursive: true });
    }
  }
  const storage = load('src/storage/vehicle-photos.ts', { 'expo-file-system': { Directory, File: class {}, Paths: { document: root } } });
  const operation = load('src/features/vehicles/vehicle-operation.ts');
  const mocks = { '@/storage/vehicle-photos': storage, './vehicle-operation': operation,
    'expo-sqlite': { openDatabaseAsync: async (name, options, directory) => {
      assert.equal(options.useNewConnection, true);
      return database(path.join(directory, name)).db;
    } },
  };
  let service = load('src/features/vehicles/delete-vehicle.ts', mocks);
  const photoDir = (id) => path.join(root, 'vehicle-photos', String(id));
  for (const id of [1, 2, 4]) {
    fs.mkdirSync(photoDir(id), { recursive: true });
    fs.writeFileSync(path.join(photoDir(id), 'a.jpg'), 'test fixture');
    fs.writeFileSync(path.join(photoDir(id), 'b.jpg'), 'test fixture');
  }
  for (const id of [0, -1, NaN, 1.2, Infinity, '../2', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(() => service.deleteVehicle(db, id));
  }
  assert.equal(deleted.length, 0);
  await service.deleteVehicle(db, 999);
  assert.equal(deleted.length, 0, 'nonexistent vehicle must not authorize directory removal');
  await service.deleteVehicle(db, 3);
  assert.equal(raw.prepare('SELECT id FROM vehicles WHERE id = 3').get(), undefined);
  await service.deleteVehicle(db, 1);
  assert.equal(raw.prepare('SELECT id FROM vehicles WHERE id = 1').get(), undefined);
  assert.equal(raw.prepare('SELECT * FROM vehicle_photos WHERE vehicle_id = 1').all().length, 0);
  assert.equal(fs.existsSync(photoDir(1)), false);
  assert.equal(fs.readFileSync(path.join(photoDir(2), 'a.jpg'), 'utf8'), 'test fixture');
  assert.deepEqual(raw.prepare('SELECT * FROM vehicles WHERE id = 2').get(), beforeOther);
  assert.deepEqual(raw.prepare('SELECT * FROM vehicle_photos WHERE vehicle_id = 2').get(), beforePhotos[2]);
  assert.equal(raw.prepare('SELECT amount FROM personal_expenses').get().amount, 12345);
  assert.equal(raw.prepare('SELECT * FROM vehicle_deletion_cleanup').all().length, 0);
  // A restrictive future child causes a full DB rollback before files are touched.
  raw.exec('CREATE TABLE restrictive_child (vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE RESTRICT); INSERT INTO restrictive_child VALUES (4)');
  const deletionCount = deleted.length;
  await assert.rejects(() => service.deleteVehicle(db, 4));
  assert.equal(deleted.length, deletionCount);
  assert.ok(raw.prepare('SELECT id FROM vehicles WHERE id = 4').get());
  assert.equal(raw.prepare('SELECT * FROM vehicle_deletion_cleanup').all().length, 0);
  raw.exec('DROP TABLE restrictive_child');
  // Filesystem failure persists a retry job; a real DB reopen simulates restart.
  failFiles = true;
  await assert.rejects(() => service.deleteVehicle(db, 4), /cleanup is incomplete/);
  assert.equal(raw.prepare('SELECT id FROM vehicles WHERE id = 4').get(), undefined);
  assert.equal(raw.prepare('SELECT vehicle_id FROM vehicle_deletion_cleanup').get().vehicle_id, 4);
  assert.ok(fs.existsSync(photoDir(4)));
  raw.close(); ({ raw, db } = database(filename));
  await migration.migrateDatabase(db);
  service = load('src/features/vehicles/delete-vehicle.ts', mocks);
  assert.equal(raw.prepare('SELECT id FROM vehicles WHERE id IN (1, 3, 4)').all().length, 0);
  await assert.rejects(() => service.retryVehicleCleanup(db), /Retry cleanup/);
  failFiles = false;
  failRead = true;
  await assert.rejects(() => service.retryVehicleCleanup(db));
  assert.equal(raw.prepare('SELECT vehicle_id FROM vehicle_deletion_cleanup').get().vehicle_id, 4);
  failRead = false;
  const runAsync = db.runAsync;
  db.runAsync = async (sql, params) => {
    if (sql.startsWith('DELETE FROM vehicle_deletion_cleanup')) throw new Error('acknowledgement failed');
    return runAsync(sql, params);
  };
  await assert.rejects(() => service.retryVehicleCleanup(db));
  assert.equal(fs.existsSync(photoDir(4)), false);
  assert.equal(raw.prepare('SELECT vehicle_id FROM vehicle_deletion_cleanup').get().vehicle_id, 4);
  db.runAsync = runAsync;
  await service.retryVehicleCleanup(db);
  await service.retryVehicleCleanup(db);
  assert.equal(fs.existsSync(photoDir(4)), false);
  assert.equal(raw.prepare('SELECT * FROM vehicle_deletion_cleanup').all().length, 0);
  // Refuse an unexpected live-vehicle cleanup job.
  raw.exec("INSERT INTO vehicle_deletion_cleanup VALUES (2, 'now')");
  await assert.rejects(() => service.retryVehicleCleanup(db));
  assert.ok(fs.existsSync(photoDir(2)));
  raw.exec('DELETE FROM vehicle_deletion_cleanup WHERE vehicle_id = 2');
  // Guard prevents a deletion racing a pending photo import.
  let release;
  const pending = operation.withVehicleOperation(2, () => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(() => service.deleteVehicle(db, 2), /operation in progress/);
  release(); await pending;
  assert.ok(raw.prepare('SELECT id FROM vehicles WHERE id = 2').get());
  raw.close();
  // Remove only this newly created test fixture directory.
  assert.ok(path.basename(root).startsWith('lifepilot-deletion-'));
  fs.rmSync(root, { recursive: true });
  console.log('PASS: v2 preservation, CASCADE, empty/multiple photos, exact owned directory, isolation, personal sentinel, invalid IDs, DB rollback, filesystem failure, durable restart retry, live-vehicle guard, concurrent operation guard.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
