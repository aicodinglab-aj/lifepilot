# Vehicle Reminders & Local Notifications

## Implementation status

The requested milestone is implemented in source code. Automated checks are listed below; native APK/device checks remain unverified.

| Requirement | Implementation |
| --- | --- |
| Insurance, PUC and service-date reminders | Local notifications generated from persisted vehicle records |
| Configurable intervals | Per-type switches for 30, 7, 1 and 0 days; persisted locally; repository accepts additional offsets |
| Reminder settings without permission | Fully usable before permission or after denial |
| Upcoming/overdue screen | Home and Garage links; nearest upcoming dates first; expired, empty and permission states |
| Service odometer | In-app approaching/due/overdue states, with a configurable 500 km default; overview warning and Reminders list |
| Safe edits/deletion | Stable notification IDs, relational source ownership and durable cancellation jobs |
| Reconciliation outside reminder screens | Root lifecycle, committed vehicle operations, SQLite changes and foreground checks |
| Existing data | Additive v6 → v7 migration; previous tables/data preserved |
| Practical notification testing | Preview/development 10-second test section; hidden and blocked in production; calendar calculations unchanged |

No cloud/push server, token registration, authentication, GPS, Personal Expense reminders or cloud sync was added. No commit or push was performed.

## Migration v6 → v7

New tables:

- `reminder_preferences`: optional notification scheduling, one-time permission-request marker, mileage-warning threshold and timestamp.
- `reminder_intervals`: source type, offset days, enabled state and timestamp. Default 30/7/1/0 rows for Insurance, PUC and Service.
- `vehicle_reminder_sources`: reusable source registry, backfilled from existing v6 records. Concrete composite foreign keys enforce vehicle/source ownership. Source records remain authoritative for dates/odometer.
- `vehicle_reminder_schedule`: notification identifier, source, due-date snapshot, offset, local-fire instant, comparison fingerprint and timestamps. This records scheduling intent; it is compared with the OS rather than assumed to prove delivery.
- `reminder_notification_cleanup`: durable cancellation jobs, intentionally independent of deleted source/vehicle rows.
- `reminder_change_state`: revision counter for controlled reconciliation after committed changes.

Indexes support vehicle/type, source and fire-time lookups. Triggers register new sources, invalidate edited schedules, queue cancellations on cascade deletion and bump the revision after relevant mutations. Insurance, PUC, service, vehicle and settings changes are covered. Existing files and file-cleanup tables are not changed. SQL values are parameterized.

## Notification architecture

`reminder.ts` contains pure date, interval, message and mileage calculations. `database/reminders.ts` reads dates/identifiers/odometers only; it does not scan photos or documents. `reconcile.ts` compares desired schedules with actual scheduled notifications through an injected adapter. `notifications.ts` owns Expo calls; `reminder-provider.tsx` supplies app lifecycle integration independently of the Reminders UI.

Scheduling uses a stable ID per source and offset, with a LifePilot vehicle-reminder ownership marker. Due date, local fire time and body are compared through a fingerprint. It cancels obsolete owned notifications individually, persists intent before scheduling, recovers missing schedules, adopts already-scheduled matching IDs after interrupted calls, and retries failed cancellation from SQLite. It does not use cancel-all APIs. Concurrent reconciliation calls share a run; revision checks guard edits/deletions racing native scheduling.

Reconciliation runs at startup, foreground, after vehicle operations, after relevant database changes and settings actions. While active, a lightweight revision read occurs every 15 seconds; permissions/time-zone/clock/native state are refreshed at least once a minute. Failures remain visible with a Refresh action. No background JS service or location monitoring is introduced.

Every unexpired Insurance/PUC record is eligible, supporting separate overlapping policies. Older expired history is suppressed when a newer expiry exists; the latest expired record remains visible if all are expired. Service reminders use only the latest service visit, so a newer visit supersedes the previous next-service target.

To respect practical OS limits, scheduling reserves room and keeps the nearest notifications first: up to 60 on iOS and 450 on Android, less any unrelated pending notifications. Later desired reminders remain derived from the database and are scheduled on subsequent reconciliation. The UI reports deferred notifications. Reopen the app regularly if this limit is reached; no background refill while the app is terminated is promised.

## Permissions and native setup

- Installed `expo-notifications ~57.0.19` through `npx expo install expo-notifications`, matching SDK 57. It requires the compatible `expo-constants 57.0.18` patch in the lockfile; Expo itself is unchanged.
- Added the notification config plugin. Android channel: `vehicle-reminders`, normal/default importance, default sound and private lock-screen visibility.
- No permission dialog appears just to launch the app, view reminders or change intervals. The user taps **Enable notifications**.
- The permission-attempt marker is saved before requesting. Denied users are not prompted repeatedly; **Open device settings** provides the recovery path. In-app functionality remains available.
- Android channel-disabled state is detected. Authorized/provisional/ephemeral iOS states are handled. Permission changes are checked when returning to the foreground.
- Android exact-alarm permission is not requested for these day-level reminders. The installed SDK's scheduler falls back to inexact alarms when exact alarms are unavailable; battery/OS policies may delay delivery.
- A new native APK is required. Adding this dependency cannot be delivered to an old APK through a JavaScript-only update.

SDK 57 documentation verified: [Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) and [SQLite change listeners](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/). Installed notification-module native scheduling behavior was also inspected.

## Calendar and odometer behavior

Date-only values stay `YYYY-MM-DD`. Offsets subtract calendar days; the resulting day is constructed at **09:00 device-local time**, centralized as `REMINDER_HOUR`. This avoids treating a due date as UTC midnight. A trigger at or before the current instant is skipped, including today's 09:00 after it has passed. It is not converted into an immediate late notification.

Time-zone or clock changes are reconciled on foreground/active checks. Already-scheduled instants cannot be corrected by JavaScript while the app remains terminated; reopen LifePilot after changing time zones.

Messages show only reminder type and vehicle registration, never policy/certificate numbers, provider details, notes or documents. Tapping an owned notification opens Reminders through Expo Router, avoiding stale direct links to deleted records.

Mileage logic compares the entered current odometer with the latest service's next-service odometer. Default warning threshold is 500 km, editable in settings. At the target it is Due; above it Overdue; within the threshold Approaching. Warnings appear in Vehicle Overview and the Reminders mileage section. Mileage-only records never generate calendar notifications; the app does not infer distance through GPS.

## Files added

- `src/app/reminders.tsx`
- `src/app/reminder-settings.tsx`
- `src/components/vehicles/reminder-status.tsx`
- `src/components/vehicles/mileage-reminder.tsx`
- `src/database/reminders.ts`
- `src/features/reminders/reminder.ts`
- `src/features/reminders/reconcile.ts`
- `src/features/reminders/permission.ts`
- `src/features/reminders/notifications.ts`
- `src/features/reminders/reminder-provider.tsx`
- `scripts/test-reminders.cjs`
- `VEHICLE_REMINDERS.md`

## Files modified

- `src/database/migrate.ts`: additive version 7 migration.
- `src/features/vehicles/vehicle-operation.ts`: post-operation event for reconciliation, without changing operation locking or failure semantics.
- `src/app/_layout.tsx`: SQLite change listeners and root reminder runtime.
- `src/app/(tabs)/index.tsx`: Home reminder link and scrolling to fit smaller screens.
- `src/app/vehicle-manager.tsx`: Garage reminder link.
- `src/app/vehicle/[id].tsx`: mileage warning.
- `app.json`, `package.json`, `package-lock.json`: SDK-compatible notification dependency/plugin.
- `scripts/test-vehicle-photos.cjs`, `scripts/test-vehicle-details.cjs`, `scripts/test-vehicle-services.cjs`, `scripts/test-vehicle-coverage.cjs`: schema version expectations/future-version rejection.

Android package ID, EAS project/signing configuration and Personal Expense Manager remain unchanged.

## Automated checks

```text
npx tsc --noEmit
node scripts/test-reminders.cjs
node scripts/test-vehicle-photos.cjs
node scripts/test-vehicle-details.cjs
node scripts/test-vehicle-services.cjs
node scripts/test-vehicle-coverage.cjs
node scripts/test-vehicle-deletion.cjs
git diff --check
```

Changed-file ESLint is also run. The reminder suite uses actual temporary SQLite databases with a mock notification adapter. It covers populated v6 upgrade/backfill/rollback, fresh schema, settings restart persistence, all reminder types and offsets, past/exact-time boundaries, DST and multiple time zones, mileage warning boundaries, disabled intervals, permission-denied/no-repeat behavior, stale/missing/duplicate schedules, edited dates, deleted sources/vehicles, source isolation, native failure recovery, cancellation retry after restart, concurrent reconciliation and capacity limits.

Time-zone tests run in separate Node processes for Asia/Kolkata, America/Los_Angeles and Pacific/Auckland. Their sandbox initially blocked child-process execution; they were rerun with approval. Testing caught and fixed an ambiguous SQLite UNION ordering column. Expo route types were regenerated through the offline CLI; optional React Native DevTools installation reported `spawn EPERM`, but Metro started. No device testing is implied by these checks.

## Exact APK/device checklist

Build a **new native preview APK using the existing EAS preview profile and signing configuration**. Install it over the existing v6 app without uninstalling or clearing data. Keep disposable test records separate from your real records.

1. **Upgrade/preservation:** Open Garage and inspect an existing vehicle, its cover/gallery, service history/bill, Insurance policy/photo and PUC certificate/photo. Confirm the original details and documents remain.
2. **Navigation:** Open Home → Vehicle Reminders, then Settings. Also open Garage → Vehicle Reminders. Test visible Back and Android Back at each level; the existing Home/Vehicle Manager flow must still work.
3. **Permission:** On an app/device where permission is undecided, tap Enable notifications. Test denial first: no reminder data should disappear, and leaving/reopening settings must not repeatedly prompt. If the device already granted/denied permission, inspect that state instead; do not clear your real app to reset it.
4. **Enable after denial:** Tap Open device settings → Notifications; allow LifePilot and the Vehicle reminders channel. Return to LifePilot. It should report enabled permission and reconcile. Older Android versions may already grant notification permission without a dialog.
5. **Insurance scheduling:** Turn Schedule local notifications on and enable Insurance's 30/7/1/0 switches. Note the scheduled count. For a disposable vehicle A, add a policy expiring exactly 60 days from today's device-local date. Once reconciliation finishes, four notifications should be added if the capacity limit is not reached. Its due date must appear in Upcoming.
6. **PUC scheduling:** Add A's PUC with expiry 70 days ahead and all PUC intervals enabled. Expect four additional scheduled notifications and correct nearest-date ordering.
7. **Service-date scheduling:** Add A's latest service with a next-service date 80 days ahead and all service intervals enabled. Expect four additional notifications. Attachments are not required. A later service visit replaces the earlier service reminder target.
8. **Edit expiry:** Edit the test Insurance expiry from 60 to 90 days ahead. Confirm history still has one edited policy, Upcoming shows the new date, the notification count remains stable and Refresh notifications reports no failure. The old notification times must not fire; date replacement/cancellation is covered by the automated adapter tests, while actual delivery still needs observation on-device.
9. **Delete a source:** Cancel an Insurance deletion first and verify no change. Then confirm deletion; expect its four scheduled notifications to disappear. A's PUC/service and other vehicles' counts/records must remain. Repeat with disposable PUC and service records as needed.
10. **Disable an interval:** Disable only PUC's 7-day interval. Expect one notification per eligible PUC record to be cancelled. Other intervals and Insurance/Service schedules must remain. Re-enable it and confirm future triggers return. Past triggers must not be recreated.
11. **Permission changes:** Disable LifePilot notifications in Android settings, return to the app and wait for reconciliation. In-app reminders must remain; permission state becomes disabled and pending owned schedules are cancelled where the OS permits. Re-enable permission and return; only future enabled notifications should be scheduled, without duplicates.
12. **Restart:** Fully close and reopen the app. Verify interval settings and mileage threshold persist, records remain, and the scheduled count does not grow with repeated restarts/Refresh. A normal app close differs from Android Force stop, which can suppress delivery until you reopen the app.
13. **Vehicle isolation:** Create B's own Insurance/PUC/service reminders. Delete A's disposable source or whole disposable vehicle through existing confirmation. Confirm B's records and schedules remain, along with unrelated gallery/service documents and personal expenses.
14. **Mileage:** On a disposable vehicle with current odometer 9,400 km, add the latest service with next-service odometer 10,000 and no next-service date. With a 500 km threshold, edit Vehicle Details to 9,500 → Approaching, 10,000 → Due, 10,100 → Overdue. Verify Vehicle Overview and Reminders update. No date notification should be added for this mileage-only record. Change the threshold to 250 and check the boundary again.
15. **Production timing:** For actual date delivery, enable only On due date for a disposable source. Use today's date only if it is still before 09:00; otherwise use tomorrow. Observe delivery around 09:00 with the app backgrounded. Creating a today-due reminder after 09:00 must not fire immediately. Device battery policies may delay delivery.
16. **Quick safe test:** Build with `eas build -p android --profile preview` and install over the existing app without clearing data. Open Reminders -> Settings -> Notification testing -> Test notification in 10 seconds. Enable notifications above first. Tap once, background the app, and check the notification tray after approximately 10 seconds (Android power settings may delay it). Tap the notification and verify Reminders opens; repeat while foregrounded. Test denied permission and a disabled Vehicle reminders channel: a visible error should appear without scheduling. Scheduling failures are also logged. The test configures the Android channel before checking permission, uses a local non-repeating trigger and separate test identifier, and needs no push token/server. It does not write SQLite or change real intervals. A production build must have no test section.
17. **Time zone/channel/recovery:** On a test device, change time zone and reopen LifePilot; verify local 09:00 targeting is rebuilt. Disable only the Vehicle reminders channel and check the neutral disabled state. If scheduling/cancellation fails, restore permission/storage availability and use Refresh notifications; records must remain intact.

## Still unverified

No emulator, Expo Go, APK build/install, real-device notification delivery or native visual testing was performed. Permission dialogs, channel behavior, battery/Doze delays, reboot restoration, foreground display, cold-start notification navigation, hardware Back and real installed-v6 migration need the checklist above. Automated scheduling tests validate logic against a mock OS, not actual delivery. Finite OS pending limits and time-zone changes while the app stays terminated remain platform constraints described above.

## Preview test visibility fix

Previously both the Settings button and scheduling helper required `__DEV__`. EAS preview produces a release APK, so both checks disabled testing. There were no Expo Go or environment checks. The UI also requires successfully loaded settings.

`eas.json` now sets `EXPO_PUBLIC_APP_VARIANT=preview` for preview and `production` for production. The shared `test-build.ts` guard enables preview or development, explicitly blocks production, and disables unknown/unset release variants. Both UI and scheduler use it. This public build flag is configuration, not a secret. Custom internal profiles must explicitly opt in with the preview value; distribution alone does not enable it. Rebuild the APK after changing the flag. If adding OTA updates later, preserve the corresponding variant when bundling updates.

Changed for this fix: `eas.json`, `src/features/reminders/test-build.ts`, `src/features/reminders/notifications.ts`, `src/app/reminder-settings.tsx`, `scripts/test-reminders.cjs`, and this document. No database/schema, storage, dependencies or real reminder calculations changed. Tests cover preview/production/development/unknown gates, channel-before-permission, denial, disabled channel, the 10-second local trigger and propagated native errors.
