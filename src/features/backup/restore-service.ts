import { Directory, File, Paths } from 'expo-file-system';
import { backupDatabaseAsync, deserializeDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { DATABASE_VERSION, migrateDatabase } from '@/database/migrate';
import { BACKUP_DATABASE_PATH, BACKUP_FILES_PREFIX, BackupError, base64ToBytes, type BackupPackage } from './backup-format';
import { readVerifiedBackup } from './backup-service';

type RestoreInspection = { createdAt: string; appVersion: string; appBuildVersion: string | null; schemaVersion: number; persistentFileCount: number; approximateBytes: number; compatibility: 'current' | 'upgrade'; };
export type RestoreResult = { restoredSchemaVersion: number; persistentFileCount: number; restartRequired: true; cleanupIncomplete: boolean };
export type RestoreCoordination = { dataAccessSuspended: true };

async function validateDatabase(pkg: BackupPackage, migrate: boolean) {
  let db: SQLiteDatabase;
  try { db = await deserializeDatabaseAsync(base64ToBytes(pkg.payloads[BACKUP_DATABASE_PATH])); }
  catch { throw new BackupError('database-validation', 'Backup database is not a valid SQLite database.'); }
  try {
    const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const version = row?.user_version ?? 0;
    if (integrity?.integrity_check !== 'ok') throw new BackupError('database-validation', 'Backup database integrity check failed.');
    if (version !== pkg.manifest.database.schemaVersion) throw new BackupError('database-validation', 'Manifest schema does not match the backup database.');
    if (version > DATABASE_VERSION) throw new BackupError('incompatible-schema', 'Backup was created by a newer LifePilot database version.');
    if (migrate && version < DATABASE_VERSION) {
      try { await migrateDatabase(db); } catch { throw new BackupError('migration', 'Backup database could not be upgraded.'); }
    }
    if (migrate) {
      // These rows describe the source device's OS permission and scheduled
      // inventory. Keep user reminder preferences, then let startup reconcile
      // desired reminders against the destination device's actual inventory.
      await db.execAsync(`
        UPDATE reminder_preferences SET permission_requested = 0;
        DELETE FROM vehicle_reminder_schedule;
        DELETE FROM reminder_notification_cleanup;
      `);
    }
    return { db, originalVersion: version };
  } catch (error) { await db.closeAsync(); throw error; }
}

export async function inspectRestore(file: File): Promise<RestoreInspection> {
  const pkg = await readVerifiedBackup(file), validated = await validateDatabase(pkg, false);
  await validated.db.closeAsync();
  return { createdAt: pkg.manifest.createdAt, appVersion: pkg.manifest.appVersion, appBuildVersion: pkg.manifest.appBuildVersion,
    schemaVersion: validated.originalVersion, persistentFileCount: pkg.manifest.persistentFileCount,
    approximateBytes: pkg.manifest.entries.reduce((sum, entry) => sum + entry.size, 0),
    compatibility: validated.originalVersion === DATABASE_VERSION ? 'current' : 'upgrade' };
}

async function copyTree(source: Directory, destination: Directory) {
  if (!source.exists) return;
  destination.create({ intermediates: true, idempotent: true });
  for (const entry of source.list()) {
    if (entry instanceof Directory) await copyTree(entry, new Directory(destination, entry.name));
    else if (entry instanceof File) { const target = new File(destination, entry.name); target.create(); target.write(await entry.bytes()); }
  }
}
async function extractFiles(pkg: BackupPackage, root: Directory) {
  for (const entry of pkg.manifest.entries.filter((item) => item.kind === 'persistent-file')) {
    if (!entry.path.startsWith(BACKUP_FILES_PREFIX)) throw new BackupError('unsafe-path', 'Backup file is outside LifePilot-owned storage.');
    const relative = entry.path.slice('files/'.length).split('/');
    const file = new File(root, ...relative); file.parentDirectory.create({ intermediates: true, idempotent: true });
    try { file.create(); file.write(base64ToBytes(pkg.payloads[entry.path])); } catch { throw new BackupError('extraction', 'Backup files could not be staged.'); }
  }
}
async function checkActive(db: SQLiteDatabase) {
  const integrity = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (integrity?.integrity_check !== 'ok' || version?.user_version !== DATABASE_VERSION) throw new BackupError('database-validation', 'Restored database verification failed.');
}

export async function restoreBackup(activeDb: SQLiteDatabase, file: File, coordination: RestoreCoordination): Promise<RestoreResult> {
  if (coordination.dataAccessSuspended !== true) throw new BackupError('replacement', 'Restore requires suspended application data access.');
  const pkg = await readVerifiedBackup(file), incoming = await validateDatabase(pkg, true);
  const workspace = new Directory(Paths.cache, 'lifepilot-restore-staging'), incomingRoot = new Directory(workspace, 'incoming'), rollbackRoot = new Directory(workspace, 'rollback');
  let rollbackDb: SQLiteDatabase | null = null, replacementStarted = false, completed: RestoreResult | null = null;
  try {
    if (workspace.exists) workspace.delete(); workspace.create({ intermediates: true });
    await extractFiles(pkg, incomingRoot);
    try { rollbackDb = await deserializeDatabaseAsync(await activeDb.serializeAsync()); await copyTree(new Directory(Paths.document, 'vehicle-photos'), rollbackRoot); }
    catch { throw new BackupError('rollback-preparation', 'Current LifePilot data could not be protected for rollback.'); }
    replacementStarted = true;
    await backupDatabaseAsync({ sourceDatabase: incoming.db, destDatabase: activeDb });
    const activeFiles = new Directory(Paths.document, 'vehicle-photos'); if (activeFiles.exists) activeFiles.delete();
    await copyTree(new Directory(incomingRoot, 'vehicle-photos'), activeFiles);
    await checkActive(activeDb);
    completed = { restoredSchemaVersion: DATABASE_VERSION, persistentFileCount: pkg.manifest.persistentFileCount, restartRequired: true, cleanupIncomplete: false };
    return completed;
  } catch (error) {
    if (replacementStarted && rollbackDb) {
      try {
        await backupDatabaseAsync({ sourceDatabase: rollbackDb, destDatabase: activeDb });
        const activeFiles = new Directory(Paths.document, 'vehicle-photos'); if (activeFiles.exists) activeFiles.delete(); await copyTree(rollbackRoot, activeFiles); await checkActive(activeDb);
      } catch { throw new BackupError('rollback', 'Restore failed and the previous data could not be fully restored.'); }
    }
    if (error instanceof BackupError) throw error;
    throw new BackupError('replacement', 'LifePilot data could not be restored.');
  } finally {
    await incoming.db.closeAsync(); if (rollbackDb) await rollbackDb.closeAsync();
    try { if (workspace.exists) workspace.delete(); } catch { if (completed) completed.cleanupIncomplete = true; }
  }
}
