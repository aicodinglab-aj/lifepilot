const assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const { fixture } = require('./helpers/fuel-fixture.cjs');
const { createLoader } = require('./helpers/load-typescript.cjs');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let checks = 0, finished = false;
process.on('beforeExit', () => { if (!finished) { console.error('FAIL: backup race tests did not finish'); process.exitCode = 1; } });
const hash = async (_type, bytes) => { const b = crypto.createHash('sha256').update(new Uint8Array(bytes)).digest(); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const nativeCrypto = { randomUUID: crypto.randomUUID, CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: hash };
async function test(name, action, mocks = {}) {
  const f = fixture({ 'expo-image-picker': {}, 'react-native': {}, ...mocks });
  try {
    const db = f.database(); await f.load('src/database/migrate.ts').migrateDatabase(db);
    db.withExclusiveTransactionAsync = action => db.withTransactionAsync(() => action(db));
    const activity = f.load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const service = f.load('src/features/backup/backup-service.ts');
    await action({ f, db, activity, service }); checks++; console.log(`PASS: ${name}`);
  } catch (error) { console.error(name, error); throw error; }
  finally { await f.dispose(); }
}
const vehicle = { vehicleType: 'Car', registrationNumber: 'TEST', make: 'A', model: 'B', variant: null, modelYear: 2026, fuelType: 'Petrol', odometerKm: 1 };
const photoId = '11111111-1111-4111-8111-111111111111';
async function seed({ f, db }) {
  const id = await f.load('src/database/vehicles.ts').insertVehicle(db, vehicle);
  const source = new f.File(f.document, 'picked.jpg'); source.create(); source.write(new Uint8Array([4, 5, 6]));
  const photos = f.load('src/features/vehicles/photo-service.ts');
  await photos.saveSelectedVehiclePhotos(db, id, [{ id: photoId, uri: source.uri }]);
  return { id, source, photos };
}
function balanced(activity) { assert.equal(activity.getState(), 'normal'); assert.equal(activity.getActiveCount(), 0); }
async function main() {
  await test('running repository write drains before serialization; new DB/media work is rejected', async ({ f, db, activity, service }) => {
    const entered = deferred(), release = deferred(), events = [];
    f.interceptRun(async () => { entered.resolve(); await release.promise; events.push('write'); });
    const repo = f.load('src/database/vehicles.ts');
    const write = repo.insertVehicle(db, vehicle); await entered.promise;
    const serialize = db.serializeAsync; db.serializeAsync = async () => { events.push('snapshot'); assert.equal(activity.getActiveCount(), 0); return serialize(); };
    const pending = service.createBackup(db); pending.catch(() => {});
    assert.equal(activity.getState(), 'snapshot-draining'); assert.deepEqual(events, []);
    await assert.rejects(repo.insertVehicle(db, vehicle), /maintenance/);
    await assert.rejects(f.load('src/features/vehicles/photo-service.ts').saveSelectedVehiclePhotos(db, 1, []), /maintenance/);
    release.resolve(); await write; await pending;
    assert.deepEqual(events, ['write', 'snapshot']); balanced(activity);
  });
  await test('running actual photo copy and nested metadata finish before snapshot', async ({ f, db, activity, service }) => {
    const id = await f.load('src/database/vehicles.ts').insertVehicle(db, vehicle);
    const source = new f.File(f.document, 'picked.jpg'); source.create(); source.write(new Uint8Array([7]));
    const entered = deferred(), release = deferred(), original = f.File.prototype.copy;
    f.File.prototype.copy = async function(destination) { if (this.uri === source.uri) { entered.resolve(); await release.promise; } return original.call(this, destination); };
    const write = f.load('src/features/vehicles/photo-service.ts').saveSelectedVehiclePhotos(db, id, [{ id: photoId, uri: source.uri }]);
    await entered.promise;
    let captured = false; const serialize = db.serializeAsync;
    db.serializeAsync = async () => { captured = true; assert.ok(await db.getFirstAsync('SELECT id FROM vehicle_photos')); return serialize(); };
    const backup = service.createBackup(db); assert.equal(captured, false); assert.equal(activity.getState(), 'snapshot-draining');
    release.resolve(); await write; const result = await backup;
    assert.equal(result.manifest.persistentFileCount, 1); balanced(activity);
  });
  const hashing = deferred(), finishHash = deferred(); let hashOnce = true;
  await test('real SQLite/media archive stays consistent; mutation resumes before hashing completes', async ({ f, db, activity, service }) => {
    const { id, photos } = await seed({ f, db });
    const readEntered = deferred(), finishRead = deferred(), original = f.File.prototype.bytes;
    f.File.prototype.bytes = async function() {
      if (this.uri.includes('/vehicle-photos/')) { assert.equal(activity.getState(), 'snapshot'); readEntered.resolve(); await finishRead.promise; }
      return original.call(this);
    };
    const pending = service.createBackup(db); await readEntered.promise;
    await assert.rejects(photos.removeVehiclePhoto(db, id, photoId), /maintenance/);
    await assert.rejects(f.load('src/database/vehicles.ts').insertVehicle(db, vehicle), /maintenance/);
    assert.throws(() => activity.suspend(), /maintenance/);
    assert.throws(() => activity.assertExclusive({ dataAccessSuspended: true }), /exclusive/);
    finishRead.resolve(); await hashing.promise; balanced(activity);
    await assert.rejects(service.createBackup(db), e => e.code === 'busy');
    await photos.removeVehiclePhoto(db, id, photoId);
    assert.equal(await db.getFirstAsync('SELECT id FROM vehicle_photos'), null);
    // Restore may own the app after capture. Finishing packaging must not release it.
    const owner = await activity.suspend(); finishHash.resolve();
    const result = await pending; activity.assertExclusive(owner.authorization); owner.resume();
    const pkg = await service.readVerifiedBackup(result.file);
    const format = f.load('src/features/backup/backup-format.ts');
    const snapshotPath = path.join(f.root, 'captured.db'); fs.writeFileSync(snapshotPath, format.base64ToBytes(pkg.payloads['database/lifepilot.db']));
    const snapshot = f.database(snapshotPath), row = await snapshot.getFirstAsync('SELECT id FROM vehicle_photos');
    assert.equal(row.id, photoId);
    assert.deepEqual([...format.base64ToBytes(pkg.payloads[`files/vehicle-photos/${id}/${photoId}.jpg`])], [4, 5, 6]);
    balanced(activity);
  }, { 'expo-crypto': { ...nativeCrypto, digest: async (...args) => { if (hashOnce) { hashOnce = false; hashing.resolve(); await finishHash.promise; } return hash(...args); } } });

  for (const failure of ['serialize', 'schema', 'discovery', 'file-read', 'staging', 'package-write', 'hash', 'verification', 'output-copy']) {
    await test(`${failure} failure releases admission and attempt ownership`, async ({ f, db, activity, service }) => {
      await seed({ f, db });
      const original = { serialize: db.serializeAsync, schema: db.getFirstAsync, list: f.Directory.prototype.list, read: f.File.prototype.bytes,
        create: f.Directory.prototype.create, write: f.File.prototype.write, text: f.File.prototype.text, copy: f.File.prototype.copy };
      const fail = () => { throw Error('injected failure'); };
      if (failure === 'serialize') db.serializeAsync = fail;
      if (failure === 'schema') db.getFirstAsync = fail;
      if (failure === 'discovery') f.Directory.prototype.list = function() { if (this.uri === f.document.uri) return fail(); return original.list.call(this); };
      if (failure === 'file-read') f.File.prototype.bytes = fail;
      if (failure === 'staging') f.Directory.prototype.create = fail;
      if (failure === 'package-write') f.File.prototype.write = fail;
      if (failure === 'verification') f.File.prototype.text = fail;
      if (failure === 'output-copy') f.File.prototype.copy = fail;
      await assert.rejects(service.createBackup(db)); balanced(activity);
      assert.equal(fs.readdirSync(path.join(f.root, 'cache')).length, 0);
      await activity.run(async () => {}); balanced(activity);
      Object.assign(db, { serializeAsync: original.serialize, getFirstAsync: original.schema });
      Object.assign(f.Directory.prototype, { list: original.list, create: original.create });
      Object.assign(f.File.prototype, { bytes: original.read, write: original.write, text: original.text, copy: original.copy });
      // A later attempt must be admitted, even when the first failed.
      if (failure !== 'hash') await service.createBackup(db, { destination: new f.File(f.document, 'retry.lpbackup') });
    }, failure === 'hash' ? { 'expo-crypto': { ...nativeCrypto, digest: async () => { throw Error('hash failure'); } } } : {});
  }
  await test('near-simultaneous calls reject busy without touching first attempt; later attempts isolate staging', async ({ f, db, activity, service }) => {
    const entered = deferred(), release = deferred(), serialize = db.serializeAsync;
    const staging = [], originalCreate = f.Directory.prototype.create;
    f.Directory.prototype.create = function(...args) { if (this.uri.includes('/cache/lifepilot-backup-')) staging.push(this.uri); return originalCreate.apply(this, args); };
    db.serializeAsync = async () => { entered.resolve(); await release.promise; return serialize(); };
    const one = service.createBackup(db, { destination: new f.File(f.document, 'one.lpbackup') }); await entered.promise;
    await assert.rejects(service.createBackup(db), e => e.code === 'busy');
    assert.equal(staging.length, 1); assert.equal(activity.getState(), 'snapshot');
    release.resolve(); const first = await one;
    const firstBytes = await first.file.text();
    await f.load('src/database/vehicles.ts').insertVehicle(db, vehicle);
    const second = await service.createBackup(db, { destination: new f.File(f.document, 'two.lpbackup') });
    assert.equal(staging.length, 2); assert.notEqual(staging[0], staging[1]);
    assert.equal(await first.file.text(), firstBytes);
    const format = f.load('src/features/backup/backup-format.ts');
    for (const [result, count] of [[first, 0], [second, 1]]) {
      const pkg = await service.readVerifiedBackup(result.file), filename = path.join(f.root, `${count}.db`);
      fs.writeFileSync(filename, format.base64ToBytes(pkg.payloads['database/lifepilot.db']));
      assert.equal((await f.database(filename).getFirstAsync('SELECT COUNT(*) AS n FROM vehicles')).n, count);
    }
    balanced(activity);
  });
  const collisionId = '22222222-2222-4222-8222-222222222222';
  await test('staging collision, unknown output and recovery artifacts are never deleted', async ({ f, db, activity, service }) => {
    const stage = new f.Directory(path.join(f.root, 'cache'), `lifepilot-backup-${collisionId}`); stage.create();
    const sentinel = new f.File(stage, 'keep'); sentinel.create(); sentinel.write('keep');
    const recovery = new f.Directory(f.document, 'lifepilot-recovery', 'restore-old'); recovery.create({ intermediates: true });
    const evidence = new f.File(recovery, 'previous.db'); evidence.create(); evidence.write('evidence');
    await assert.rejects(service.createBackup(db), /staging already exists/);
    assert.equal(await sentinel.text(), 'keep'); assert.equal(await evidence.text(), 'evidence'); balanced(activity);
    stage.delete();
    await assert.rejects(service.createBackup(db, { destination: new f.File(recovery, 'bad.lpbackup') }), e => e.code === 'unsafe-path');
    const existing = new f.File(f.document, 'existing.lpbackup'); existing.create(); existing.write('original');
    await assert.rejects(service.createBackup(db, { destination: existing }), /already exists/);
    assert.equal(await existing.text(), 'original'); assert.equal(await evidence.text(), 'evidence'); balanced(activity);
  }, { 'expo-crypto': { ...nativeCrypto, randomUUID: () => collisionId } });
  for (const primaryFailure of [false, true]) {
    await test(`cleanup failure is separate and admission resumes (primary failure: ${primaryFailure})`, async ({ f, db, activity, service }) => {
      const list = f.Directory.prototype.list;
      if (primaryFailure) f.Directory.prototype.list = function() { if (this.uri.endsWith('/cache')) throw Error('cleanup parent unreadable'); return list.call(this); };
      else f.Directory.prototype.delete = function() { throw Error('cleanup blocked'); };
      if (primaryFailure) db.serializeAsync = async () => { throw Error('serialize'); };
      if (primaryFailure) await assert.rejects(service.createBackup(db), e => e.code === 'snapshot' && e.cleanupIncomplete);
      else { const result = await service.createBackup(db); assert.equal(result.cleanupIncomplete, true); await service.verifyBackup(result.file); }
      balanced(activity); await activity.run(async () => {});
      assert.equal(fs.readdirSync(path.join(f.root, 'cache')).length, 1);
      const retained = fs.readdirSync(path.join(f.root, 'cache'))[0];
      db.serializeAsync = async () => new Uint8Array([1, 2, 3]);
      await service.createBackup(db, { destination: new f.File(f.document, 'later.lpbackup') });
      assert.ok(fs.existsSync(path.join(f.root, 'cache', retained)), 'later attempt must not sweep failed cleanup');
      assert.equal(fs.readdirSync(path.join(f.root, 'cache')).length, 2); balanced(activity);
    });
  }
  await test('all current media subtrees are captured; backups/recovery/unrelated files excluded', async ({ f, db, activity, service }) => {
    const { id, source } = await seed({ f, db });
    const recordId = '33333333-3333-4333-8333-333333333333';
    await activity.run(async () => {
      await f.load('src/storage/service-bills.ts').copyServiceBill(id, recordId, photoId, source.uri);
      for (const kind of ['insurance', 'puc']) await f.load('src/storage/coverage-documents.ts').copyCoverageDocument({ kind, vehicleId: id, recordId, documentId: photoId }, source.uri);
    });
    const result = await service.createBackup(db);
    const paths = result.manifest.entries.filter(e => e.kind === 'persistent-file').map(e => e.path);
    assert.equal(paths.length, 4);
    for (const suffix of [`${photoId}.jpg`, `service-bills/${recordId}/${photoId}.jpg`, `insurance/${recordId}/${photoId}/image.jpg`, `puc/${recordId}/${photoId}/image.jpg`]) {
      assert.ok(paths.includes(`files/vehicle-photos/${id}/${suffix}`));
    }
    assert.ok(paths.every(p => p.startsWith('files/vehicle-photos/'))); balanced(activity);
  });
  await test('invalid staging ID cannot target another directory', async ({ f, db, activity, service }) => {
    await assert.rejects(service.createBackup(db), e => e.code === 'unsafe-path');
    assert.equal(fs.readdirSync(path.join(f.root, 'cache')).length, 0); balanced(activity);
  }, { 'expo-crypto': { ...nativeCrypto, randomUUID: () => '../lifepilot-recovery' } });
  await test('nested capture rejects without self-deadlock; restore drain and retained owner reject backup', async ({ db, activity, service }) => {
    await activity.run(async context => {
      await assert.rejects(service.createBackup(db, {}, context), /outside a mutation/);
      await assert.rejects(activity.captureSnapshot(async () => {}, context), /cannot nest/);
      assert.equal(activity.getState(), 'normal'); assert.equal(activity.getActiveCount(), 1);
    }); balanced(activity);
    const lease = activity.acquire(), pending = activity.suspend();
    await assert.rejects(service.createBackup(db), e => e.code === 'busy');
    assert.equal(activity.getState(), 'suspending'); lease.release(); const owner = await pending;
    owner.retain(); await assert.rejects(service.createBackup(db), e => e.code === 'busy');
    activity.assertExclusive(owner.authorization); assert.throws(() => owner.resume());
  });
  // Independent coordinator proves rejection cannot resume somebody else's capture.
  const c = createLoader()('src/features/activity/operation-lifecycle.ts').createActivityCoordinator();
  const gate = deferred(), entered = deferred();
  const capture = c.captureSnapshot(async () => { entered.resolve(); await gate.promise; }); await entered.promise;
  await assert.rejects(c.captureSnapshot(async () => assert.fail('second capture started')), /maintenance/);
  assert.equal(c.getState(), 'snapshot'); gate.resolve(); await capture; balanced(c);
  checks++; console.log('PASS: rejected snapshot cannot release current snapshot ownership');
  finished = true; console.log(`PASS: ${checks} deterministic backup consistency/concurrency scenarios (no sleeps).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
