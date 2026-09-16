import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 6;

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
  if (currentVersion < 4) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE vehicles ADD COLUMN chassis_number TEXT;
        ALTER TABLE vehicles ADD COLUMN engine_number TEXT;
        ALTER TABLE vehicles ADD COLUMN engine_capacity REAL CHECK (engine_capacity IS NULL OR engine_capacity > 0);
        ALTER TABLE vehicles ADD COLUMN transmission TEXT;
        ALTER TABLE vehicles ADD COLUMN color TEXT;
        ALTER TABLE vehicles ADD COLUMN purchase_date TEXT;
        ALTER TABLE vehicles ADD COLUMN purchase_price REAL CHECK (purchase_price IS NULL OR purchase_price >= 0);
        ALTER TABLE vehicles ADD COLUMN dealer TEXT;
        ALTER TABLE vehicles ADD COLUMN warranty_valid_until TEXT;
        ALTER TABLE vehicles ADD COLUMN notes TEXT;
        PRAGMA user_version = 4;
      `);
    });
  }
  if (currentVersion < 5) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE vehicle_services (
          id TEXT PRIMARY KEY NOT NULL,
          vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
          service_date TEXT NOT NULL,
          odometer REAL NOT NULL CHECK (odometer >= 0),
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          workshop TEXT,
          description TEXT,
          parts_cost REAL CHECK (parts_cost IS NULL OR parts_cost BETWEEN 0 AND 1000000000),
          labour_cost REAL CHECK (labour_cost IS NULL OR labour_cost BETWEEN 0 AND 1000000000),
          other_cost REAL CHECK (other_cost IS NULL OR other_cost BETWEEN 0 AND 1000000000),
          next_service_date TEXT,
          next_service_odometer REAL CHECK (next_service_odometer IS NULL OR next_service_odometer >= 0),
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (vehicle_id, id)
        );
        CREATE INDEX vehicle_services_history ON vehicle_services(vehicle_id, service_date DESC, created_at DESC, id DESC);
        CREATE TABLE service_bill_photos (
          id TEXT PRIMARY KEY NOT NULL,
          vehicle_id INTEGER NOT NULL,
          service_id TEXT NOT NULL,
          local_uri TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          FOREIGN KEY (vehicle_id, service_id) REFERENCES vehicle_services(vehicle_id, id) ON DELETE CASCADE
        );
        CREATE INDEX service_bills_owner ON service_bill_photos(vehicle_id, service_id, created_at, id);
        -- No FK: jobs must survive deletion and interrupted photo imports.
        CREATE TABLE service_bill_cleanup (
          vehicle_id INTEGER NOT NULL CHECK (vehicle_id > 0),
          service_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (vehicle_id, service_id)
        );
        CREATE TRIGGER vehicle_service_cleanup AFTER DELETE ON vehicle_services BEGIN
          INSERT OR IGNORE INTO service_bill_cleanup(vehicle_id, service_id, created_at)
          VALUES (OLD.vehicle_id, OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        END;
        PRAGMA user_version = 5;
      `);
    });
  }
  if (currentVersion < 6) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE vehicle_insurance (
          id TEXT PRIMARY KEY NOT NULL,
          vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
          provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
          policy_number TEXT NOT NULL CHECK (length(trim(policy_number)) > 0),
          policy_type TEXT,
          start_date TEXT,
          expiry_date TEXT NOT NULL,
          premium_amount REAL CHECK (premium_amount IS NULL OR premium_amount BETWEEN 0 AND 1000000000),
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          CHECK (start_date IS NULL OR expiry_date >= start_date),
          UNIQUE (vehicle_id, id)
        );
        CREATE TABLE vehicle_puc (
          id TEXT PRIMARY KEY NOT NULL,
          vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
          certificate_number TEXT,
          issue_date TEXT,
          expiry_date TEXT NOT NULL,
          testing_center TEXT,
          amount REAL CHECK (amount IS NULL OR amount BETWEEN 0 AND 1000000000),
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          CHECK (issue_date IS NULL OR expiry_date >= issue_date),
          UNIQUE (vehicle_id, id)
        );
        -- No FK: cleanup survives a removed document, record or vehicle.
        CREATE TABLE coverage_document_cleanup (
          kind TEXT NOT NULL CHECK (kind IN ('insurance', 'puc')),
          vehicle_id INTEGER NOT NULL CHECK (vehicle_id > 0),
          record_id TEXT NOT NULL,
          document_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (kind, vehicle_id, record_id, document_id)
        );
        CREATE INDEX insurance_history ON vehicle_insurance(vehicle_id, expiry_date DESC, created_at DESC, id DESC);
        CREATE INDEX insurance_expiry ON vehicle_insurance(expiry_date, vehicle_id);
        CREATE TABLE insurance_documents (
          id TEXT PRIMARY KEY NOT NULL,
          vehicle_id INTEGER NOT NULL,
          record_id TEXT NOT NULL,
          local_uri TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          FOREIGN KEY (vehicle_id, record_id) REFERENCES vehicle_insurance(vehicle_id, id) ON DELETE CASCADE
        );
        CREATE INDEX insurance_documents_owner ON insurance_documents(vehicle_id, record_id, created_at, id);
        CREATE TRIGGER insurance_document_cleanup AFTER DELETE ON insurance_documents BEGIN
          INSERT OR IGNORE INTO coverage_document_cleanup(kind, vehicle_id, record_id, document_id, created_at)
          VALUES ('insurance', OLD.vehicle_id, OLD.record_id, OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        END;
        CREATE INDEX puc_history ON vehicle_puc(vehicle_id, expiry_date DESC, created_at DESC, id DESC);
        CREATE INDEX puc_expiry ON vehicle_puc(expiry_date, vehicle_id);
        CREATE TABLE puc_documents (
          id TEXT PRIMARY KEY NOT NULL,
          vehicle_id INTEGER NOT NULL,
          record_id TEXT NOT NULL,
          local_uri TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          FOREIGN KEY (vehicle_id, record_id) REFERENCES vehicle_puc(vehicle_id, id) ON DELETE CASCADE
        );
        CREATE INDEX puc_documents_owner ON puc_documents(vehicle_id, record_id, created_at, id);
        CREATE TRIGGER puc_document_cleanup AFTER DELETE ON puc_documents BEGIN
          INSERT OR IGNORE INTO coverage_document_cleanup(kind, vehicle_id, record_id, document_id, created_at)
          VALUES ('puc', OLD.vehicle_id, OLD.record_id, OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        END;
        PRAGMA user_version = 6;
      `);
    });
  }
}
