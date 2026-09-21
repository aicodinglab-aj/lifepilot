export const BACKUP_FORMAT = 'com.dmjlabs.lifepilot.backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_DATABASE_PATH = 'database/lifepilot.db';
export const BACKUP_FILES_PREFIX = 'files/vehicle-photos/';

export type BackupEntryKind = 'database' | 'persistent-file';
export type BackupManifestEntry = {
  path: string;
  kind: BackupEntryKind;
  size: number;
  sha256: string;
};
export type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  createdAt: string;
  appVersion: string;
  appBuildVersion: string | null;
  database: { path: typeof BACKUP_DATABASE_PATH; schemaVersion: number };
  persistentFileCount: number;
  entries: BackupManifestEntry[];
};
export type BackupPackage = {
  manifest: BackupManifest;
  payloads: Record<string, string>;
};

export class BackupError extends Error {
  constructor(public readonly code: 'snapshot' | 'file-read' | 'package' | 'integrity' | 'unsupported-format' | 'unsafe-path' | 'incompatible-schema' | 'extraction' | 'database-validation' | 'rollback-preparation' | 'replacement' | 'migration' | 'rollback' | 'cleanup', message: string) {
    super(message); this.name = 'BackupError';
  }
}

export function assertSafeBackupPath(path: string) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0') || /%2e|%2f|%5c/i.test(path)) throw new BackupError('unsafe-path', 'Backup contains an unsafe path.');
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new BackupError('unsafe-path', 'Backup contains an unsafe path.');
}

export function createManifest(input: Omit<BackupManifest, 'format' | 'formatVersion' | 'persistentFileCount'>): BackupManifest {
  input.entries.forEach((entry) => assertSafeBackupPath(entry.path));
  if (!input.entries.some((entry) => entry.kind === 'database' && entry.path === BACKUP_DATABASE_PATH)) throw new BackupError('package', 'Database entry is missing.');
  return { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, ...input,
    persistentFileCount: input.entries.filter((entry) => entry.kind === 'persistent-file').length };
}

export function validatePackageShape(value: unknown): asserts value is BackupPackage {
  if (!value || typeof value !== 'object') throw new BackupError('unsupported-format', 'Unsupported backup package.');
  const pkg = value as Partial<BackupPackage>, manifest = pkg.manifest as Partial<BackupManifest> | undefined;
  if (manifest?.format !== BACKUP_FORMAT || manifest.formatVersion !== BACKUP_FORMAT_VERSION) throw new BackupError('unsupported-format', 'Unsupported backup format or version.');
  if (!Array.isArray(manifest.entries) || !pkg.payloads || typeof pkg.payloads !== 'object') throw new BackupError('integrity', 'Backup manifest is incomplete.');
  if (typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt)) || typeof manifest.appVersion !== 'string' ||
      (manifest.appBuildVersion !== null && typeof manifest.appBuildVersion !== 'string') || !Number.isSafeInteger(manifest.database?.schemaVersion) ||
      manifest.database?.path !== BACKUP_DATABASE_PATH || !Number.isSafeInteger(manifest.persistentFileCount)) {
    throw new BackupError('integrity', 'Backup manifest metadata is invalid.');
  }
  for (const entry of manifest.entries) {
    if (!entry || typeof entry.path !== 'string' || !['database', 'persistent-file'].includes(entry.kind) ||
        !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new BackupError('integrity', 'Backup manifest entry is invalid.');
    }
    assertSafeBackupPath(entry.path);
    if ((entry.kind === 'database' && entry.path !== BACKUP_DATABASE_PATH) ||
        (entry.kind === 'persistent-file' && !entry.path.startsWith(BACKUP_FILES_PREFIX))) {
      throw new BackupError('unsafe-path', 'Backup contains an unexpected storage path.');
    }
  }
}

export function bytesToBase64(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    result += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)] +
      (b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : alphabet[c & 63]);
  } return result;
}

export function base64ToBytes(value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new BackupError('integrity', 'Backup payload is invalid.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const output: number[] = [];
  for (let i = 0; i < value.length; i += 4) {
    const n = (alphabet.indexOf(value[i]) << 18) | (alphabet.indexOf(value[i + 1]) << 12) |
      ((value[i + 2] === '=' ? 0 : alphabet.indexOf(value[i + 2])) << 6) | (value[i + 3] === '=' ? 0 : alphabet.indexOf(value[i + 3]));
    output.push((n >> 16) & 255); if (value[i + 2] !== '=') output.push((n >> 8) & 255); if (value[i + 3] !== '=') output.push(n & 255);
  } return Uint8Array.from(output);
}
