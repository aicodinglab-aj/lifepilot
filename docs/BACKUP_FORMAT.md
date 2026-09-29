# LifePilot Backup Format V1

Backup engine V1 creates one `.lpbackup` JSON file. This is a portable container chosen because the installed Expo SDK provides binary file IO and SHA-256, but no archive writer. Backup creation, inspection, replacement restore and their Settings UI are implemented; native Android verification remains pending.

The top level contains `manifest` and `payloads`. Logical paths follow `database/lifepilot.db` and `files/vehicle-photos/...`; payload values are base64. The manifest identifies `com.dmjlabs.lifepilot.backup`, format version 1, creation time, app/build versions, SQLite schema version, file count, and each entry's byte size and SHA-256.

The database is obtained with Expo SQLite `serializeAsync()`, producing a consistent database image without copying the active WAL files. Included files are only recursively discovered under LifePilot's app-private `vehicle-photos` root: vehicle photos, service bills, and insurance/PUC images. Cache, staging data, backup outputs, unrelated app storage, development files, credentials, and keys are excluded.

All logical paths are relative and reject absolute paths, backslashes, empty segments, `.` and `..`. Verification rejects missing, additional, duplicate, modified, or corrupt payloads and unsupported format versions. Creation verifies the staged and final package, attempts owned staging cleanup on success/failure, and never writes to source data. Cleanup failure is reported separately without invalidating a verified package or keeping mutations suspended.

V1 is not encrypted and holds encoded content in memory while packaging and restoring.

## Backup snapshot consistency and concurrency

Previously, creation held a normal lease: normal operations can overlap, so SQLite serialization and later media reads were not protected as one application state. This was a source-supported race risk, not reproduced user-data corruption.

`createBackup` now calls the central coordinator's top-level `captureSnapshot` primitive without acquiring a normal lease. The states are `normal -> snapshot-draining -> snapshot -> normal`. Admission closes synchronously before the first await. Already-admitted operations and their nested cleanup finish before capture starts. New mutation attempts receive `OperationSuspendedError`; they are rejected, not silently queued. The snapshot states cannot issue restore authorization or admit `suspend()`. Restore states likewise reject backup capture. The existing normal-operation context rules remain unchanged; passing a parent context to backup/snapshot capture is rejected to prevent self-deadlock. Callers must never await snapshot capture from inside a normal operation, even if they omit its context.

The protected phase serializes SQLite, reads its schema version, enumerates the owned file tree, and awaits every file's binary read. All source bytes then belong to the attempt in memory. Admission resumes in `finally` on success or failure. Base64 encoding, hashing, package writing, verification, output copying and Android destination selection/export run outside this boundary and never reread mutable source data. Reads/navigation stay mounted; backup does not display restore UI or require a restart. The service guard remains held through packaging and cleanup: a second `createBackup` call deterministically rejects with `BackupError.code === 'busy'`. A rejected caller cannot release the first caller's barrier or staging. The screen also uses an immediate ref guard across create/save/select actions.

Each admitted attempt reserves `Paths.cache/lifepilot-backup-<UUID>/` using a validated UUID and without overwriting an existing directory. Cleanup reconstructs and checks only that attempt's exact cache path. Collisions are rejected without deletion; old staging and `Paths.document/lifepilot-recovery/` are never swept. Output is restricted to a private, direct `Paths.document` `.lpbackup` file, reserved without overwrite; provider export remains separate. Only an output successfully reserved by that attempt may be removed after failure.

Serialization, discovery, read, staging, hashing, verification and output failures release ownership. `BackupError.cleanupIncomplete` preserves a primary failure while reporting secondary cleanup failure; successful `BackupResult.cleanupIncomplete` means the verified backup is usable but temporary cleanup was incomplete. The UI reports both cases. Cleanup never prolongs the snapshot barrier. Failed cleanup/process termination may leave temporary files; no automatic cleanup sweep is added.

Current included media paths are `vehicle-photos/<vehicleId>/<photoId>.<ext>`, `vehicle-photos/<vehicleId>/service-bills/<serviceId>/<photoId>.<ext>`, and `vehicle-photos/<vehicleId>/{insurance,puc}/<recordId>/<documentId>/image.<ext>`. Current imports, edits, removals and cleanup retries use lifecycle-owned workflows. Fuel/Charging and Personal Expenses have no receipt attachments. Future attachment roots must explicitly join both backup/restore coverage and this lifecycle consistency contract; storage helpers must not be called from unleased mutation paths.

This is a process-local guarantee relative to participating LifePilot mutations. It does not repair pre-existing missing files, protect against external filesystem modification or provide crash recovery. V1 retains an in-memory snapshot and JSON/Base64 packaging, so large-library memory and responsiveness still need Android testing. SDK 57 SQLite serialization and FileSystem binary reads/copies are awaited; installed SDK types and the versioned SQLite/FileSystem/Crypto references were checked.

## Restore safety contract

`inspectRestore` verifies the entire package, independently deserializes the SQLite image, runs `PRAGMA integrity_check`, compares the actual schema to the manifest, and reports compatibility without changing active data. Schema v11 is current. Whole SQLite snapshots include personal budget configuration; v10 restores add the empty budget tables through the v11 migration. Fuel/charging entries are included automatically in the complete SQLite snapshot; v9 restores add the empty fuel table through the additive v10 migration. The package format is unchanged. Older supported databases are upgraded in isolation through the normal migration function; newer databases are rejected before replacement.

`restoreBackup` requires a live `MaintenanceAuthorization` issued by `applicationActivity` after all admitted operations drain. The authorization includes `dataAccessSuspended: true`, but a caller-created boolean object is rejected. Incoming files and persistent rollback material are staged in a unique app-private recovery directory before replacement. It uses Expo SQLite's online backup API to write through the existing connection rather than replacing an open database file. Persistent files are replacement-restored only below `vehicle-photos`. If replacement or verification fails, the saved database and files are restored. The source `.lpbackup` is read-only.

A successful restore returns `restartRequired: true`; the implemented coordinator keeps normal navigation and mutations locked for the remainder of this process. The user must close and reopen LifePilot so providers, queries, reminders and navigation reload restored state. V1 does not merge records, restore cloud data, or decrypt packages.

## App integration

Settings opens the V2 Backup & Restore screen. Backups are created privately first, then copied through Android's system directory picker to device storage or an available document provider. Restore selection uses the system file picker and always runs inspection before showing destructive confirmation.

The root restore coordinator observes a restore session, replaces navigation and providers with a locked view, and blocks Android Back using the live session state. Admission closes synchronously; the session awaits drain before calling the engine. Pre-replacement errors and replacement errors with verified successful rollback release ownership and show a fixed recoverable error. Successful restore retains the restart-required lock. `RollbackFailureError` retains exclusive ownership and a catastrophic recovery screen without a Continue action, raw paths or stack traces. It tells the user to stop using LifePilot and close it; reopening is not proof that recovery succeeded.

## Coverage and cross-device behavior

`lifepilot.db` contains vehicles, vehicle photo metadata, service and coverage history, Personal Expenses, Tasks, categories, reminder preferences and other domain records. The owned `vehicle-photos` tree contains vehicle images, service bills and insurance/PUC images. Cache, temporary workspaces, generated backups, Android notification channels/permissions, OS notification inventory and the separate device-local appearance preference database are excluded.

Database attachment rows retain their original absolute URI as metadata, but storage access never trusts that sandbox prefix. Vehicle photo, service bill and coverage helpers validate the expected owner/path suffix and reconstruct a `File` below the current installation's `Paths.document` root. This allows restored files to resolve on a different phone without broad database string replacement.

Before replacement, restore resets `permission_requested` and clears vehicle notification schedule/cleanup rows in the staged database. User reminder settings and source records remain. Restore does not request notification permission. After the required restart, normal reconciliation compares desired reminders with the destination device's real OS inventory and recreates eligible notifications when permission is available; task notifications are derived from incomplete tasks and the destination inventory.

Package verification checks declared Base64 byte length before decoding, then verifies actual size and SHA-256. Filenames include an ISO timestamp, existing destinations are never overwritten by the engine, and source packages remain read-only.

## Operation lifecycle and synchronization contract

`src/features/activity/operation-lifecycle.ts` owns one process-local `applicationActivity` instance. Restore states are `normal`, `suspending`, `exclusive`, and `resuming`; the separate backup capture states are described above. `suspend()` synchronously closes admission and returns an awaitable drain; it does not infer quiescence from unmounting, timers or arbitrary delays. After the active count reaches zero it issues an identity-checked maintenance authorization. Observers can subscribe to state changes. Only the current maintenance owner can resume; retaining ownership makes the lock permanent for that process.

Mutation entry points accept an optional final `OperationContext`. `withOperation(async operation => ..., context)` acquires ownership before validation or asynchronous work, releases in `finally`, and counts each nested use of a live shared context. New callers omit the context. An admitted workflow explicitly passes its context through nested mutations, so its required cleanup can finish after suspension. Released/foreign contexts cannot reopen admission. Release is idempotent; failed work releases only after its own awaited cleanup. Never fire-and-forget work inside a workflow: await it or give it an independently accounted lease. Never await exclusive maintenance while holding a normal lease.

Covered boundaries:

- Vehicle creation through photo import; details/odometer edits; deletion through private connection closure and owned-file cleanup; photo import/removal/cover selection; service creation/deletion and bills; Insurance/PUC creation/edit/deletion and attachments; all vehicle/service/coverage cleanup retries.
- Personal transaction creation/edit/deletion and task creation/edit/deletion/completion/reopening. Custom category mutation is not implemented.
- Vehicle reminder preferences, intervals, permission metadata, schedule/cleanup writes, whole reconciliation passes, and permission continuations. Task reconciliation and explicit permission requests are accounted for too. Queued task passes acquire only when starting; suspension invalidates their generation, including if admission later resumes.
- Fuel/Charging and Personal Budget mutations also hold normal leases. Backup capture uses the separate snapshot barrier; immutable packaging and staging cleanup do not hold a normal lease or maintenance authorization.

Repository mutation helpers share the parent context even when opening an independent SQLite connection. Low-level `src/storage/*` helpers are awaited inside these owned workflows; they do not independently acquire another lease. Pure reads, UI state and the separate device-local appearance database are excluded. Startup migration runs before application workflows mount; isolated restore migration runs under exclusive ownership. Restore never requests notification permission. External export copies are outside the active database/owned-media replacement set.

## Persistent recovery material

Before active replacement, the engine creates `Paths.document/lifepilot-recovery/restore-<UUID>/` without overwriting an existing directory. Each set contains `previous.db` (serialized previous SQLite database), `previous-files/` (the previous owned photo/bill/coverage tree, absent if the original root was absent), `incoming/` (staged incoming files), and `recovery.json` (metadata version 1, phase, timestamp, schema version and relative recovery paths). Recovery data is private, unencrypted, and excluded from `.lpbackup` discovery.

Database and file copies are read back for byte verification; the saved database is independently opened and checked before replacement. Rollback checks SQLite integrity/schema and verifies copied file bytes before it is treated as successful. Metadata records preparation, replacement, completion or rollback failure. Each attempt cleans only its own workspace after successful restore or a safely handled failure. Cleanup failures can leave artifacts; successful results expose `cleanupIncomplete`.

If rollback fails, all recovery files and metadata are retained. Connection-close errors cannot mask that catastrophic outcome. Subsequent attempts use new directories and never sweep old recovery sets; even a UUID collision is rejected without deleting the existing directory. There is no automatic recovery, recovery browser or startup recovery validation in this version. A retained set survives process termination, subject to filesystem/device durability; closing the app does not itself repair active data.

## Verification limits

Node regression scripts cover lifecycle admission/drain/nesting, cross-domain races, private connection and error-cleanup ordering, session outcomes, a mocked Android Back handler, persistent recovery ordering, collision isolation and artifact retention. Native SQLite/FileSystem behavior, process interruption, low storage, large libraries, document providers, notification reconciliation and real Android Back/restart behavior still require device testing. No APK/EAS build or native verification is implied by these automated checks.

`scripts/test-backup-concurrency.cjs` adds 20 deterministic scenarios using deferred gates (no timing sleeps), real temporary SQLite snapshots, actual photo workflows and filesystem adapters. It covers admitted DB/media drain, blocked new writes, archive DB/photo consistency, post-capture mutation and restore admission, capture/package failure release, concurrent rejection, isolated staging/collisions, cleanup reporting and current media coverage. Rendered backup UI tests invoke the same button twice before rerendering and verify one service operation. All 21 regression scripts, TypeScript and changed-file ESLint pass; native behaviour remains unverified.
