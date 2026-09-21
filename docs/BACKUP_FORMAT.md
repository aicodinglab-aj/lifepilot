# LifePilot Backup Format V1

Backup engine V1 creates one `.lpbackup` JSON file. This is a portable container chosen because the installed Expo SDK provides binary file IO and SHA-256, but no archive writer. Restore is intentionally not implemented yet.

The top level contains `manifest` and `payloads`. Logical paths follow `database/lifepilot.db` and `files/vehicle-photos/...`; payload values are base64. The manifest identifies `com.dmjlabs.lifepilot.backup`, format version 1, creation time, app/build versions, SQLite schema version, file count, and each entry's byte size and SHA-256.

The database is obtained with Expo SQLite `serializeAsync()`, producing a consistent database image without copying the active WAL files. Included files are only recursively discovered under LifePilot's app-private `vehicle-photos` root: vehicle photos, service bills, and insurance/PUC images. Cache, staging data, backup outputs, unrelated app storage, development files, credentials, and keys are excluded.

All logical paths are relative and reject absolute paths, backslashes, empty segments, `.` and `..`. Verification rejects missing, additional, duplicate, modified, or corrupt payloads and unsupported format versions. Creation verifies the staged and final package, cleans staging on success/failure, and never writes to source data.

V1 is not encrypted and holds encoded content in memory while packaging and restoring.

## Restore safety contract

`inspectRestore` verifies the entire package, independently deserializes the SQLite image, runs `PRAGMA integrity_check`, compares the actual schema to the manifest, and reports compatibility without changing active data. Schema v9 is current. Older supported databases are upgraded in isolation through the normal migration function; newer databases are rejected before replacement.

`restoreBackup` requires an explicit `{ dataAccessSuspended: true }` coordination token from its future UI/provider integration. It stages files under cache and creates rollback copies of both the current serialized database and the complete LifePilot-owned file root before replacement. It uses Expo SQLite's online backup API to write through the existing connection rather than replacing an open database file. Persistent files are replacement-restored only below `vehicle-photos`. If replacement or verification fails, the saved database and files are restored. The source `.lpbackup` is read-only.

A successful restore returns `restartRequired: true`; future UI must restart/remount the application before normal use so providers, queries, reminders and navigation reload restored state. V1 does not merge records, restore cloud data, or decrypt packages.

## App integration

Settings opens the V2 Backup & Restore screen. Backups are created privately first, then copied through Android's system directory picker to device storage or an available document provider. Restore selection uses the system file picker and always runs inspection before showing destructive confirmation.

The root restore coordinator unmounts navigation, reminder reconciliation and task providers before it supplies the engine's suspension token. It blocks Android Back and all normal app actions during replacement. On success it keeps the application locked on a completion screen until the user closes and reopens LifePilot; on failure it releases the lock and exposes a safe error message.

## Coverage and cross-device behavior

`lifepilot.db` contains vehicles, vehicle photo metadata, service and coverage history, Personal Expenses, Tasks, categories, reminder preferences and other domain records. The owned `vehicle-photos` tree contains vehicle images, service bills and insurance/PUC images. Cache, temporary workspaces, generated backups, Android notification channels/permissions, OS notification inventory and the separate device-local appearance preference database are excluded.

Database attachment rows retain their original absolute URI as metadata, but storage access never trusts that sandbox prefix. Vehicle photo, service bill and coverage helpers validate the expected owner/path suffix and reconstruct a `File` below the current installation's `Paths.document` root. This allows restored files to resolve on a different phone without broad database string replacement.

Before replacement, restore resets `permission_requested` and clears vehicle notification schedule/cleanup rows in the staged database. User reminder settings and source records remain. Restore does not request notification permission. After the required restart, normal reconciliation compares desired reminders with the destination device's real OS inventory and recreates eligible notifications when permission is available; task notifications are derived from incomplete tasks and the destination inventory.

Package verification checks declared Base64 byte length before decoding, then verifies actual size and SHA-256. Filenames include an ISO timestamp, existing destinations are never overwritten by the engine, and source packages remain read-only.
