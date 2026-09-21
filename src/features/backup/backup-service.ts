import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { BACKUP_DATABASE_PATH, BackupError, base64ToBytes, bytesToBase64, createManifest, validatePackageShape, type BackupManifestEntry, type BackupPackage } from './backup-format';

const OWNED_ROOT = 'vehicle-photos';
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes: Uint8Array) => hex(await digest(CryptoDigestAlgorithm.SHA256, Uint8Array.from(bytes).buffer));

function discover(directory: Directory, prefix: string, result: { path: string; file: File }[]) {
  if (!directory.exists) return;
  for (const entry of directory.list()) {
    const path = `${prefix}/${entry.name}`;
    if (entry instanceof Directory) discover(entry, path, result);
    else if (entry instanceof File) result.push({ path: `files/${path}`, file: entry });
  }
}

export type CreateBackupOptions = { destination?: File; now?: Date };
export type BackupResult = { file: File; manifest: BackupPackage['manifest'] };

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

export async function createBackup(db: SQLiteDatabase, options: CreateBackupOptions = {}): Promise<BackupResult> {
  const staging = new Directory(Paths.cache, 'lifepilot-backup-staging');
  const createdAt = (options.now ?? new Date()).toISOString();
  const output = options.destination ?? new File(Paths.document, `LifePilot-${createdAt.replace(/[:.]/g, '-')}.lpbackup`);
  if (output.exists) throw new BackupError('package', 'Backup destination already exists.');
  try {
    if (staging.exists) staging.delete(); staging.create({ intermediates: true });
    let database: Uint8Array;
    try { database = await db.serializeAsync(); } catch { throw new BackupError('snapshot', 'Could not create a consistent database snapshot.'); }
    const schema = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const files: { path: string; file: File }[] = []; discover(new Directory(Paths.document, OWNED_ROOT), OWNED_ROOT, files);
    const payloads: Record<string, string> = { [BACKUP_DATABASE_PATH]: bytesToBase64(database) };
    const entries: BackupManifestEntry[] = [{ path: BACKUP_DATABASE_PATH, kind: 'database', size: database.length, sha256: await sha256(database) }];
    for (const item of files.sort((a, b) => a.path.localeCompare(b.path))) {
      let bytes: Uint8Array; try { bytes = await item.file.bytes(); } catch { throw new BackupError('file-read', 'A persistent LifePilot file could not be read.'); }
      payloads[item.path] = bytesToBase64(bytes); entries.push({ path: item.path, kind: 'persistent-file', size: bytes.length, sha256: await sha256(bytes) });
    }
    const manifest = createManifest({ createdAt, appVersion: Constants.expoConfig?.version ?? 'unknown', appBuildVersion: Constants.nativeBuildVersion ?? null,
      database: { path: BACKUP_DATABASE_PATH, schemaVersion: schema?.user_version ?? 0 }, entries });
    const staged = new File(staging, 'backup.lpbackup'); staged.create(); staged.write(JSON.stringify({ manifest, payloads } satisfies BackupPackage));
    await verifyBackup(staged); await staged.copy(output); await verifyBackup(output);
    try { staging.delete(); } catch {
      if (output.exists) output.delete();
      throw new BackupError('cleanup', 'Backup staging cleanup failed.');
    }
    return { file: output, manifest };
  } catch (error) {
    if (output.exists) output.delete();
    if (error instanceof BackupError) throw error;
    throw new BackupError('package', 'LifePilot backup creation failed.');
  } finally {
    try { if (staging.exists) staging.delete(); } catch { /* Preserve the primary typed failure; source data is never touched. */ }
  }
}
