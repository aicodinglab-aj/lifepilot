import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 3;

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
  if (currentVersion < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE vehicle_photos (
          id TEXT PRIMARY KEY NOT NULL,
          vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
          local_uri TEXT NOT NULL UNIQUE,
          is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
          created_at TEXT NOT NULL
        );
        CREATE INDEX vehicle_photos_vehicle ON vehicle_photos(vehicle_id, created_at, id);
        CREATE UNIQUE INDEX vehicle_photos_one_cover ON vehicle_photos(vehicle_id) WHERE is_cover = 1;
        PRAGMA user_version = 2;
      `);
    });
  }
  if (currentVersion < 3) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE vehicle_photos_next (
          id TEXT PRIMARY KEY NOT NULL,
          vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
          local_uri TEXT NOT NULL UNIQUE,
          is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
          created_at TEXT NOT NULL
        );
        INSERT INTO vehicle_photos_next SELECT id, vehicle_id, local_uri, is_cover, created_at FROM vehicle_photos;
        DROP TABLE vehicle_photos;
        ALTER TABLE vehicle_photos_next RENAME TO vehicle_photos;
        CREATE INDEX vehicle_photos_vehicle ON vehicle_photos(vehicle_id, created_at, id);
        CREATE UNIQUE INDEX vehicle_photos_one_cover ON vehicle_photos(vehicle_id) WHERE is_cover = 1;
        -- Intentionally no FK: cleanup must survive deletion of its vehicle.
        CREATE TABLE vehicle_deletion_cleanup (
          vehicle_id INTEGER PRIMARY KEY CHECK (vehicle_id > 0),
          created_at TEXT NOT NULL
        );
        PRAGMA user_version = 3;
      `);
    });
  }
}
