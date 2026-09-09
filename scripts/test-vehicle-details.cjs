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
    execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params),
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    runAsync: async (sql, params = []) => {
      const result = raw.prepare(sql).run(...params);
      return { ...result, lastInsertRowId: Number(result.lastInsertRowid) };
    },
    withTransactionAsync: async (fn) => {
      raw.exec('BEGIN');
      try { await fn(db); raw.exec('COMMIT'); }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  return { raw, db };
}
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifepilot-details-'));
  const filename = path.join(root, 'test.sqlite');
  let { raw, db } = database(filename);
  const migration = load('src/database/migrate.ts');
  const vehicle = load('src/features/vehicles/vehicle.ts');
  const details = load('src/features/vehicles/vehicle-details.ts', { './vehicle': vehicle });
  const repo = load('src/database/vehicles.ts');
  const operation = load('src/features/vehicles/vehicle-operation.ts');
  const service = load('src/features/vehicles/details-service.ts', {
    '@/database/vehicles': repo, './vehicle-details': details, './vehicle-operation': operation,
  });
  const migrationSource = fs.readFileSync(path.join(__dirname, '../src/database/migrate.ts'), 'utf8');
  const migrations = [...migrationSource.matchAll(/await db\.execAsync\(`([\s\S]*?)`\)/g)];
  // Populate the actual previous (v3) schema before migrating.
  for (const item of migrations.slice(0, 3)) raw.exec(item[1]);
  const draft = { vehicleType: 'Car', registrationNumber: 'ORIGINAL', make: 'Honda', model: 'City', variant: null, modelYear: 2020, fuelType: 'Petrol', odometerKm: 0 };
  const firstId = await repo.insertVehicle(db, draft);
  const otherId = await repo.insertVehicle(db, { ...draft, registrationNumber: 'OTHER' });
  raw.exec(`INSERT INTO vehicle_photos VALUES ('photo1', ${firstId}, 'file:///owned/cover.jpg', 1, 'before');
    INSERT INTO vehicle_deletion_cleanup VALUES (999, 'before');`);
  const photosBefore = raw.prepare('SELECT * FROM vehicle_photos').all();
  const jobsBefore = raw.prepare('SELECT * FROM vehicle_deletion_cleanup').all();
  const vehiclesBefore = raw.prepare('SELECT * FROM vehicles ORDER BY id').all();
  await migration.migrateDatabase(db); await migration.migrateDatabase(db);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 4);
  for (const row of vehiclesBefore) {
    const after = raw.prepare('SELECT * FROM vehicles WHERE id = ?').get(row.id);
    for (const key of Object.keys(row)) assert.equal(after[key], row[key]);
  }
  assert.deepEqual(raw.prepare('SELECT * FROM vehicle_photos').all(), photosBefore);
  assert.deepEqual(raw.prepare('SELECT * FROM vehicle_deletion_cleanup').all(), jobsBefore);
  assert.equal(raw.prepare('PRAGMA foreign_key_list(vehicle_photos)').get().on_delete, 'CASCADE');
  const before = (await repo.getVehicles(db, firstId))[0];
  assert.equal(before.coverPhotoId, 'photo1');
  assert.equal(before.coverPhotoUri, 'file:///owned/cover.jpg');
  const form = details.vehicleToDetailsForm(before);
  for (const section of details.vehicleDetailSections) for (const field of section.fields) {
    if (field.optional) {
      assert.equal(form[field.key], '');
      assert.equal(details.vehicleDetailValue(before, field.key), 'Not added');
    }
  }
  assert.equal(details.vehicleDetailValue(before, 'odometerKm'), '0 km');
  const changed = { ...form, make: ' Toyota ', model: ' New model ', variant: ' Premium ', modelYear: '2023',
    registrationNumber: ' changed ', fuelType: 'Hybrid', odometerKm: '12345.6', chassisNumber: ' VIN123 ',
    engineNumber: ' ENGINE123 ', engineCapacity: '1498', transmission: 'Automatic', color: 'Blue',
    purchaseDate: '2024-02-29', purchasePrice: '1250000.50', dealer: 'Dealer', warrantyValidUntil: '2027-02-28', notes: 'First line\nSecond line' };
  const otherBefore = JSON.stringify((await repo.getVehicles(db, otherId))[0]);
  assert.equal(Object.keys(details.validateVehicleDetails(changed)).length, 0);
  await service.saveVehicleDetails(db, firstId, changed);
  let saved = (await repo.getVehicles(db, firstId))[0];
  assert.equal(saved.registrationNumber, 'CHANGED');
  assert.equal(saved.make, 'Toyota');
  assert.equal(saved.model, 'New model');
  assert.equal(saved.purchasePrice, 1250000.5);
  assert.equal(saved.engineCapacity, 1498);
  assert.equal(saved.purchaseDate, '2024-02-29');
  assert.equal(saved.notes, 'First line\nSecond line');
  assert.equal(saved.createdAt, before.createdAt);
  assert.equal(saved.coverPhotoId, before.coverPhotoId);
  assert.equal(JSON.stringify((await repo.getVehicles(db, otherId))[0]), otherBefore);
  const savedSnapshot = JSON.stringify(saved);
  // Case-insensitive duplicate update must leave every field unchanged.
  await assert.rejects(() => service.saveVehicleDetails(db, firstId, { ...changed, registrationNumber: 'other' }), /registration number already exists/);
  assert.equal(JSON.stringify((await repo.getVehicles(db, firstId))[0]), savedSnapshot);
  for (const [key, value] of [
    ['modelYear', '1885'], ['modelYear', '20e3'], ['odometerKm', '-1'], ['odometerKm', '9'.repeat(400)],
    ['purchasePrice', '-2'], ['purchasePrice', 'Infinity'], ['engineCapacity', '0'], ['engineCapacity', 'NaN'],
    ['purchaseDate', '2023-02-29'], ['purchaseDate', '2024-02-30'], ['purchaseDate', '01/02/2024'],
    ['warrantyValidUntil', '2020-01-01'], ['registrationNumber', ' '], ['make', ' '], ['model', ' '],
  ]) {
    const invalid = { ...changed, [key]: value };
    assert.ok(details.validateVehicleDetails(invalid)[key], `${key} should reject ${value}`);
    await assert.rejects(() => service.saveVehicleDetails(db, firstId, invalid));
  }
  assert.equal(JSON.stringify((await repo.getVehicles(db, firstId))[0]), savedSnapshot);
  // Persist across an actual database close/reopen.
  raw.close(); ({ raw, db } = database(filename)); await migration.migrateDatabase(db);
  saved = (await repo.getVehicles(db, firstId))[0];
  assert.equal(JSON.stringify(saved), savedSnapshot);
  assert.equal(details.vehicleDetailValue({ ...saved, purchasePrice: 0 }, 'purchasePrice'), '₹0');
  const cleared = details.vehicleToDetailsForm(saved);
  for (const section of details.vehicleDetailSections) for (const field of section.fields) if (field.optional) cleared[field.key] = ' ';
  await service.saveVehicleDetails(db, firstId, cleared);
  const empty = (await repo.getVehicles(db, firstId))[0];
  for (const section of details.vehicleDetailSections) for (const field of section.fields) if (field.optional) assert.equal(empty[field.key], null);
  await assert.rejects(() => service.saveVehicleDetails(db, 123456, changed), /no longer exists/);
  await assert.rejects(() => service.saveVehicleDetails(db, -1, changed), /Invalid vehicle/);
  assert.deepEqual(raw.prepare('SELECT * FROM vehicle_photos').all(), photosBefore);
  assert.deepEqual(raw.prepare('SELECT * FROM vehicle_deletion_cleanup').all(), jobsBefore);
  // Relational deletion still cascades after an edit; the deletion suite exercises full service + filesystem.
  await db.runAsync('DELETE FROM vehicles WHERE id = ?', [firstId]);
  assert.equal(raw.prepare('SELECT * FROM vehicle_photos').all().length, 0);
  assert.equal(JSON.stringify((await repo.getVehicles(db, otherId))[0]), otherBefore);
  raw.close();
  assert.ok(path.basename(root).startsWith('lifepilot-details-'));
  fs.rmSync(root, { recursive: true });
  console.log('PASS: populated v3→v4 preservation, missing values, complete read/update mapping, validation, optional clearing, duplicate rollback, real restart persistence, cover preservation, vehicle isolation, cascade after edit.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
