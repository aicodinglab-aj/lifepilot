# Safe vehicle deletion

Manage Vehicle is reached from the vehicle detail header gear. The red Danger
Zone action requires the native Cancel / Delete Vehicle confirmation. Success
clears the vehicle screens and returns to My Garage, whose focus query refreshes
the list. The Expo Go floating tools gear is separate from this app header gear.

Schema version 3 preserves all vehicles and photo fields while rebuilding the
photo foreign key as ON DELETE CASCADE. Photos are the only currently implemented
vehicle child table. No personal expense code or records are included.

`delete-vehicle.ts` validates the numeric ID and excludes overlapping photo saves.
It opens a private Expo SQLite connection, enables foreign keys BEFORE starting
the transaction, inserts an ID-only cleanup job and deletes the vehicle. This
also cascades its photo rows. SDK 57's exclusive transaction helper creates a new
connection without inheriting connection-local foreign key configuration, so the
service explicitly configures its own connection instead.

Only after commit does storage delete the exact directory constructed from
`Paths.document`, `vehicle-photos`, and the validated ID. Database local_uri
values never determine recursive deletion targets. Database failure leaves files
untouched. Filesystem failure leaves a durable cleanup job and a visible error;
the vehicle is already removed, but cleanup is explicitly reported as incomplete.
Garage retries jobs on focus, including after restart, and offers Retry cleanup
if any fail. Successful cleanup removes its job. Missing directories are safe to
retry. A job targeting a live vehicle is refused. AUTOINCREMENT vehicle IDs are
not reused. No startup data reset is involved.

For future modules, give exclusively vehicle-owned tables a vehicle_id foreign
key with ON DELETE CASCADE. Add idempotent filesystem cleanup functions to
`ownedFileCleanup`; each must derive its own exact owned path from the ID and
throw on failure. The job remains until every file store finishes. Shared and
personal data must not be added to these cascades or cleanup functions.

Verification:

- `node scripts/test-vehicle-deletion.cjs`: real file-backed SQLite, separate
  transaction connection, real temporary filesystem fixtures; populated v2
  migration preservation, FK cascade, no-photo and multi-photo deletion, other
  vehicle/photo isolation, unrelated personal-table sentinel, invalid IDs,
  arbitrary stored URI safety, restrictive-child rollback before file removal,
  filesystem failure, unreadable parent directories, cleanup acknowledgement
  failure, DB close/reopen and retry, live-vehicle and operation guards.
- Existing `test-vehicle-photos.cjs`, TypeScript and targeted ESLint pass.
- Android Expo Go: temporary native fixtures verified empty/multiple-file
  deletion, cascade and exact directory removal with original vehicle metadata
  unchanged. UI verified gear → Manage Vehicle, Cancel preserves the fixture,
  confirmed Delete Vehicle returns to Garage and removes the fixture. The
  temporary native test route was removed after use. Force-stop/reopen confirmed
  the deleted fixture stays absent and the original vehicle remains in Garage.
- Remaining platform checks: iOS UI/filesystem behavior and native storage-failure
  injection (failure and durable-retry behavior are covered by automated tests).
