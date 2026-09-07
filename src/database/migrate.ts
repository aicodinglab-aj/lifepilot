import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

export async function migrateDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion > DATABASE_VERSION) {
    throw new Error('This database was created by a newer version of LifePilot.');
  }

  if (currentVersion < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE vehicles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vehicle_type TEXT NOT NULL,
          registration_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
          make TEXT NOT NULL,
          model TEXT NOT NULL,
          variant TEXT,
          model_year INTEGER NOT NULL CHECK (model_year >= 1886),
          fuel_type TEXT NOT NULL,
          odometer_km REAL NOT NULL CHECK (odometer_km >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        PRAGMA user_version = 1;
      `);
    });
  }
}
