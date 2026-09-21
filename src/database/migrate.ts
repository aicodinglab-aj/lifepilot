import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION = 9;

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
  if (currentVersion < 7) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE reminder_preferences (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0,1)),
          permission_requested INTEGER NOT NULL DEFAULT 0 CHECK (permission_requested IN (0,1)),
          mileage_threshold REAL NOT NULL DEFAULT 500 CHECK (mileage_threshold >= 0),
          updated_at TEXT NOT NULL
        );
        INSERT INTO reminder_preferences(id, updated_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
        CREATE TABLE reminder_intervals (
          source_type TEXT NOT NULL CHECK (source_type IN ('insurance','puc','service')),
          offset_days INTEGER NOT NULL CHECK (offset_days >= 0),
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (source_type, offset_days)
        );
        INSERT INTO reminder_intervals(source_type, offset_days, updated_at)
          SELECT source_type, offset_days, strftime('%Y-%m-%dT%H:%M:%fZ','now')
          FROM (SELECT 'insurance' AS source_type UNION ALL SELECT 'puc' UNION ALL SELECT 'service')
          CROSS JOIN (SELECT 30 AS offset_days UNION ALL SELECT 7 UNION ALL SELECT 1 UNION ALL SELECT 0);
        CREATE TABLE reminder_change_state (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL DEFAULT 0);
        INSERT INTO reminder_change_state VALUES (1, 0);
        CREATE TABLE vehicle_reminder_sources (
          id TEXT PRIMARY KEY NOT NULL,
          vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
          source_type TEXT NOT NULL CHECK (source_type IN ('insurance','puc','service')),
          insurance_id TEXT UNIQUE,
          puc_id TEXT UNIQUE,
          service_id TEXT UNIQUE,
          FOREIGN KEY (vehicle_id, insurance_id) REFERENCES vehicle_insurance(vehicle_id,id) ON DELETE CASCADE,
          FOREIGN KEY (vehicle_id, puc_id) REFERENCES vehicle_puc(vehicle_id,id) ON DELETE CASCADE,
          FOREIGN KEY (vehicle_id, service_id) REFERENCES vehicle_services(vehicle_id,id) ON DELETE CASCADE,
          CHECK ((source_type = 'insurance' AND insurance_id IS NOT NULL AND puc_id IS NULL AND service_id IS NULL)
            OR (source_type = 'puc' AND puc_id IS NOT NULL AND insurance_id IS NULL AND service_id IS NULL)
            OR (source_type = 'service' AND service_id IS NOT NULL AND insurance_id IS NULL AND puc_id IS NULL)),
          UNIQUE (id, source_type)
        );
        CREATE INDEX reminder_sources_vehicle ON vehicle_reminder_sources(vehicle_id, source_type);
        CREATE TABLE vehicle_reminder_schedule (
          notification_id TEXT PRIMARY KEY NOT NULL,
          source_id TEXT NOT NULL,
          source_type TEXT NOT NULL,
          due_date TEXT NOT NULL,
          offset_days INTEGER NOT NULL,
          fire_at INTEGER NOT NULL,
          fingerprint TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (source_id, source_type) REFERENCES vehicle_reminder_sources(id, source_type) ON DELETE CASCADE,
          FOREIGN KEY (source_type, offset_days) REFERENCES reminder_intervals(source_type, offset_days) ON DELETE CASCADE,
          UNIQUE (source_id, offset_days)
        );
        CREATE INDEX reminder_schedule_source ON vehicle_reminder_schedule(source_id);
        CREATE INDEX reminder_schedule_fire ON vehicle_reminder_schedule(fire_at);
        -- Cancellation survives source/vehicle deletion and native scheduling failures.
        CREATE TABLE reminder_notification_cleanup (notification_id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL);
        CREATE TRIGGER reminder_schedule_deleted AFTER DELETE ON vehicle_reminder_schedule BEGIN
          INSERT OR IGNORE INTO reminder_notification_cleanup VALUES (OLD.notification_id, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
        END;
        INSERT INTO vehicle_reminder_sources(id, vehicle_id, source_type, insurance_id)
          SELECT 'insurance:' || vehicle_id || ':' || id, vehicle_id, 'insurance', id FROM vehicle_insurance;
        CREATE TRIGGER reminder_insurance_insert AFTER INSERT ON vehicle_insurance BEGIN
          INSERT INTO vehicle_reminder_sources(id, vehicle_id, source_type, insurance_id)
            VALUES ('insurance:' || NEW.vehicle_id || ':' || NEW.id, NEW.vehicle_id, 'insurance', NEW.id);
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_insurance_update AFTER UPDATE ON vehicle_insurance BEGIN
          DELETE FROM vehicle_reminder_schedule WHERE source_id = 'insurance:' || OLD.vehicle_id || ':' || OLD.id;
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_insurance_delete AFTER DELETE ON vehicle_insurance BEGIN
          DELETE FROM vehicle_reminder_sources WHERE id = 'insurance:' || OLD.vehicle_id || ':' || OLD.id;
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        INSERT INTO vehicle_reminder_sources(id, vehicle_id, source_type, puc_id)
          SELECT 'puc:' || vehicle_id || ':' || id, vehicle_id, 'puc', id FROM vehicle_puc;
        CREATE TRIGGER reminder_puc_insert AFTER INSERT ON vehicle_puc BEGIN
          INSERT INTO vehicle_reminder_sources(id, vehicle_id, source_type, puc_id)
            VALUES ('puc:' || NEW.vehicle_id || ':' || NEW.id, NEW.vehicle_id, 'puc', NEW.id);
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_puc_update AFTER UPDATE ON vehicle_puc BEGIN
          DELETE FROM vehicle_reminder_schedule WHERE source_id = 'puc:' || OLD.vehicle_id || ':' || OLD.id;
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_puc_delete AFTER DELETE ON vehicle_puc BEGIN
          DELETE FROM vehicle_reminder_sources WHERE id = 'puc:' || OLD.vehicle_id || ':' || OLD.id;
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        INSERT INTO vehicle_reminder_sources(id, vehicle_id, source_type, service_id)
          SELECT 'service:' || vehicle_id || ':' || id, vehicle_id, 'service', id FROM vehicle_services;
        CREATE TRIGGER reminder_service_insert AFTER INSERT ON vehicle_services BEGIN
          INSERT INTO vehicle_reminder_sources(id, vehicle_id, source_type, service_id)
            VALUES ('service:' || NEW.vehicle_id || ':' || NEW.id, NEW.vehicle_id, 'service', NEW.id);
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_service_update AFTER UPDATE ON vehicle_services BEGIN
          DELETE FROM vehicle_reminder_schedule WHERE source_id = 'service:' || OLD.vehicle_id || ':' || OLD.id;
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_service_delete AFTER DELETE ON vehicle_services BEGIN
          DELETE FROM vehicle_reminder_sources WHERE id = 'service:' || OLD.vehicle_id || ':' || OLD.id;
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_vehicles_insert AFTER INSERT ON vehicles BEGIN
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_vehicles_update AFTER UPDATE ON vehicles BEGIN
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_vehicles_delete AFTER DELETE ON vehicles BEGIN
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_reminder_intervals_insert AFTER INSERT ON reminder_intervals BEGIN
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_reminder_intervals_update AFTER UPDATE ON reminder_intervals BEGIN
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_reminder_intervals_delete AFTER DELETE ON reminder_intervals BEGIN
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_reminder_preferences_insert AFTER INSERT ON reminder_preferences BEGIN
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_reminder_preferences_update AFTER UPDATE ON reminder_preferences BEGIN
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        CREATE TRIGGER reminder_reminder_preferences_delete AFTER DELETE ON reminder_preferences BEGIN
          UPDATE reminder_change_state SET revision = revision + 1 WHERE id = 1;
        END;
        PRAGMA user_version = 7;
      `);
    });
  }
  if (currentVersion < 8) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE personal_categories (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
          type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
          is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(id, type), UNIQUE(type, name)
        );
        CREATE TABLE personal_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
          amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount BETWEEN 1 AND 99999999999),
          category_id TEXT NOT NULL,
          transaction_date TEXT NOT NULL CHECK (length(transaction_date) = 10 AND transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          description TEXT CHECK (description IS NULL OR length(description) <= 200),
          notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
          payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('Cash', 'UPI', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Other')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(category_id, type) REFERENCES personal_categories(id, type) ON DELETE RESTRICT
        );
        CREATE INDEX personal_transactions_date ON personal_transactions(transaction_date DESC, id DESC);
        CREATE INDEX personal_transactions_type_date ON personal_transactions(type, transaction_date DESC, id DESC);
        CREATE INDEX personal_transactions_category ON personal_transactions(category_id);
        INSERT OR IGNORE INTO personal_categories(id, name, type, is_system, created_at, updated_at) VALUES
          ('expense-food', 'Food', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('expense-groceries', 'Groceries', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('expense-transport', 'Transport', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('expense-shopping', 'Shopping', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('expense-bills', 'Bills', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('expense-health', 'Health', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('expense-entertainment', 'Entertainment', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('expense-education', 'Education', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('expense-rent', 'Rent', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('expense-other', 'Other', 'expense', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('income-salary', 'Salary', 'income', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('income-business', 'Business', 'income', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('income-interest', 'Interest', 'income', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('income-gift', 'Gift', 'income', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('income-other', 'Other', 'income', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        PRAGMA user_version = 8;
      `);
    });
  }
  if (currentVersion < 9) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE task_categories (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 80)
        );
        INSERT OR IGNORE INTO task_categories(id, name) VALUES
          ('personal', 'Personal'), ('work', 'Work'), ('shopping', 'Shopping'), ('home', 'Home'), ('other', 'Other');
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
          description TEXT CHECK (description IS NULL OR length(description) <= 4000),
          category_id TEXT REFERENCES task_categories(id) ON DELETE SET NULL,
          priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
          due_date TEXT CHECK (due_date IS NULL OR (length(due_date) = 10 AND due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
          due_time TEXT CHECK (due_time IS NULL OR (due_date IS NOT NULL AND length(due_time) = 5 AND due_time GLOB '[0-2][0-9]:[0-5][0-9]' AND due_time <= '23:59')),
          reminder_enabled INTEGER NOT NULL DEFAULT 0 CHECK (reminder_enabled IN (0, 1)),
          completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
          completed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (reminder_enabled = 0 OR (due_date IS NOT NULL AND due_time IS NOT NULL)),
          CHECK ((completed = 0 AND completed_at IS NULL) OR (completed = 1 AND completed_at IS NOT NULL))
        );
        CREATE INDEX tasks_completed_due ON tasks(completed, due_date, due_time, id);
        CREATE INDEX tasks_due ON tasks(due_date, due_time, id);
        CREATE INDEX tasks_category ON tasks(category_id, completed);
        CREATE INDEX tasks_priority ON tasks(priority, completed);
        CREATE INDEX tasks_completed_history ON tasks(completed, completed_at DESC, id DESC);
        PRAGMA user_version = 9;
      `);
    });
  }
}
