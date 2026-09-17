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
    databasePath: filename.replaceAll('\\', '/'), options: {}, closeAsync: async () => raw.close(),
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifepilot-coverage-'));
  const filename = path.join(root, 'test.sqlite');
  let { raw, db } = database(filename);
  const migration = load('src/database/migrate.ts');
  const migrations = [...fs.readFileSync(path.join(__dirname, '../src/database/migrate.ts'), 'utf8').matchAll(/await db\.execAsync\(`([\s\S]*?)`\)/g)];
  for (const step of migrations.slice(0, 5)) raw.exec(step[1]);
  for (const id of [1, 2]) raw.prepare(`INSERT INTO vehicles
    (id, vehicle_type, registration_number, make, model, model_year, fuel_type, odometer_km, created_at, updated_at)
    VALUES (?, 'Car', ?, 'Test', 'Model', 2020, 'Petrol', 500, 'before', 'before')`).run(id, `COVERAGE-${id}`);
  raw.exec(`INSERT INTO vehicle_photos VALUES ('gallery', 1, 'file:///gallery.jpg', 1, 'before');
    INSERT INTO vehicle_services(id, vehicle_id, service_date, odometer, title, parts_cost, created_at, updated_at)
    VALUES ('existing-service', 1, '2026-01-01', 100, 'Preserved service', 123, 'before', 'before');
    INSERT INTO service_bill_photos VALUES ('existing-bill', 1, 'existing-service', 'file:///bill.jpg', 'before');
    INSERT INTO service_bill_cleanup VALUES (999, 'existing-cleanup', 'before');
    CREATE TABLE personal_expenses (id INTEGER PRIMARY KEY, amount INTEGER);
    INSERT INTO personal_expenses VALUES (1, 456);`);
  const snapshot = (table) => JSON.stringify(raw.prepare(`SELECT * FROM ${table}`).all());
  const preservedTables = ['vehicles', 'vehicle_photos', 'vehicle_services', 'service_bill_photos', 'service_bill_cleanup', 'personal_expenses'];
  const before = Object.fromEntries(preservedTables.map((table) => [table, snapshot(table)]));
  await migration.migrateDatabase(db); await migration.migrateDatabase(db);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 7);
  for (const table of preservedTables) assert.equal(snapshot(table), before[table]);
  const fresh = database(':memory:'); await migration.migrateDatabase(fresh.db);
  assert.equal(fresh.raw.prepare('PRAGMA user_version').get().user_version, 7);
  fresh.raw.exec('PRAGMA user_version = 8'); await assert.rejects(() => migration.migrateDatabase(fresh.db)); fresh.raw.close();
  // A failed additive migration rolls back entirely and retains the old version/data.
  const failedMigration = database(':memory:');
  for (const step of migrations.slice(0, 5)) failedMigration.raw.exec(step[1]);
  await assert.rejects(() => migration.migrateDatabase({ ...failedMigration.db, execAsync: async (sql) => {
    if (sql.includes('CREATE TABLE vehicle_insurance')) { failedMigration.raw.exec('CREATE TABLE migration_partial(id INTEGER)'); throw new Error('disk full'); }
    return failedMigration.db.execAsync(sql);
  } }));
  assert.equal(failedMigration.raw.prepare('PRAGMA user_version').get().user_version, 5);
  assert.equal(failedMigration.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'migration_partial'").get().n, 0);
  failedMigration.raw.close();

  const status = load('src/features/vehicles/coverage-status.ts');
  const domain = load('src/features/vehicles/coverage-record.ts', { './coverage-status': status });
  let failClose = false;
  const sqlite = { openDatabaseAsync: async (name, options, directory) => {
    assert.equal(options.useNewConnection, true);
    const connection = database(path.join(directory, name)); connection.raw.exec('PRAGMA foreign_keys = OFF');
    return { ...connection.db, closeAsync: async () => { await connection.db.closeAsync(); if (failClose) throw new Error('close failed'); } };
  } };
  const repo = load('src/database/vehicle-coverage.ts', { 'expo-sqlite': sqlite, '@/features/vehicles/coverage-record': domain, '@/features/vehicles/coverage-status': status });
  let failCopy = false, failDelete = false, failRead = false, gate = null;
  const documentRoot = path.join(root, 'documents'); fs.mkdirSync(documentRoot);
  const documentUri = pathToFileURL(documentRoot).href;
  class Directory {
    constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join('/'); }
    get exists() { return fs.existsSync(fileURLToPath(this.uri)); }
    create() { fs.mkdirSync(fileURLToPath(this.uri), { recursive: true }); }
    list() {
      if (failRead) throw new Error('access denied');
      return fs.readdirSync(fileURLToPath(this.uri)).map((name) => ({ name }));
    }
    delete() {
      const target = path.resolve(fileURLToPath(this.uri));
      assert.ok(target.startsWith(path.resolve(documentRoot) + path.sep));
      if (failDelete) throw new Error('storage unavailable');
      fs.rmSync(target, { recursive: true });
    }
  }
  class File extends Directory {
    get size() { return this.exists ? fs.statSync(fileURLToPath(this.uri)).size : 0; }
    async copy(destination) {
      if (gate) await gate;
      fs.writeFileSync(fileURLToPath(destination.uri), 'document fixture');
      if (failCopy) throw new Error('copy failed');
    }
  }
  const storage = load('src/storage/coverage-documents.ts', {
    'expo-file-system': { Directory, File, Paths: { document: documentUri } }, '@/features/vehicles/coverage-record': domain,
  });
  const operation = load('src/features/vehicles/vehicle-operation.ts');
  const service = load('src/features/vehicles/coverage-service.ts', {
    'expo-crypto': { randomUUID }, '@/database/vehicle-coverage': repo, '@/storage/coverage-documents': storage,
    './coverage-record': domain, './vehicle-operation': operation,
  });
  const insurance = { ...domain.emptyCoverageForm, provider: ' Test insurer ', number: ' POLICY-1 ', policyType: 'Comprehensive',
    startDate: '2026-01-01', expiryDate: '2027-01-01', amount: '1200.50', notes: 'Policy notes' };
  const puc = { ...domain.emptyCoverageForm, number: 'PUC-1', provider: 'Test center', startDate: '2026-01-01', expiryDate: '2026-12-01', amount: '100', notes: 'Certificate notes' };
  const photos = [{ id: randomUUID(), uri: 'file:///source/one.jpg' }, { id: randomUUID(), uri: 'file:///source/two%20photo.png' }];
  for (const [expiry, start, today, expected] of [
    ['2026-02-01', null, '2026-01-01', 'Valid'], ['2026-01-31', null, '2026-01-01', 'Expiring soon'],
    ['2026-01-01', null, '2026-01-01', 'Expiring soon'], ['2025-12-31', null, '2026-01-01', 'Expired'],
    ['2027-01-01', '2026-02-01', '2026-01-01', 'Not started'], ['2027-01-01', '2026-01-01', '2026-01-01', 'Valid'],
    ['2024-02-29', null, '2024-02-28', 'Expiring soon'], ['2026-03-10', null, '2026-03-09', 'Expiring soon'],
    ['2025-02-29', null, '2025-02-28', 'Not added'], [null, null, '2026-01-01', 'Not added'],
    ['2026-01-01', '2026-01-02', '2026-01-01', 'Not added'], ['2027-01-01', 'bad', '2026-01-01', 'Not added'],
  ]) assert.equal(status.coverageStatus(expiry, start, today), expected);
  assert.equal(status.localToday(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
  assert.equal(status.coverageDate('2027-02-15'), '15 Feb 2027');
  assert.equal(status.coverageDate(null), 'Not added');
  for (const kind of ['insurance', 'puc']) {
    const form = kind === 'insurance' ? insurance : puc;
    for (const [key, value] of [['expiryDate', ''], ['expiryDate', '2026-02-30'], ['startDate', '2025-02-29'],
      ['expiryDate', '2025-12-31'], ['amount', '-1'], ['amount', 'NaN'], ['amount', 'Infinity'], ['amount', '1.001'], ['amount', '1e2']]) {
      assert.ok(domain.validateCoverageForm(kind, { ...form, [key]: value })[key]);
      await assert.rejects(() => service.saveCoverage(db, kind, 1, { ...form, [key]: value }, []));
    }
  }
  assert.ok(domain.validateCoverageForm('insurance', { ...insurance, provider: ' ' }).provider);
  assert.ok(domain.validateCoverageForm('insurance', { ...insurance, number: ' ' }).number);
  assert.equal(Object.keys(domain.validateCoverageForm('puc', { ...domain.emptyCoverageForm, expiryDate: '2028-02-29' })).length, 0);
  const a = await service.saveCoverage(db, 'insurance', 1, insurance, photos);
  const aPuc = await service.saveCoverage(db, 'puc', 1, puc, photos);
  const b = await service.saveCoverage(db, 'insurance', 2, insurance, photos);
  const bPuc = await service.saveCoverage(db, 'puc', 2, puc, photos);
  let saved = await repo.getCoverageRecord(db, 'insurance', 1, a.id);
  assert.equal(saved.provider, 'Test insurer'); assert.equal(saved.number, 'POLICY-1'); assert.equal(saved.amount, 1200.5);
  assert.equal(saved.notes, insurance.notes); assert.equal(saved.policyType, 'Comprehensive');
  assert.equal((await repo.getCoverageRecord(db, 'puc', 1, aPuc.id)).provider, 'Test center');
  assert.equal(await repo.getCoverageRecord(db, 'insurance', 2, a.id), null);
  assert.equal((await repo.getCoverageDocuments(db, 'insurance', 2, a.id)).length, 0);
  assert.equal(await repo.getCoverageRecord(db, 'puc', 1, a.id), null);
  const oldDocs = await repo.getCoverageDocuments(db, 'insurance', 1, a.id);
  assert.equal(oldDocs.length, 2);
  assert.ok(storage.availableCoverageDocumentUri('insurance', oldDocs[0]));
  assert.equal(storage.availableCoverageDocumentUri('puc', oldDocs[0]), null);
  assert.equal((await repo.getCoverageCleanup(db)).length, 0);
  await assert.rejects(() => db.runAsync("INSERT INTO insurance_documents VALUES (?, 2, ?, 'file:///bad.jpg', 'now')", [randomUUID(), a.id]));
  await assert.rejects(() => db.runAsync("INSERT INTO puc_documents VALUES (?, 1, ?, 'file:///bad.jpg', 'now')", [randomUUID(), a.id]));
  await assert.rejects(() => service.saveCoverage(db, 'insurance', 2, insurance, [], { id: a.id, revision: 1, removedDocumentIds: [] }));
  await assert.rejects(() => service.saveCoverage(db, 'puc', 999, puc, []));

  // Editing preserves ID/history, supports custom policy types and applies attachment changes atomically.
  const changed = { ...insurance, provider: 'Updated insurer', policyType: 'Custom policy', amount: '0', notes: '', startDate: '' };
  const result = await service.saveCoverage(db, 'insurance', 1, changed, photos.slice(0, 1), { id: a.id, revision: saved.revision, removedDocumentIds: [oldDocs[0].id] });
  assert.equal(result.id, a.id); assert.equal((await repo.getCoverageHistory(db, 'insurance', 1)).length, 1);
  const updated = await repo.getCoverageRecord(db, 'insurance', 1, a.id);
  assert.equal(updated.revision, 2); assert.equal(updated.createdAt, saved.createdAt); assert.equal(updated.policyType, 'Custom policy');
  assert.equal(updated.amount, 0); assert.equal(updated.notes, null); assert.equal(updated.startDate, null);
  const newDocs = await repo.getCoverageDocuments(db, 'insurance', 1, a.id);
  assert.equal(newDocs.length, 2); assert.ok(newDocs.some((doc) => doc.id === oldDocs[1].id));
  assert.equal(fs.existsSync(fileURLToPath(oldDocs[0].localUri)), false);
  assert.ok(fs.existsSync(fileURLToPath(oldDocs[1].localUri)));
  await assert.rejects(() => service.saveCoverage(db, 'insurance', 1, insurance, [], { id: a.id, revision: 1, removedDocumentIds: [] }), /changed/);
  const otherDoc = (await repo.getCoverageDocuments(db, 'insurance', 2, b.id))[0];
  await assert.rejects(() => service.saveCoverage(db, 'insurance', 1, insurance, [], { id: a.id, revision: 2, removedDocumentIds: [otherDoc.id] }));
  assert.equal((await repo.getCoverageRecord(db, 'insurance', 1, a.id)).revision, 2);
  const pucSaved = await repo.getCoverageRecord(db, 'puc', 1, aPuc.id);
  await service.saveCoverage(db, 'puc', 1, { ...domain.emptyCoverageForm, expiryDate: '2026-12-31' }, [], { id: aPuc.id, revision: pucSaved.revision, removedDocumentIds: [] });
  assert.equal((await repo.getCoverageRecord(db, 'puc', 1, aPuc.id)).amount, null);

  const older = await service.saveCoverage(db, 'insurance', 1, { ...insurance, startDate: '2024-01-01', expiryDate: '2025-01-01' }, []);
  const future = await service.saveCoverage(db, 'insurance', 1, { ...insurance, startDate: '2027-01-02', expiryDate: '2028-01-01' }, []);
  assert.equal((await repo.getCoverageHistory(db, 'insurance', 1))[0].id, future.id);
  assert.equal((await repo.getCurrentCoverage(db, 'insurance', 1, '2026-09-16')).id, a.id);
  assert.equal((await repo.getCurrentCoverage(db, 'insurance', 1, '2027-01-02')).id, future.id);
  assert.ok(await repo.getCoverageRecord(db, 'insurance', 1, older.id));
  assert.equal((await repo.getCoverageHistory(db, 'insurance', 2)).length, 1);

  // Copy and DB failures during edits preserve the original record and every attachment.
  const beforeEdit = JSON.stringify(await repo.getCoverageRecord(db, 'insurance', 1, a.id));
  const beforeDocs = JSON.stringify(await repo.getCoverageDocuments(db, 'insurance', 1, a.id));
  failCopy = true;
  await assert.rejects(() => service.saveCoverage(db, 'insurance', 1, insurance, photos, { id: a.id, revision: 2, removedDocumentIds: [oldDocs[1].id] }), /copy failed/);
  failCopy = false;
  raw.exec("CREATE TRIGGER fail_doc BEFORE INSERT ON insurance_documents BEGIN SELECT RAISE(ABORT, 'insert failed'); END;");
  await assert.rejects(() => service.saveCoverage(db, 'insurance', 1, insurance, photos, { id: a.id, revision: 2, removedDocumentIds: [oldDocs[1].id] }), /insert failed/);
  raw.exec('DROP TRIGGER fail_doc');
  assert.equal(JSON.stringify(await repo.getCoverageRecord(db, 'insurance', 1, a.id)), beforeEdit);
  assert.equal(JSON.stringify(await repo.getCoverageDocuments(db, 'insurance', 1, a.id)), beforeDocs);
  assert.ok(fs.existsSync(fileURLToPath(oldDocs[1].localUri)));
  assert.equal((await repo.getCoverageCleanup(db)).length, 0);
  failClose = true;
  const closed = await service.saveCoverage(db, 'insurance', 1, insurance, []);
  failClose = false; assert.ok(await repo.getCoverageRecord(db, 'insurance', 1, closed.id));
  failClose = true;
  await service.deleteCoverage(db, 'insurance', 1, closed.id);
  failClose = false; assert.equal(await repo.getCoverageRecord(db, 'insurance', 1, closed.id), null);

  // A successful edit with a failed file cleanup is still saved exactly once.
  const cleanupEdit = await service.saveCoverage(db, 'puc', 1, puc, photos);
  const editDocs = await repo.getCoverageDocuments(db, 'puc', 1, cleanupEdit.id);
  failDelete = true;
  const editedPending = await service.saveCoverage(db, 'puc', 1, { ...puc, notes: 'Saved with pending cleanup' }, [],
    { id: cleanupEdit.id, revision: 1, removedDocumentIds: [editDocs[0].id] });
  assert.equal(editedPending.id, cleanupEdit.id); assert.equal(editedPending.cleanupPending, true);
  assert.equal((await repo.getCoverageRecord(db, 'puc', 1, cleanupEdit.id)).revision, 2);
  assert.equal((await repo.getCoverageDocuments(db, 'puc', 1, cleanupEdit.id)).length, 1);
  failDelete = false; await service.retryCoverageCleanup(db, 1);
  assert.equal(fs.existsSync(fileURLToPath(editDocs[0].localUri)), false);
  assert.ok(fs.existsSync(fileURLToPath(editDocs[1].localUri)));

  // Recovery jobs survive an interrupted copy or deletion and are safe after a restart.
  failCopy = true; failDelete = true;
  await assert.rejects(() => service.saveCoverage(db, 'puc', 1, puc, photos), /cleanup is pending/);
  failCopy = false;
  const doomed = await service.saveCoverage(db, 'insurance', 1, insurance, photos);
  assert.equal((await service.deleteCoverage(db, 'insurance', 1, doomed.id)).cleanupPending, true);
  assert.equal(await repo.getCoverageRecord(db, 'insurance', 1, doomed.id), null);
  raw.close(); ({ raw, db } = database(filename)); await migration.migrateDatabase(db);
  await assert.rejects(() => service.retryCoverageCleanup(db));
  failDelete = false; await service.retryCoverageCleanup(db); await service.retryCoverageCleanup(db);
  assert.equal((await repo.getCoverageCleanup(db)).length, 0);

  const liveDoc = (await repo.getCoverageDocuments(db, 'insurance', 1, a.id))[0];
  const job = { kind: 'insurance', vehicleId: 1, recordId: a.id, documentId: liveDoc.id };
  await repo.queueCoverageCleanup(db, job); await assert.rejects(() => service.retryCoverageCleanup(db));
  assert.ok(fs.existsSync(fileURLToPath(liveDoc.localUri))); await repo.clearCoverageCleanup(db, job);
  const suffix = `vehicle-photos/1/insurance/${a.id}/${liveDoc.id}/image.jpg`;
  assert.equal(storage.ownedCoverageDocumentFile(job, `file:///old/%40scope%25/${suffix}`).uri, `${documentUri}/${suffix}`);
  for (const uri of [`file:///old/../${suffix}`, `file:///old/%2e%2e/${suffix}`, `file:///old/%2f/${suffix}`,
    `file:///old/%5c/${suffix}`, `file:///old/%00/${suffix}`, `file:///old/%/${suffix}`, `file:///old/${suffix}?x`,
    `file:///old/${suffix}#x`, `content:///old/${suffix}`, `file:///old/${suffix.replace('/1/', '/2/')}`,
    `file:///old/${suffix.replace('insurance', 'puc')}`, `file:///old/${suffix.replace('insurance', 'service-bills')}`]) {
    assert.throws(() => storage.ownedCoverageDocumentFile(job, uri), uri);
  }
  await assert.rejects(() => storage.deleteCoverageDocumentFiles({ ...job, recordId: '../x' }));
  await assert.rejects(() => storage.deleteCoverageDocumentFiles({ ...job, kind: 'service-bills' }));
  failRead = true; await assert.rejects(() => storage.deleteCoverageDocumentFiles(job)); failRead = false;

  // Operation lock prevents cleanup or edits racing an in-flight async copy.
  let release; gate = new Promise((resolve) => { release = resolve; });
  const copying = service.saveCoverage(db, 'puc', 1, puc, photos);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(() => service.retryCoverageCleanup(db, 1));
  await assert.rejects(() => service.deleteCoverage(db, 'puc', 1, aPuc.id), /operation in progress/);
  release(); gate = null; await copying;

  // Deletion must preserve every other domain and ignore malicious metadata URIs.
  const sentinel = path.join(documentRoot, 'personal.jpg'); fs.writeFileSync(sentinel, 'personal');
  const normalGallery = path.join(documentRoot, 'vehicle-photos', '1', 'gallery.jpg'); fs.writeFileSync(normalGallery, 'gallery');
  const serviceDirectory = path.join(documentRoot, 'vehicle-photos', '1', 'service-bills'); fs.mkdirSync(serviceDirectory, { recursive: true });
  const serviceFile = path.join(serviceDirectory, 'bill.jpg'); fs.writeFileSync(serviceFile, 'service');
  const beforePuc = snapshot('vehicle_puc'), beforePucDocs = snapshot('puc_documents');
  const beforeB = JSON.stringify(await repo.getCoverageRecord(db, 'insurance', 2, b.id));
  await db.runAsync('UPDATE insurance_documents SET local_uri = ? WHERE id = ?', [pathToFileURL(sentinel).href, liveDoc.id]);
  await service.deleteCoverage(db, 'insurance', 2, a.id); assert.ok(await repo.getCoverageRecord(db, 'insurance', 1, a.id));
  raw.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON vehicle_insurance BEGIN SELECT RAISE(ABORT, 'delete failed'); END;");
  await assert.rejects(() => service.deleteCoverage(db, 'insurance', 1, a.id)); raw.exec('DROP TRIGGER fail_delete');
  assert.ok(await repo.getCoverageRecord(db, 'insurance', 1, a.id));
  await service.deleteCoverage(db, 'insurance', 1, a.id);
  assert.equal((await repo.getCoverageDocuments(db, 'insurance', 1, a.id)).length, 0);
  assert.equal(snapshot('vehicle_puc'), beforePuc); assert.equal(snapshot('puc_documents'), beforePucDocs);
  assert.equal(JSON.stringify(await repo.getCoverageRecord(db, 'insurance', 2, b.id)), beforeB);
  for (const table of preservedTables) assert.equal(snapshot(table), before[table]);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'personal'); assert.equal(fs.readFileSync(normalGallery, 'utf8'), 'gallery');
  assert.equal(fs.readFileSync(serviceFile, 'utf8'), 'service');
  const insuranceBeforePucDelete = snapshot('vehicle_insurance');
  await service.deleteCoverage(db, 'puc', 1, aPuc.id);
  assert.equal(snapshot('vehicle_insurance'), insuranceBeforePucDelete); assert.ok(await repo.getCoverageRecord(db, 'puc', 2, bPuc.id));

  // Paginated history includes ties exactly once.
  for (let i = 0; i < 45; i++) await service.saveCoverage(db, 'puc', 1, { ...puc, number: `PAGE-${i}` }, []);
  const seen = []; let cursor;
  do {
    const page = await repo.getCoverageHistory(db, 'puc', 1, cursor);
    seen.push(...page.map((item) => item.id)); cursor = page.at(-1);
    if (page.length < repo.COVERAGE_PAGE_SIZE) break;
  } while (true);
  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual(seen, raw.prepare('SELECT id FROM vehicle_puc WHERE vehicle_id = 1 ORDER BY expiry_date DESC, created_at DESC, id DESC').all().map((row) => row.id));
  // Parent vehicle deletion cascades both record types and document metadata, leaving durable cleanup.
  await db.runAsync('DELETE FROM vehicles WHERE id = 1');
  for (const kind of ['insurance', 'puc']) {
    assert.equal((await repo.getCoverageHistory(db, kind, 1)).length, 0);
    assert.equal(raw.prepare(`SELECT count(*) AS n FROM ${kind}_documents WHERE vehicle_id = 1`).get().n, 0);
  }
  await service.retryCoverageCleanup(db, 1);
  assert.ok(await repo.getCoverageRecord(db, 'insurance', 2, b.id));
  assert.ok(fs.existsSync(fileURLToPath(otherDoc.localUri)));
  assert.equal(snapshot('personal_expenses'), before.personal_expenses);
  assert.equal(raw.prepare('PRAGMA foreign_key_check').all().length, 0);
  raw.close(); assert.ok(path.basename(root).startsWith('lifepilot-coverage-')); fs.rmSync(root, { recursive: true });
  console.log('PASS: populated v5→v6 preservation and rollback, fresh schema, Insurance/PUC create/edit/history, status/date boundaries, vehicle/domain isolation, document edits, safe paths/deletion, DB/copy/cleanup failures, restart retry, locks, pagination and vehicle cascades.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
