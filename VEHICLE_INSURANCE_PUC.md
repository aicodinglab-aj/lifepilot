# Vehicle Insurance & PUC

## Implemented

- Vehicle Overview shows actual Insurance/PUC status and links to Insurance & PUC.
- Separate summary cards offer Add, View and History. Histories retain previous records and use a paginated FlatList, ordered by expiry descending with stable tie-breaking.
- Add/edit forms validate required fields, real calendar dates, date ordering and non-negative amounts. Optional values remain nullable. Amounts support two decimal places, up to ₹1 billion.
- Common insurance policy types are suggested; custom text is supported and the database does not restrict policy types to an enum.
- Details show all fields, derived status, attached document photos and Edit/Delete actions. Missing optional values display `Not added`.
- Multiple gallery/camera document photos support preview, removal before saving, saved viewing, and removal during edits. Removed saved attachments are marked until Save, with a Keep document action to undo the selection. Back without saving does not remove them.
- Record deletion requires confirmation. Changes to one vehicle or domain do not mutate another. Editing updates the existing ID; a revision check rejects stale edits.
- Uses existing Expo Router navigation, theme, form controls, picker and vehicle operation locking. There are no new dependencies, notifications, cloud storage or Personal Expense Manager changes.

## Migration and schema

Version **5 → 6** is additive and transactional:

- `vehicle_insurance`: ID, vehicle FK, provider, policy number/type, start/expiry dates, premium, notes, timestamps and revision.
- `vehicle_puc`: ID, vehicle FK, certificate number, issue/expiry dates, testing center, amount, notes, timestamps and revision.
- `insurance_documents` and `puc_documents`: metadata only, with a composite `(vehicle_id, record_id)` FK to the matching record table.
- `coverage_document_cleanup`: durable jobs for removed documents or interrupted imports; intentionally no FK so jobs survive deletion.
- Vehicle-scoped history indexes include expiry, creation time and ID. Additional expiry/vehicle indexes support future reminder queries.
- Deletion triggers queue document cleanup in the same transaction as metadata removal. Foreign keys cascade vehicle → record → document.

Existing vehicle, gallery, service, service bill and cleanup tables are unchanged. No reset, recreation or destructive data migration is used. Status is not stored in SQLite. Private transaction connections enable foreign keys before BEGIN, following the existing deletion pattern.

## Document storage and recovery

Paths are app-private, beneath `Paths.document`:

```text
vehicle-photos/{vehicleId}/insurance/{recordId}/{documentId}/image.{extension}
vehicle-photos/{vehicleId}/puc/{recordId}/{documentId}/image.{extension}
```

Each document has its own folder so editing can safely remove one document while retaining the others. Empty parent folders may remain until vehicle deletion; they contain no document data. This does not use normal gallery or service-bill metadata.

Storage follows existing URI safety rules: validated vehicle and UUID identifiers, segment-wise decoding, acceptance of valid encoded scope names, rejection of traversal and encoded separators, and exact owned suffix matching. Old sandbox prefixes can be rebased for viewing. Cleanup derives its directory exclusively from validated identifiers, never from a stored URI.

A cleanup job is committed before each asynchronous photo copy. A successful record/document transaction removes import jobs. If copying or saving fails, existing edits roll back and staged files are cleaned; failures leave jobs for retry. Removed-document jobs survive app restart. Cleanup refuses documents still attached in SQLite and shares the vehicle operation lock with gallery/service/vehicle operations.

After a successful save or deletion, cleanup failure is reported as pending, not as a failed record save. Insurance & PUC and Garage expose Retry cleanup. Existing vehicle deletion removes the enclosing vehicle photo directory, and document cleanup jobs remain safe/idempotent afterward.

Attachments in this milestone are document **photos/images** from the existing gallery/camera picker; PDF or arbitrary-file import is not added. History and summary screens do not load document images. Detail/editor thumbnails use the existing Expo Image rendering approach; full-size viewing happens in a modal.

## Status behavior

Pure reusable functions are in `coverage-status.ts`; dates are validated `YYYY-MM-DD` values. Calendar-day arithmetic avoids DST or UTC-midnight shifts.

- `Not added`: no record/expiry, or dates cannot support a valid determination.
- `Not started`: start/issue date is in the future.
- `Expired`: expiry is before the device's local date.
- `Expiring soon`: expiry is today through 30 days ahead, inclusive.
- `Valid`: effective coverage expires more than 30 days ahead.

Expiry remains valid through its calendar day. A missing optional start/issue date imposes no start-date restriction. Status recalculates on focus, foreground and local midnight; this is display behavior, not a notification scheduler.

The summary prefers an effective unexpired record, choosing the furthest expiry when several qualify. A future renewal does not hide current coverage. If none qualify, it shows the record with the latest expiry, with its actual status (including Not started). Creation time and ID break ties. All records remain accessible in history.

## Files added

- `src/app/vehicle/insurance-puc.tsx`
- `src/app/vehicle/coverage-history.tsx`
- `src/app/vehicle/coverage-details.tsx`
- `src/app/vehicle/coverage-edit.tsx`
- `src/components/vehicles/coverage-ui.tsx`
- `src/database/vehicle-coverage.ts`
- `src/features/vehicles/coverage-record.ts`
- `src/features/vehicles/coverage-status.ts`
- `src/features/vehicles/coverage-service.ts`
- `src/features/vehicles/use-coverage.ts`
- `src/storage/coverage-documents.ts`
- `scripts/test-vehicle-coverage.cjs`
- `VEHICLE_INSURANCE_PUC.md`

## Files modified

- `src/database/migrate.ts`: version 6 schema.
- `src/app/vehicle/[id].tsx`: live Insurance/PUC status and destination.
- `src/app/vehicle/module.tsx`: old insurance module links redirect to the implemented screen.
- `src/app/vehicle-manager.tsx`: Insurance/PUC cleanup retries through the existing Garage cleanup flow.
- `scripts/test-vehicle-details.cjs`, `scripts/test-vehicle-photos.cjs`, `scripts/test-vehicle-services.cjs`: current schema expectations, and future-version rejection in the photo suite.

## Automated checks

```text
npx tsc --noEmit
node scripts/test-vehicle-coverage.cjs
node scripts/test-vehicle-photos.cjs
node scripts/test-vehicle-details.cjs
node scripts/test-vehicle-services.cjs
node scripts/test-vehicle-deletion.cjs
git diff --check
```

Changed-file ESLint is also run. The new suite uses real temporary SQLite databases and filesystem fixtures, with Expo native boundaries mocked. It covers populated v5→v6 preservation, migration rollback, fresh creation, Insurance/PUC create/edit/read, required/optional fields, date/status boundaries, history and pagination, owner/domain isolation, document add/remove during edits, stale-edit rejection, DB/copy failures, cleanup failure/restart/retry, operation locking, hostile paths/metadata and vehicle cascades. These checks do not establish native-device behavior.

Expo Router types were regenerated through the local offline Expo CLI. Metro started, but optional React Native DevTools installation reported `spawn EPERM`. No device was connected or tested.

SDK 57 references checked: [FileSystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/), [ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/), [SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/). File copies are awaited.

## Exact real-device test steps

Use disposable records for destructive checks. Upgrade the existing APK without uninstalling or clearing data.

1. Open Garage. Verify existing vehicles, cover/gallery photos, vehicle details, service history and service bills still appear. Open and close a service bill to confirm that flow remains working.
2. Open vehicle A → Insurance & PUC. Before adding records, both cards must say `Not added`. Verify Add and History actions and visible/Android Back to Vehicle Overview.
3. Add Insurance. Try Save with blank fields: company, policy number and expiry must be required. Enter `2026-02-30`, an expiry before the start date, and premium `-1` or `1.001`; each must be rejected.
4. Save a disposable policy with company `Test insurer`, number `TEST-A-1`, type Comprehensive, start `2020-01-01`, expiry `2035-12-31`, premium `1200.50` and notes. Select two gallery photos, preview one, remove it before saving, and take a camera photo. Confirm exactly the retained gallery photo and camera photo are saved.
5. Open Insurance Details and verify every field, premium and status. Preview each image; close it with both the Close document button and Android Back. Restart the app and reopen the record in airplane mode; data and photos should remain available.
6. Edit the same policy: change company and premium, type a custom policy type, clear start date/notes, remove one saved document and add another. Save. Verify history still contains one policy with updated fields, blank optional values show `Not added`, and exactly the intended documents remain. Edit again, mark a saved photo for removal, then Back without saving: the photo must remain.
7. Add an older insurance policy, expiry `2020-12-31`, and a future policy, start `2098-01-01`, expiry `2099-12-31`. History must retain all three in expiry order. The summary must still show the effective policy ending in 2035, while future-policy details say `Not started` and old-policy details say `Expired`.
8. Add PUC using only an expiry equal to today's local `YYYY-MM-DD`. Save and check `Expiring soon`; certificate number, issue date, center, amount and notes must show `Not added`. Edit that record, add the optional fields, explicit amount `0` and multiple document photos. Verify the record count does not increase and zero remains distinct from missing amount.
9. On disposable PUC records, use expiry yesterday, today, 30 days ahead and 31 days ahead with no issue date. Expected statuses are Expired, Expiring soon, Expiring soon and Valid. Add a future issue date with expiry later than issue: expect Not started. If practical on a test device, check foreground/midnight status refresh after the local date changes.
10. Open vehicle B and verify none of A's records or documents appear. Add B's Insurance and PUC with photos. Check A and B normal galleries and service bills: Insurance/PUC documents must not appear there.
11. Delete A's insurance policy: first Cancel and verify it remains; then confirm deletion. A's vehicle, normal gallery, services/bills, PUC, B's records/documents and Personal Expense Manager must remain unchanged. Repeat for A's PUC and confirm remaining insurance is unaffected. Original phone-gallery photos must remain.
12. Exercise visible Back and Android Back from summary, each history, details, editor and document modal. Leaving the editor before Save must discard only draft changes. If you leave during a save, completion must not unexpectedly navigate you back.
13. If safely reproducible on a test device, simulate low storage during photo import or removal. Failed edits must preserve saved fields/documents. Successful deletion with file-cleanup failure must keep the record deleted and show pending cleanup. Restart, restore storage, and use Retry cleanup from Insurance & PUC or Garage.
14. For pagination, create more than 40 disposable records and scroll to the end; check for missing/duplicate entries. With a disposable vehicle containing photos, services, Insurance and PUC, run the existing confirmed vehicle deletion and verify other vehicles remain unaffected.

## Unverified

No APK, Expo Go, emulator or real-device tests were performed. Native layout, camera/gallery permissions and URI behavior, actual storage errors, hardware Back, midnight/foreground refresh and installed-APK migration still require the checklist above. No commit or push was performed.
