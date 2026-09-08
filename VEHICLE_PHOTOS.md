# Vehicle photo milestone

## Encoded photo URI fix (2026-09-08)

Confirmed on the running Android Expo Go emulator: a saved URI was
`file:///data/user/0/host.exp.exponent/files/ExperienceData/%2540anonymous%252Flifepilot-319897ac-45ba-43f1-9e0e-bca2a0695e67/vehicle-photos/3/9093f838-c060-4f80-9574-934ce9b54782.jpeg`.
The current `File.uri` matched, `File.exists` was true and `File.size` was 384154.
The second photo existed at 129052 bytes. The blanket `%` rejection in
`ownedPhotoFile` rejected valid Expo Go scope encoding, so `availablePhotoUri`
caught the exception and returned null before React Native Image rendered.

Flow: ImagePicker asset URI → awaited `File.copy(destination)` into a
`Directory(Paths.document, 'vehicle-photos', vehicleId)` → verified permanent
`destination.uri` inserted into SQLite `local_uri` → gallery SELECT alias
`localUri` / Garage cover join → shared `availablePhotoUri` → Image source URI.
Detail reloads after imports and Garage reloads on focus. The earlier awaited
copy fix remains correct for SDK 57 and is retained.

Validation now decodes each path segment once, rejecting malformed escapes,
encoded separators, dot traversal, remote authorities, queries and fragments.
It validates the exact vehicle directory and photo ID/extension, then constructs
the File only under current `Paths.document`. The supplied sandbox prefix is
never opened or deleted. Existing encoded paths and older sandbox prefixes
resolve without rewriting rows, moving files, or scanning outside owned storage.
Missing files retain their records and placeholder behavior.

Changed for this fix: `src/storage/vehicle-photos.ts`,
`src/features/vehicles/photo-service.ts`,
`src/components/vehicles/vehicle-photo-image.tsx`,
`scripts/test-vehicle-photos.cjs`, and this document. Temporary `__DEV__` diagnostics
use the `[vehicle-photo]` prefix and report copy/save/resolve URIs, existence,
size, validation errors and native image errors; no image bytes are logged.
Remove these diagnostic statements after remaining native verification.

Validation: TypeScript and targeted ESLint passed. The vehicle-photo regression
suite passed, including encoded Expo Go copy → actual in-memory SQLite → cover
and gallery resolution, fresh module restart, sandbox rebasing with unchanged
records, missing files and unsafe path rejection. Android emulator screenshots
confirmed existing photos in My Garage, detail cover, gallery thumbnails and
full-screen viewer. Force-stopping and reopening Expo Go confirmed both existing
photos still display (same IDs and sizes). No existing records were changed.
Still required: fresh gallery/camera import and immediate rendering on native,
and iOS/standalone-build verification, including real iOS sandbox relocation.

## Photos during vehicle creation

The Add Vehicle form now offers optional gallery multi-selection and camera capture, thumbnail previews, removal, and cover selection. Removing the cover selects the first remaining image. Its existing keyboard-avoiding scroll layout is retained, with drag-to-dismiss enabled. Picking and saving are mutually exclusive, and repeated Save taps are guarded.

Changed for this flow:

- `src/app/add-vehicle.tsx`: draft photo state and create/save feedback.
- `src/components/vehicles/selected-photos.tsx`: themed selection controls and temporary-URI thumbnails.
- `src/database/vehicles.ts`: returns SQLite's `lastInsertRowId` after a successful vehicle insert.
- `src/features/vehicles/photo-service.ts`: separates reusable `pickVehiclePhotos` from `saveSelectedVehiclePhotos`; existing gallery imports use both helpers.
- `src/features/vehicles/create-vehicle.ts`: inserts the vehicle before calling photo persistence, returning photo errors separately from vehicle creation errors.
- `scripts/test-vehicle-photos.cjs`: extends the existing checks for deferred storage, returned ID, cover preservation, duplicate registration, no-photo creation, partial saves, camera denial, and cleanup after photo record failure.

Selections stay in form memory using picker-provided temporary URIs. Removing a selection only removes that draft reference; leaving the form creates no permanent photos or records. Save validates the form, inserts the vehicle, obtains its ID, then uses the existing storage and database helpers. The chosen cover is saved first so the first-photo cover rule preserves the selection, including when a later photo fails. No schema migration or package changes are needed.

A vehicle-insert failure leaves the form and photo selections available for retry without copying any images. After a successful vehicle insert, photo errors never roll back the vehicle: the user sees a “Vehicle saved — photos need attention” message with the saved count and is taken to that vehicle's gallery to add missing photos. Successfully saved photos remain; failed record inserts attempt cleanup of the corresponding copy. The form cannot submit a second vehicle after creation succeeds.

Verification for this update: TypeScript, existing and extended regression tests, and targeted ESLint checks pass. Native picker/camera and keyboard layout still need device testing.

Garage cards open `/vehicle/[id]`. The detail screen offers multi-image library selection, optional camera capture, a full-screen photo viewer, cover selection, and confirmed deletion. The black-and-emerald theme is retained. Photo persistence targets Android and iOS; the web UI reports that local photo import requires the native app.

## Files

- `src/database/migrate.ts`: version 2 migration, preserving existing vehicles.
- `src/database/vehicle-photos.ts`: parameterized photo queries and transactional cover changes/deletion.
- `src/database/vehicles.ts`, `src/features/vehicles/vehicle.ts`: cover metadata and filtering by vehicle ID.
- `src/features/vehicles/vehicle-photo.ts`: photo type.
- `src/storage/vehicle-photos.ts`: permanent copies, owned-path validation, sandbox URI rebasing, and missing-file checks.
- `src/features/vehicles/photo-service.ts`: picking, camera permissions, copy/database coordination, cleanup, and deletion.
- `src/components/vehicles/vehicle-photo-image.tsx`: shared image rendering with missing/undecodable-file placeholders.
- `src/components/vehicles/vehicle-card.tsx`: cover image and detail navigation.
- `src/app/vehicle/[id].tsx`, `src/app/_layout.tsx`: detail route, gallery, viewer, action locking, errors, and confirmation.
- `app.json`, `package.json`, `package-lock.json`: SDK-compatible `expo-image-picker`, `expo-file-system`, and `expo-crypto`; camera/photo usage descriptions and no microphone permission.
- `eslint.config.js`: Expo-generated lint configuration; lint dependencies were missing and installed by Expo.
- `src/components/app-tabs.web.tsx`: corrected an existing invalid typed home route from `/(tabs)/index` to `/(tabs)`.
- `scripts/test-vehicle-photos.cjs`: database and mocked storage/service regression checks using Node SQLite and the actual TypeScript modules.

## Migration and lifecycle

Version 2 creates `vehicle_photos` with a UUID text primary key, `vehicle_id` foreign key, unique `local_uri`, checked `is_cover` flag, and ISO `created_at`. An index supports vehicle gallery queries; a partial unique index permits at most one cover per vehicle. Vehicle deletion is restricted while photos exist to avoid silently orphaning files in any future deletion feature.

1. The system library picker grants access to selected images without broad library access. Camera access is requested only when taking a photo. Denial gives Settings guidance; cancellation makes no changes.
2. Each image is copied to `Paths.document/vehicle-photos/<vehicleId>/<photoUUID>.<extension>`. SQLite receives only the permanent reference after the copy succeeds. The first image becomes cover automatically.
3. Import failure attempts to remove the unreferenced copy. Earlier successful images in a batch remain saved and the error reports their count. Failed cleanup is reported. An OS process kill between copy and insert can still leave an unused file; filesystem and SQLite cannot share an atomic transaction.
4. Cover changes run in an exclusive database transaction. Garage focus reloads cover metadata. Saved iOS sandbox prefixes are rebased to the current documents directory using only a validated vehicle/photo suffix.
5. Deletion looks up the photo using both vehicle ID and photo ID, validates the owned path, and deletes only that individual app copy. The original device-library image is untouched. A filesystem failure preserves the row for retry. If SQLite fails after file removal, a placeholder remains and retry safely removes the row. Deleting the cover promotes the oldest remaining photo transactionally.
6. Missing files or decode failures display placeholders. Their database entries remain deletable; missing images cannot be newly selected as covers. App documents survive restarts but are removed on uninstall.

## Verification

- `npx tsc --noEmit`: passed.
- `node scripts/test-vehicle-photos.cjs`: passed; covers fresh/v1 upgrades, vehicle preservation, newer-schema rejection, foreign keys, unique covers, cover replacement, cross-vehicle isolation, path rejection, cancellation, and deletion failure/retry.
- `npm run lint`: reports one existing `react-hooks/set-state-in-effect` error at `src/hooks/use-color-scheme.web.ts:11`. Photo changes have no lint findings.
- Native picker, camera, restart persistence, and visual layout still require Android/iOS device testing. Custom native builds need rebuilding to include the new modules and permission configuration.

Suggested device check: add multiple photos to two vehicles, restart, change covers and return to the garage, deny camera permission, cancel a picker, delete each cover, and verify the other vehicle and device-library originals remain unchanged.

Implementation references: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) and [SDK 57 ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/); file APIs were also checked against the installed SDK 57 type declarations.
