import { applicationActivity, OperationSuspendedError, type OperationContext } from '@/features/activity/operation-lifecycle';
import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digest, randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { BACKUP_DATABASE_PATH, BackupError, assertSafeBackupPath, base64ToBytes, bytesToBase64, createManifest, validatePackageShape, type BackupManifestEntry, type BackupPackage } from './backup-format';

const OWNED_ROOT = 'vehicle-photos';
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes: Uint8Array) => hex(await digest(CryptoDigestAlgorithm.SHA256, Uint8Array.from(bytes).buffer));

function discover(directory: Directory, prefix: string, result: { path: string; file: File }[]) {
  for (const entry of directory.list()) {
    const path = `${prefix}/${entry.name}`;
    assertSafeBackupPath(path);
    if (entry instanceof Directory) discover(entry, path, result);
    else if (entry instanceof File) result.push({ path: `files/${path}`, file: entry });
  }
}

export type CreateBackupOptions = { destination?: File; now?: Date };
export type BackupResult = { file: File; manifest: BackupPackage['manifest']; cleanupIncomplete?: boolean };
let creatingBackup = false;

// Only internally generated, exact cache children can be recursively cleaned.
function attemptDirectory(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    throw new BackupError('unsafe-path', 'Invalid backup staging identifier.');
  }
  return new Directory(Paths.cache, `lifepilot-backup-${id}`);
}

async function capture(db: SQLiteDatabase) {
  let database: Uint8Array;
  try { database = await db.serializeAsync(); } catch { throw new BackupError('snapshot', 'Could not create a consistent database snapshot.'); }
  const schema = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (!schema) throw new BackupError('snapshot', 'Could not read the database schema.');
  const captured: { path: string; kind: BackupManifestEntry['kind']; bytes: Uint8Array }[] = [
    { path: BACKUP_DATABASE_PATH, kind: 'database', bytes: database },
  ];
  try {
    const files: { path: string; file: File }[] = [];
    // Enumerate the parent: an inaccessible owned root must not look empty.
    if (new Directory(Paths.document).list().some((entry) => entry.name === OWNED_ROOT)) {
      discover(new Directory(Paths.document, OWNED_ROOT), OWNED_ROOT, files);
    }
    for (const item of files.sort((a, b) => a.path.localeCompare(b.path))) {
      captured.push({ path: item.path, kind: 'persistent-file', bytes: await item.file.bytes() });
    }
  } catch { throw new BackupError('file-read', 'LifePilot files could not be captured.'); }
  return { captured, schemaVersion: schema.user_version };
}

export async function readVerifiedBackup(file: File): Promise<BackupPackage> {
  let pkg: unknown;
  try { pkg = JSON.parse(await file.text()); } catch { throw new BackupError('package', 'Backup package could not be read.'); }
  validatePackageShape(pkg);
  await verifyPackage(pkg);
  return pkg;
}

export async function verifyBackup(file: File): Promise<BackupPackage['manifest']> {
  return (await readVerifiedBackup(file)).manifest;
}

async function verifyPackage(pkg: BackupPackage) {
  const seen = new Set<string>();
  for (const entry of pkg.manifest.entries) {
    if (seen.has(entry.path)) throw new BackupError('integrity', 'Backup contains duplicate paths.'); seen.add(entry.path);
    const encoded = pkg.payloads[entry.path];
    if (typeof encoded !== 'string') throw new BackupError('integrity', 'Backup content is missing.');
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    if ((encoded.length / 4) * 3 - padding !== entry.size) throw new BackupError('integrity', 'Backup size metadata is invalid.');
    const bytes = base64ToBytes(encoded);
    if (bytes.length !== entry.size || await sha256(bytes) !== entry.sha256) throw new BackupError('integrity', 'Backup integrity verification failed.');
  }
  if (Object.keys(pkg.payloads).some((path) => !seen.has(path))) throw new BackupError('integrity', 'Backup contains unlisted content.');
  if (pkg.manifest.entries.filter((entry) => entry.kind === 'database' && entry.path === BACKUP_DATABASE_PATH).length !== 1 ||
      pkg.manifest.persistentFileCount !== pkg.manifest.entries.filter((entry) => entry.kind === 'persistent-file').length) {
    throw new BackupError('integrity', 'Backup manifest counts are invalid.');
  }
}

export async function createBackup(db: SQLiteDatabase, options: CreateBackupOptions = {}, context?: OperationContext): Promise<BackupResult> {
  if (creatingBackup) throw new BackupError('busy', 'A backup is already in progress.');
  if (context) throw new BackupError('snapshot', 'Backup must start outside a mutation operation.');
  if (applicationActivity.getState() !== 'normal') throw new BackupError('busy', 'LifePilot maintenance is in progress. Please wait.');
  creatingBackup = true;
  let staging: Directory | undefined, stagingId: string | undefined, stagingOwned = false;
  let output: File | undefined, outputOwned = false;
  let result: BackupResult | undefined, failure: BackupError | undefined;
  try {
    stagingId = randomUUID();
    staging = attemptDirectory(stagingId);
    if (staging.exists) throw new BackupError('package', 'Backup staging already exists. Please try again.');
    const createdAt = (options.now ?? new Date()).toISOString();
    output = options.destination ?? new File(Paths.document, `LifePilot-${createdAt.replace(/[:.]/g, '-')}.lpbackup`);
    // Creation stays private; exporting to a provider is a separate UI action.
    if (!/^[a-z0-9._-]+\.lpbackup$/i.test(output.name) || output.uri !== new File(Paths.document, output.name).uri) {
      throw new BackupError('unsafe-path', 'Backup destination must be a private LifePilot backup file.');
    }
    if (output.exists) throw new BackupError('package', 'Backup destination already exists.');
    stagingOwned = true;
    staging.create({ intermediates: true });
    const snapshot = await applicationActivity.captureSnapshot(() => capture(db));
    // All mutable source bytes are now private to this attempt. Hashing,
    // encoding, verification, output and cleanup must not hold admission closed.
    const payloads: Record<string, string> = {}, entries: BackupManifestEntry[] = [];
    for (const item of snapshot.captured) {
      payloads[item.path] = bytesToBase64(item.bytes);
      entries.push({ path: item.path, kind: item.kind, size: item.bytes.length, sha256: await sha256(item.bytes) });
    }
    const manifest = createManifest({ createdAt, appVersion: Constants.expoConfig?.version ?? 'unknown', appBuildVersion: Constants.nativeBuildVersion ?? null,
      database: { path: BACKUP_DATABASE_PATH, schemaVersion: snapshot.schemaVersion }, entries });
    const staged = new File(staging, 'backup.lpbackup'); staged.create(); staged.write(JSON.stringify({ manifest, payloads } satisfies BackupPackage));
    await verifyBackup(staged);
    // Reserve without overwrite before copying, so failure cleanup owns only
    // a file created by this attempt, never a pre-existing destination.
    output.create(); outputOwned = true;
    await staged.copy(output, { overwrite: true }); await verifyBackup(output);
    result = { file: output, manifest };
    return result;
  } catch (error) {
    failure = error instanceof BackupError ? error : error instanceof OperationSuspendedError
      ? new BackupError('busy', error.message) : new BackupError('package', 'LifePilot backup creation failed.');
    if (outputOwned && output) {
      try { output.delete(); } catch { failure.cleanupIncomplete = true; }
    }
    throw failure;
  } finally {
    try {
      if (stagingOwned && staging && stagingId) {
        const owned = attemptDirectory(stagingId);
        if (owned.uri !== staging.uri) throw new BackupError('unsafe-path', 'Invalid backup staging path.');
        // exists can be false on denied access. Enumerate the known parent so
        // an unreadable attempt is reported rather than silently "cleaned".
        if (new Directory(Paths.cache).list().some((entry) => entry.name === `lifepilot-backup-${stagingId}`)) {
          owned.delete();
          if (owned.exists) throw new BackupError('cleanup', 'Temporary backup cleanup is incomplete.');
        }
      }
    } catch {
      if (failure) failure.cleanupIncomplete = true;
      if (result) result.cleanupIncomplete = true;
    } finally { creatingBackup = false; }
  }
}
