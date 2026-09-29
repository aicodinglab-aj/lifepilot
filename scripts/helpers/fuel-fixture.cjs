const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');
const { createLoader } = require('./load-typescript.cjs');

// Real SQLite databases and bytes; Expo filesystem/native APIs remain adapters.
function fixture(mocks = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifepilot-fuel-'));
  const connections = new Set();
  let beforeRun = async () => {}, beforeClose = async () => {};
  function owned(target) {
    const resolved = path.resolve(target);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) throw Error('Test path escaped owned workspace');
    return resolved;
  }
  function database(filename = path.join(root, `${crypto.randomUUID()}.db`)) {
    owned(filename);
    const raw = new DatabaseSync(filename);
    let closed = false;
    const db = { raw, databasePath: filename.replaceAll('\\', '/'), options: {},
      execAsync: async sql => raw.exec(sql),
      getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
      getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
      runAsync: async (sql, params = []) => { await beforeRun(sql, params); const r = raw.prepare(sql).run(...params); return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) }; },
      withTransactionAsync: async action => { raw.exec('BEGIN'); try { await action(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } },
      closeAsync: async () => { if (!closed) { await beforeClose(); raw.close(); closed = true; connections.delete(db); } },
      serializeAsync: async () => { const output = owned(path.join(root, `${crypto.randomUUID()}.snapshot`)); await backup(raw, output); return new Uint8Array(fs.readFileSync(output)); },
    };
    connections.add(db); return db;
  }
  const target = base => typeof base === 'string' ? (base.startsWith('file:') ? fileURLToPath(base) : base) : base.path;
  class Directory {
    constructor(base, ...parts) { this.path = owned(path.join(target(base), ...parts)); }
    get uri() { return pathToFileURL(this.path).href; }
    get name() { return path.basename(this.path); }
    get exists() { return fs.existsSync(this.path); }
    create(options = {}) { fs.mkdirSync(this.path, { recursive: !!(options.intermediates || options.idempotent) }); }
    list() { return fs.readdirSync(this.path, { withFileTypes: true }).map(e => e.isDirectory() ? new Directory(this, e.name) : new File(this, e.name)); }
    delete() { fs.rmSync(owned(this.path), { recursive: true }); }
  }
  class File {
    constructor(base, ...parts) { this.path = owned(path.join(target(base), ...parts)); }
    get uri() { return pathToFileURL(this.path).href; }
    get name() { return path.basename(this.path); }
    get parentDirectory() { return new Directory(path.dirname(this.path)); }
    get exists() { return fs.existsSync(this.path); }
    get size() { return fs.statSync(this.path).size; }
    create() { fs.writeFileSync(this.path, '', { flag: 'wx' }); }
    write(value) { fs.writeFileSync(this.path, value); }
    async bytes() { return new Uint8Array(fs.readFileSync(this.path)); }
    async text() { return fs.readFileSync(this.path, 'utf8'); }
    async copy(destination) { fs.copyFileSync(this.path, destination.path); }
    delete() { fs.unlinkSync(owned(this.path)); }
  }
  const document = new Directory(path.join(root, 'document')), cache = new Directory(path.join(root, 'cache'));
  document.create(); cache.create();
  const load = createLoader({
    'expo-sqlite': {
      openDatabaseAsync: async (name, _options, directory) => database(path.join(directory, name)),
      deserializeDatabaseAsync: async bytes => { const filename = owned(path.join(root, `${crypto.randomUUID()}.db`)); fs.writeFileSync(filename, bytes); return database(filename); },
      backupDatabaseAsync: async ({ sourceDatabase, destDatabase }) => backup(sourceDatabase.raw, destDatabase.databasePath),
    },
    'expo-file-system': { File, Directory, Paths: { document, cache } },
    'expo-constants': { default: { expoConfig: { version: '1.0.0' }, nativeBuildVersion: null } },
    'expo-crypto': { randomUUID: crypto.randomUUID, CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: async (_type, bytes) => {
      const digest = crypto.createHash('sha256').update(new Uint8Array(bytes)).digest();
      return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
    } },
    ...mocks,
  });
  return { root, database, load, File, Directory, document,
    interceptRun(callback) { beforeRun = callback; }, interceptClose(callback) { beforeClose = callback; },
    async dispose() {
      beforeClose = async () => {};
      for (const db of [...connections]) await db.closeAsync();
      const resolved = path.resolve(root);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('lifepilot-fuel-')) throw Error('Unsafe test cleanup');
      fs.rmSync(resolved, { recursive: true });
    },
  };
}
module.exports = { fixture };
