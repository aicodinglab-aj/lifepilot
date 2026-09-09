/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Error, __DEV__: false, require: (name) => {
    if (name in mocks) return mocks[name];
    if (name === './vehicle-operation') return load('src/features/vehicles/vehicle-operation.ts');
    throw new Error(`Unexpected runtime dependency: ${name}`);
  } });
  return exports;
}

function database() {
  const raw = new DatabaseSync(':memory:');
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
  db.withExclusiveTransactionAsync = db.withTransactionAsync;
  return { db, raw };
}

async function main() {
  const migration = load('src/database/migrate.ts');
  const repo = load('src/database/vehicle-photos.ts');
  const vehicles = load('src/database/vehicles.ts');
  const { db, raw } = database();
  // Upgrade an actual v1 schema, preserving its vehicle.
  const source = fs.readFileSync(path.join(__dirname, '../src/database/migrate.ts'), 'utf8');
  raw.exec(source.match(/await db\.execAsync\(`([\s\S]*?)`\)/)[1]);
  await vehicles.insertVehicle(db, { vehicleType: 'Car', registrationNumber: 'TEST', make: 'Test', model: 'One', variant: null, modelYear: 2020, fuelType: 'Petrol', odometerKm: 0 });
  await migration.migrateDatabase(db);
  await migration.migrateDatabase(db);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal((await vehicles.getVehicles(db)).length, 1);
  await vehicles.insertVehicle(db, { vehicleType: 'Car', registrationNumber: 'OTHER', make: 'Test', model: 'Two', variant: null, modelYear: 2020, fuelType: 'Petrol', odometerKm: 0 });
  const photo = (id, vehicleId) => ({ id, vehicleId, localUri: `file:///${id}.jpg`, isCover: 0, createdAt: '2026-09-08' });
  await repo.insertPhoto(db, photo('a', 1));
  await repo.insertPhoto(db, photo('b', 1));
  await repo.insertPhoto(db, photo('c', 2));
  await assert.rejects(() => repo.insertPhoto(db, photo('invalid', 999)));
  await assert.rejects(() => db.runAsync('UPDATE vehicle_photos SET is_cover = 1 WHERE id = ?', ['b']));
  await assert.rejects(() => repo.setCoverPhoto(db, 1, 'c'));
  await repo.setCoverPhoto(db, 1, 'b');
  assert.equal((await vehicles.getVehicles(db, 1))[0].coverPhotoId, 'b');
  await repo.deletePhotoRecord(db, 1, 'c');
  assert.equal((await repo.getVehiclePhotos(db, 2)).length, 1);
  await repo.deletePhotoRecord(db, 1, 'b');
  assert.equal((await repo.getVehiclePhotos(db, 1))[0].isCover, 1);
  await repo.deletePhotoRecord(db, 1, 'a');
  assert.equal((await vehicles.getVehicles(db, 1))[0].coverPhotoUri, null);
  const fresh = database();
  await migration.migrateDatabase(fresh.db);
  assert.equal(fresh.raw.prepare('PRAGMA user_version').get().user_version, 4);
  fresh.raw.exec('PRAGMA user_version = 5');
  await assert.rejects(() => migration.migrateDatabase(fresh.db));

  class Directory {
    constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join('/'); }
  }
  class File extends Directory { get exists() { return false; } }
  const storage = load('src/storage/vehicle-photos.ts', { 'expo-file-system': { Directory, File, Paths: { document: 'file:///app/documents' } } });
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const uri = `file:///old/documents/vehicle-photos/1/${id}.jpg`;
  assert.equal(storage.ownedPhotoFile(1, id, uri).uri, `file:///app/documents/vehicle-photos/1/${id}.jpg`);
  assert.throws(() => storage.ownedPhotoFile(2, id, uri));
  assert.throws(() => storage.ownedPhotoFile(1, id, `file:///vehicle-photos/1/../vehicle-photos/1/${id}.jpg`));
  assert.throws(() => storage.ownedPhotoFile(1, id, `file:///outside/${id}.jpg`));
  assert.equal(storage.availablePhotoUri(1, id, uri), null);
  // Real Expo Go URI shape: the scope directory itself contains escaped %40/%2F.
  // The old blanket /%/ rejection hid successfully copied files on every view.
  const disk = new Map();
  const paths = { document: 'file:///data/user/0/host.exp.exponent/files/ExperienceData/%2540anonymous%252Flifepilot-test' };
  class PhotoDirectory extends Directory { create() {} }
  class PhotoFile extends Directory {
    get exists() { return disk.has(this.uri); }
    get size() { return disk.get(this.uri) ?? 0; }
    async copy(destination) { await Promise.resolve(); disk.set(destination.uri, this.size); }
    delete() { disk.delete(this.uri); }
  }
  const photoMocks = { 'expo-file-system': { Directory: PhotoDirectory, File: PhotoFile, Paths: paths } };
  const photoStorage = load('src/storage/vehicle-photos.ts', photoMocks);
  disk.set('file:///cache/picked.jpeg', 384154);
  const savedUri = await photoStorage.copyPhoto(1, id, 'file:///cache/picked.jpeg');
  assert.ok(savedUri.includes('%2540anonymous%252F'));
  await repo.insertPhoto(db, { id, vehicleId: 1, localUri: savedUri, isCover: 0, createdAt: '2026-09-08' });
  const savedPhoto = (await repo.getVehiclePhotos(db, 1))[0];
  assert.equal(photoStorage.availablePhotoUri(1, id, savedPhoto.localUri), savedUri);
  assert.equal((await vehicles.getVehicles(db, 1))[0].coverPhotoUri, savedUri);
  const restartedStorage = load('src/storage/vehicle-photos.ts', photoMocks);
  assert.equal(restartedStorage.availablePhotoUri(1, id, savedPhoto.localUri), savedUri);
  paths.document = 'file:///new-sandbox/Documents/My%20App';
  const rebasedUri = `${paths.document}/vehicle-photos/1/${id}.jpeg`;
  disk.set(rebasedUri, 384154);
  assert.equal(restartedStorage.availablePhotoUri(1, id, savedUri), rebasedUri);
  assert.equal((await repo.getVehiclePhotos(db, 1))[0].localUri, savedUri, 'recovery preserves the original record');
  for (const invalid of [
    savedUri.replace('/vehicle-photos/1/', '/vehicle-photos/2/'),
    savedUri.replace('/vehicle-photos/', '/%2e%2e/vehicle-photos/'),
    savedUri.replace('/vehicle-photos/', '/outside%2fchild/vehicle-photos/'),
    savedUri.replace('/vehicle-photos/', '/outside%5cchild/vehicle-photos/'),
    savedUri.replace('/vehicle-photos/', '/bad%zz/vehicle-photos/'),
    savedUri.replace('file:///', 'content:///'),
    savedUri.replace('file:///', 'file://remote/'),
    `${savedUri}?query`, `${savedUri}#fragment`,
  ]) assert.throws(() => restartedStorage.ownedPhotoFile(1, id, invalid));
  assert.equal(restartedStorage.availablePhotoUri(1, id, savedUri.replace('.jpeg', '.png')), null);
  assert.equal(disk.size, 3, 'resolution must never move or delete files');
  console.log('PASS: encoded Expo Go URI copy → SQLite → cover/gallery resolution, restart, safe sandbox rebasing, malformed/unsafe path rejection.');
  let fileExists = true;
  let failFileDelete = false;
  let failDatabaseDelete = false;
  let records = [{ id, vehicleId: 1, localUri: uri }];
  const events = [];
  const service = load('src/features/vehicles/photo-service.ts', {
    'expo-crypto': { randomUUID: () => id },
    'expo-image-picker': { launchImageLibraryAsync: async () => ({ canceled: true }) },
    'react-native': { Platform: { OS: 'android' } },
    '@/database/vehicle-photos': {
      getVehiclePhotos: async (_, vehicleId) => records.filter((photo) => photo.vehicleId === vehicleId),
      deletePhotoRecord: async () => {
        events.push('database');
        if (failDatabaseDelete) throw new Error('database failure');
        records = [];
      },
    },
    '@/storage/vehicle-photos': {
      ownedPhotoFile: () => ({
        get exists() { return fileExists; },
        delete() {
          events.push('file');
          if (failFileDelete) throw new Error('storage failure');
          fileExists = false;
        },
      }),
    },
  });
  await service.addVehiclePhotos(db, 1, false);
  assert.equal(events.length, 0, 'cancel must not write anything');
  await service.removeVehiclePhoto(db, 2, id);
  assert.equal(events.length, 0, 'wrong vehicle must not touch a file');
  failFileDelete = true;
  await assert.rejects(() => service.removeVehiclePhoto(db, 1, id));
  assert.equal(records.length, 1, 'file failure must preserve row');
  failFileDelete = false;
  failDatabaseDelete = true;
  await assert.rejects(() => service.removeVehiclePhoto(db, 1, id));
  assert.equal(fileExists, false);
  assert.equal(records.length, 1);
  failDatabaseDelete = false;
  await service.removeVehiclePhoto(db, 1, id);
  assert.equal(records.length, 0, 'retry must remove missing-file row');
  const importEvents = [];
  let failCopy = false;
  let failPhotoId;
  let failInsert = false;
  let nextId = 0;
  const imports = load('src/features/vehicles/photo-service.ts', {
    'expo-crypto': { randomUUID: () => `selection-${++nextId}` },
    'expo-image-picker': {
      launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'cache:first.jpg' }, { uri: 'cache:second.jpg' }] }),
      requestCameraPermissionsAsync: async () => ({ granted: false }),
    },
    'react-native': { Platform: { OS: 'android' } },
    '@/database/vehicle-photos': {
      ...repo,
      insertPhoto: async (...args) => {
        if (failInsert) throw new Error('insert failure');
        return repo.insertPhoto(...args);
      },
    },
    '@/storage/vehicle-photos': {
      copyPhoto: (vehicleId, photoId) => {
        assert.ok(raw.prepare('SELECT id FROM vehicles WHERE id = ?').get(vehicleId), 'vehicle must exist before any copy');
        importEvents.push(photoId);
        if (failCopy || photoId === failPhotoId) throw new Error('copy failure');
        return `file:///documents/vehicle-photos/${vehicleId}/${photoId}.jpg`;
      },
      ownedPhotoFile: () => ({ exists: true, delete: () => importEvents.push('cleanup') }),
    },
  });
  const selected = await imports.pickVehiclePhotos(false);
  assert.equal(selected.length, 2);
  assert.equal(importEvents.length, 0, 'selection must not persist photos');
  await assert.rejects(() => imports.pickVehiclePhotos(true), /Camera access/);
  const creator = load('src/features/vehicles/create-vehicle.ts', {
    '@/database/vehicles': vehicles,
    './photo-service': imports,
  });
  const draft = { vehicleType: 'Car', registrationNumber: 'CREATE', make: 'Test', model: 'Photos', variant: null, modelYear: 2020, fuelType: 'Petrol', odometerKm: 0 };
  const result = await creator.createVehicleWithPhotos(db, draft, selected, selected[1].id);
  assert.equal(result.photoError, null);
  assert.ok(Number.isSafeInteger(result.vehicleId));
  assert.equal((await vehicles.getVehicles(db, result.vehicleId))[0].coverPhotoId, selected[1].id);
  assert.equal((await repo.getVehiclePhotos(db, result.vehicleId)).length, 2);
  const count = importEvents.length;
  await assert.rejects(() => creator.createVehicleWithPhotos(db, draft, selected));
  assert.equal(importEvents.length, count, 'failed vehicle insert must not copy photos');
  failCopy = true;
  const failed = await creator.createVehicleWithPhotos(db, { ...draft, registrationNumber: 'COPY-FAIL' }, selected);
  assert.ok(failed.photoError);
  assert.equal((await vehicles.getVehicles(db, failed.vehicleId)).length, 1);
  assert.equal((await repo.getVehiclePhotos(db, failed.vehicleId)).length, 0);
  failCopy = false;
  failInsert = true;
  const insertFailed = await creator.createVehicleWithPhotos(db, { ...draft, registrationNumber: 'INSERT-FAIL' }, selected);
  assert.ok(insertFailed.photoError);
  assert.equal(importEvents.at(-1), 'cleanup');
  assert.equal((await vehicles.getVehicles(db, insertFailed.vehicleId)).length, 1);
  assert.equal((await repo.getVehiclePhotos(db, insertFailed.vehicleId)).length, 0);
  failInsert = false;
  const partialSelection = await imports.pickVehiclePhotos(false);
  failPhotoId = partialSelection[0].id;
  const partial = await creator.createVehicleWithPhotos(db, { ...draft, registrationNumber: 'PARTIAL' }, partialSelection, partialSelection[1].id);
  assert.match(partial.photoError, /1 photos saved/);
  assert.equal((await repo.getVehiclePhotos(db, partial.vehicleId)).length, 1);
  assert.equal((await vehicles.getVehicles(db, partial.vehicleId))[0].coverPhotoId, partialSelection[1].id);
  const empty = await creator.createVehicleWithPhotos(db, { ...draft, registrationNumber: 'NO-PHOTOS' }, []);
  assert.equal(empty.photoError, null);
  assert.equal((await repo.getVehiclePhotos(db, empty.vehicleId)).length, 0);
  raw.close(); fresh.raw.close();
  console.log('PASS: draft selection, camera denial, vehicle ID, create-before-copy, selected cover, duplicate vehicle, photo failure preserves vehicle, failed insert cleanup.');
  console.log('PASS: migrations, preservation, foreign keys, cover constraints/promotion, vehicle isolation, path validation, missing files, cancellation, deletion failure/retry.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
