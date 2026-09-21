# LifePilot – Master Project Context

Last repository review: 2026-09-21. Source code is authoritative if this document becomes stale. This is a snapshot of the checked-out repository, not proof of behavior on an installed phone.

## 1. Project Overview

LifePilot is an offline-first React Native app for managing vehicles, personal income and expenses, and tasks. The in-app About screen identifies the developer as **DMJ Labs**. Android is the active native build target; Expo configuration also includes iOS and static web targets, whose full behavior has not been verified here. The package/app version is 1.0.0. Development is active: core screens and local persistence exist, while some vehicle modules and native release verification remain outstanding.

## 2. Product Principles

- Keep Vehicle Manager, Personal Expenses and Tasks as separate domains. Vehicle costs never enter personal totals automatically, and task records do not share finance ownership.
- Preserve user data. Use additive, versioned SQLite migrations, parameterized SQL, and vehicle-scoped operations. Never reset data, uninstall the app or clear app storage to repair or test a migration on a data-bearing installation.
- Keep core functionality local and usable offline. Do not upload documents, add tracking, or introduce network dependencies to core flows without an explicit feature decision.
- Extend the existing architecture in small steps. Validate filesystem ownership before deletion and retain retryable cleanup state when file removal fails.

## 3. Technology Stack

Declared versions in `package.json`:

| Component | Declared version |
| --- | --- |
| Expo | `~57.0.20` (SDK 57) |
| React Native | `0.86.3` |
| React | `19.2.3` |
| TypeScript | `~6.0.3` |
| Expo Router | `~57.0.19` |
| expo-sqlite | `~57.0.2` |
| expo-notifications | `~57.0.19` |
| expo-file-system | `~57.0.6` |
| expo-image-picker | `~57.0.16` |
| expo-image | `~57.0.4` |
| React Native Reanimated | `4.5.1` |

React Compiler and typed routes are enabled in `app.json`. The checked-in Gradle wrapper targets 9.3.1; Android uses Hermes and the new architecture. `LOCAL_ANDROID_PREVIEW.md` records JDK 17, Android platform/build tools 36, and required NDK 27.1.12297006 for its attempted local build; these are environment observations, not package manifest constraints. No Node/npm engine range is declared. Tests are Node `.cjs` scripts; ESLint 9 and Expo lint are configured.

## 4. Architecture

```text
src/app/          Expo Router screens and layouts
src/components/   Shared forms and domain UI
src/constants/    Base LifePilot colors
src/database/     SQLite migration and domain repositories
src/features/     Domain logic, hooks, providers, notification reconciliation
src/storage/      Owned vehicle photo, bill, and coverage file operations
src/hooks/        Shared platform hooks
scripts/          Node regression tests, branding, local Android signing helper
assets/           Icon, splash, and supporting images
android/          Generated local native project, ignored by Git
```

`src/app/_layout.tsx` opens `lifepilot.db` through `SQLiteProvider`, runs `migrateDatabase`, and wraps navigation in appearance, vehicle reminder, and task providers. Repositories own SQL; features implement validation and workflows; storage modules own private file paths. Appearance preferences use a separate SQLite key-value file, `lifepilot-preferences.db`, outside the main versioned schema. The app uses no server data layer in these modules.

## 5. Navigation

`/` redirects to `/(tabs)`, whose `index.tsx` is the Home screen. The `(tabs)` layout uses `Slot`, not a visible starter tab bar. Home links to `/tasks`, `/reminders`, `/vehicle-manager`, `/personal`, and `/settings`. Vehicle routes live under `/vehicle/*` (details, edit, photos, management, service, insurance/PUC and coverage history); personal routes under `/personal/*`; task routes under `/tasks/*`. Secondary screens use Expo Router stack navigation and the shared icon-only `ScreenHeader`, with a minimum 44 x 44 Back target, consistent arrow sizing/alignment, an accessibility label of `Back`, and route-specific fallbacks. `src/app/vehicle/module.tsx` remains a placeholder route for some module keys; inspect actual route targets before describing a module as complete.

## 6. UI / Theme / Branding

The signature LifePilot palette in `src/constants/lifepilot-theme.ts` uses near-black `#0B1110`, emerald `#35D98A`, light text, muted text, cards, and borders. `src/features/appearance/*` provides LifePilot, Light, System, and Custom themes; custom themes select a dark/light base and an accent preset. The semantic resolver supplies background, surface, secondary surface, divider, primary, text, muted, income, expense, info, success, warning, danger and disabled roles across every appearance. Preferences are stored locally. `app.json` uses automatic system appearance, the LifePilot icon and adaptive Android foreground, and a dark LifePilot splash image. Settings and About use the shared V2 system; About preserves the LP/leaf icon, version/build information and DMJ Labs branding.

UI/UX V2 is implemented across the active product surfaces. `src/constants/design-system.ts` defines spacing (`xs` through `xl`), typography roles, radii, minimum control sizes, icon sizes and common layout geometry. `src/components/ui/*` provides standard, interactive and status cards; primary, secondary, tertiary and icon buttons; the shared Expo Router `ScreenHeader`; sections; selectable chips; form inputs, labels, messages, selectors and toggles; `EmptyState`; and semantic status badges. Legacy form adapters delegate to the V2 primitives so remaining vehicle service and coverage forms receive the same controls without changing validation or storage logic.

The V2 screen migrations include Home, Tasks and task forms/details, Garage and Vehicle Detail, Personal Expenses and analytics/forms/history, Vehicle Reminders and Reminder Settings, Settings, About, Add Vehicle, Edit Vehicle Details and other vehicle form controls. Layouts wrap for narrow screens and larger text, use vector icons where practical, and keep visible data ahead of settings or notification controls. Interactive controls retain accessibility roles/states and at least 44-point touch targets. Back navigation is consistently icon-only and uses the shared header rather than screen-specific arrow text or styling.

## 7. Vehicle Manager

Garage lists vehicles in compact V2 cards and opens the per-vehicle dashboard. Cover photos use a 16:9 presentation when present; a compact vehicle icon replaces the former large empty photo area when no cover exists. Add/edit supports registration, make/model, year, fuel type, odometer, and additional identity/purchase/warranty fields. Vehicle photos are copied to owned storage, can be selected during creation, and have one database-enforced cover photo per vehicle. Manage Vehicle has confirmed deletion and durable file cleanup. Vehicle Detail keeps identity and real Service, Insurance and PUC quick statuses prominent. Service & Maintenance has dated history, odometer, cost parts, next-service fields, and bill images. Insurance and PUC have dated records, history, document photos, status, and deletion/edit flows. Vehicle reminders derive from insurance, PUC and service records, with compact Upcoming, Overdue/Expired and Service mileage sections plus local notification settings. Important implementation files are `src/database/vehicles.ts`, `vehicle-photos.ts`, `vehicle-services.ts`, `vehicle-coverage.ts`, `reminders.ts`, their `src/features/vehicles/*` workflows, and `src/storage/*`.

Fuel/charging logs and reports are **not implemented**; the exposed Fuel / Charging destination intentionally shows the existing coming-later state. Vehicle photo management works. General-purpose vehicle document uploads remain planned even though insurance/PUC document photos and service bill images are implemented. Older placeholder metadata for service and insurance does not override their implemented dedicated routes and repositories. Device behavior for current photo/document and notification flows still needs final verification.

## 8. Personal Expense Manager

`/personal` displays a V2 selected-month dashboard with prominent balance, income, expenses, counts, category breakdowns, top spending, previous-month comparison, six-month trend, deterministic insights, and recent entries. Empty analytics use meaningful empty states instead of zero-only charts. Add/details/edit/confirmed delete support income and expense transactions, seeded typed categories, optional description/notes, and Cash, UPI, Credit Card, Debit Card, Bank Transfer, or Other payment method. History filters by type/month/category and uses a `FlatList` with 40-row keyset pages. Amounts are **integer paise**, parsed without rounding; aggregate values use SQLite integer sums and decimal strings/BigInt in analytics. Dates are local `YYYY-MM-DD`; timestamps are stored separately. Main files: `src/database/personal*.ts`, `src/features/personal/*`, `src/app/personal/*`, `src/components/personal/*`. Vehicle expenses remain separate unless a future deliberate architecture change is made. Custom category editing, budgets, recurring entries, and receipts are not implemented.

## 9. Tasks / To-Do

`/tasks` uses a V2 task-first dashboard. Today, Upcoming and All remain top-level; Overdue, No due date, Completed, category and priority filters live in a compact filter panel with active-filter display and reset. Task cards show available due date/time, category, priority and completion state; empty views use `EmptyState`; both dashboard and empty-state primary actions use the consistent `+ Add Task` presentation. Add/edit/details support title, optional description/category/date/time, low/medium/high priority, completion/reopen, confirmed deletion, and 40-row offset pages. Seeded categories are Personal, Work, Shopping, Home, and Other; there is no custom category editor. Dates are local `YYYY-MM-DD`, time is optional `HH:MM`, and reminders require both date and time. Completion stores a UTC timestamp; reopening clears it. Future valid reminders are scheduled locally and stale ones cancelled; past reminders are not scheduled on reopen. Main files: `src/database/tasks.ts`, `src/features/tasks/*`, `src/app/tasks/*`, `src/components/tasks/*`.

## 10. Database Architecture

`src/database/migrate.ts` is the authoritative schema history. It enables WAL and foreign keys, reads `PRAGMA user_version`, rejects a database newer than supported, and applies each missing version in a transaction. Current version: **9**. There is no separate migration folder. Tasks and `task_categories` are the latest schema addition at version 9. The UI/UX V2 work added no migration and made no database schema change.

| Version | Feature | Main changes |
| --- | --- | --- |
| 1 | Garage | `vehicles`, unique case-insensitive registration, vehicle identity and odometer. |
| 2 | Photos | `vehicle_photos`, vehicle/order index, partial unique cover index; initially restrictive FK. |
| 3 | Safe deletion | Rebuilds photo table with cascading FK while copying rows; adds `vehicle_deletion_cleanup`. |
| 4 | Vehicle details | Adds chassis, engine, transmission, color, purchase, dealer, warranty and notes columns. |
| 5 | Services | `vehicle_services`, `service_bill_photos`, `service_bill_cleanup`, history/owner indexes and cleanup trigger. |
| 6 | Insurance/PUC | Coverage records/documents, expiry/history/owner indexes, coverage cleanup table and triggers. |
| 7 | Vehicle reminders | Preferences, intervals, change revision, sources, schedule, notification cleanup, indexes and change/cancellation triggers. |
| 8 | Personal finance | Typed categories, integer-paise transactions, default categories, date/type/category indexes. |
| 9 | Tasks | Categories and tasks, default categories, due/completion/category/priority indexes. |

Core tables: `vehicles` (integer ID, registration, make/model, odometer and optional details); `vehicle_photos` (text ID, vehicle ID, URI, cover); `vehicle_services` (text ID, vehicle ID, date, odometer, costs, next due); `service_bill_photos` (vehicle and service owner, URI); `vehicle_insurance`/`vehicle_puc` (vehicle ID, expiry, amount and revision); `insurance_documents`/`puc_documents` (composite owner and URI); reminder preference/interval/source/schedule/cleanup tables; `personal_categories`/`personal_transactions`; `task_categories`/`tasks`. Cleanup tables retain jobs after parent deletion and intentionally lack parent FKs. Vehicle children otherwise cascade on vehicle deletion; personal transaction categories restrict deletion; task category deletion sets task category to null. Composite `(vehicle_id, record_id)` foreign keys prevent cross-vehicle document ownership. Reminder source and schedule foreign keys cascade, with triggers recording native notification cleanup. The full DDL and exact constraints/index columns are in `migrate.ts`.

Personal transaction `amount` is integer paise. Older vehicle price/service/coverage amount columns are SQLite `REAL`; do not assume their precision matches personal finance. Calendar dates use ISO-like text, usually `YYYY-MM-DD`; creation/update timestamps are text; reminder `fire_at` is an integer epoch time. Future migrations must preserve existing rows and test both fresh and upgrade paths. Version 3 is a data-copy table rebuild, not a data-discarding reset.

## 11. File Storage

SQLite stores metadata and `local_uri`, not full images. `expo-file-system` stores vehicle photos under `Paths.document/vehicle-photos/<vehicleId>`, bills beneath `service-bills/<serviceId>`, and coverage documents beneath `<insurance|puc>/<recordId>/<documentId>`. Picker/camera source files are copied into these owned directories. Storage helpers validate IDs and decoded URI **segments**, then rebuild the target from owned paths before access/deletion; encoded characters in valid Expo URIs are supported. Database cleanup jobs allow retry after a deletion succeeds but file removal fails. Removing the app or clearing its app data removes the private database and owned files; it is not an update procedure.

## 12. Notifications

Vehicle reminders use `vehicle-reminders` Android channel and persisted source/schedule/cleanup metadata. Preferences and due-date offsets control scheduling; reconciliation compares desired reminders with OS scheduled inventory, handles capacity/failures, and cancels obsolete IDs. Mileage threshold supports in-app reminder status; date-based local notifications come from insurance, PUC, and next-service dates. Tasks use a separate `task-reminders` channel and `lifepilot.tasks.v1:` IDs. Task reconciliation reads incomplete future candidates in pages, reserves capacity for other notifications, and uses the native scheduled inventory for cancellation retry. Both domains share one foreground handler and response handling but remain separate in data and IDs. Permission is requested through explicit UI; denial does not prevent saving records.

The former Expo Go startup crash was caused by a static top-level `expo-notifications` import reachable from the root providers. Expo Go evaluated the unsupported native module during startup, then Expo Router emitted misleading missing-default-export warnings after module evaluation failed. `src/features/notifications/runtime.ts` is now the native capability boundary. It detects Expo Go through `Constants.expoGoConfig`, not `ExecutionEnvironment.StoreClient` because that broader value also covers development builds. In Expo Go and on web it returns unavailable without importing `expo-notifications`; database-backed vehicle reminders, task records, Personal Expenses, vehicle data and all other UI remain active. Native channels, permissions, OS scheduling/cancellation, foreground listeners, response navigation and test notifications are unavailable there and the UI reports that state without claiming success.

Development, preview and production native builds have no Expo Go config, so the runtime dynamically imports the existing `expo-notifications` implementation and retains permission, scheduling, cancellation, reconciliation and response behavior. Preview/development builds expose a short-delay vehicle test notification; production hides it. Installed-build behavior still requires target-device verification, including permissions, delivery, taps, timezone changes and cancellation.

## 13. Testing

Run `npx tsc --noEmit`, `npm run lint`, and relevant Node regression scripts in `scripts/test-*.cjs`; run `git diff --check` before delivery. Tests cover vehicles, photos, deletion, details, services, coverage, reminders, personal transactions/analytics, tasks, appearance and overview. Database tests include migration preservation/rollback scenarios described in the feature notes. During the V2 stages, TypeScript, changed-file ESLint, task tests, appearance tests, vehicle details/photos/services/coverage/deletion/overview tests, reminder tests, personal transaction tests and personal analytics tests completed successfully in their relevant stages; `git diff --check` also passed. There is no `tests/` directory or Jest script.

Automated Node checks do not prove Android/iOS filesystem behavior, the Expo SQLite bridge, native notification delivery, UI layout, large-text wrapping or hardware Back behavior. Expo Go is currently used for UI and manual Android testing. A final full-device regression across all V2 screens and a supported native build is required before release; preserve existing installed data during that work.

## 14. Development Environment

Repository workflow is Windows/PowerShell; no VS Code configuration is checked in. `npm install`, `npx expo start`, and `npm run android` are declared paths. Android Studio/SDK Manager is needed for local native builds and an emulator/device; `LOCAL_ANDROID_PREVIEW.md` records the attempted local environment, required JDK/NDK, and Gradle command. Verify installed tools on the actual machine before building; the historical environment notes are not a portable guarantee. No iOS native project is checked in.

## 15. Git Workflow

At the original repository review, branch `master` tracked `origin/master`. Make small, reviewed changes; run relevant checks; create a commit/checkpoint only when explicitly requested. Do not push or rewrite history without an explicit request. `.gitignore` excludes generated `android/` and `ios/`, local env files, `credentials.json`, keystores and private key formats. Ignoring a file does not secure it. `scripts/reset-project.js` is an Expo starter utility and should not be used on this developed app.

## 16. Android / EAS Build System

Android application ID is `com.ajaydmja.lifepilot` in `app.json` and generated `android/app/build.gradle`. EAS project ID is public configuration in `app.json`; `eas.json` has development client/internal, preview/internal APK (`EXPO_PUBLIC_APP_VARIANT=preview`), and production (`EXPO_PUBLIC_APP_VARIANT=production`, `autoIncrement`) profiles. EAS uses **remote** app version source. `app.json` has version `1.0.0` and no Android versionCode; the current generated native file says versionCode `1`/versionName `1.0.0`, which may differ from a device's EAS-managed code. The generated Android folder is ignored and can be regenerated, so preserve/reapply reviewed local modifications. Its release build applies `scripts/android-preview-signing.gradle`, which requires preview variant and reads an existing local ignored EAS credential file into Gradle without embedding credentials in tracked source.

Expo Go is the current UI/manual-testing runtime. Native notification testing requires a development, preview or production build. Local preview APK troubleshooting is unresolved and paused: `LOCAL_ANDROID_PREVIEW.md` reports that the required NDK download failed, and no release APK, signer or installed update was successfully verified. EAS preview is the intended supported build route when service access is available. Production EAS signing state and installed-device signature remain unverified; do not claim a successful APK build from the current evidence.

## 17. APK Update Safety

Before installing a locally built APK over a data-bearing installation, verify: (1) package ID equals `com.ajaydmja.lifepilot`; (2) signer certificate fingerprint matches the installed APK, using `apksigner`; (3) new `versionCode` is compatible with the installed version, using device package info and `aapt`; (4) migration from the installed database version to v9 preserves rows; (5) existing app-private files and cleanup state are retained. Pulling an installed APK for signature comparison does **not** back up the database or photos. Do not uninstall LifePilot or clear app storage when existing data must be preserved. Never substitute a debug-signed APK for an installed differently signed build. See `LOCAL_ANDROID_PREVIEW.md` for the read-only comparison workflow.

## 18. Known Issues

| Status | Affected area | What is known | Recommended next action |
| --- | --- | --- | --- |
| Paused | Local Android preview | Last documented release attempt failed downloading NDK 27.1.12297006; no APK/signature was verified. | Prefer the supported EAS preview route when available; resume local troubleshooting only as a separately scoped task. |
| Needs device verification | Personal save | `PERSONAL_EXPENSES.md` records a past Android post-save exit investigation; automated save/navigation tests pass, but latest device outcome is not established by source. | Recheck on current preview APK and collect logs if reproduced. |
| Needs device verification | Native workflows | Coverage/media, task and vehicle notifications, migration on existing installation, hardware Back, installed-APK update, and the Expo Go startup path have incomplete real-device verification in feature notes. | Confirm Expo Go starts without notification module evaluation, then execute native-build notification and other targeted checklists. |
| Planned | Backup & Restore | There is no implemented transfer workflow for the SQLite database and owned photos/documents. | Design a data-safe export/import format and validation flow before changing storage or schema. |
| Open documentation debt | README and vehicle module metadata | README is starter text; Fuel / Charging remains a coming-later route while service and insurance use dedicated implemented routes. | Update product-facing descriptions and README in a separate scoped change. |

## 19. Future Roadmap

**Next planned capability:** Backup & Restore so users can transfer LifePilot data, vehicle photos and stored documents to another phone. It is not implemented. The design must preserve ownership relationships, validate imported paths/data, avoid destructive replacement by default, and cover both database and owned files.

Other planned or future candidates are fuel/charging logs and reports; general vehicle document uploads; personal budgets, recurring entries, receipts and custom category editing; and task recurring items, subtasks, custom categories and attachments. These are **not implemented**. Cloud account and synchronization remain future work after local backup/restore; no cloud data layer or account system exists today. Any future scope should be confirmed before creating schema or UI.

## 20. Important Files

| File or directory | Purpose |
| --- | --- |
| `AGENTS.md` | Data safety and contributor instructions. |
| `package.json`, `app.json`, `eas.json` | Dependencies, Expo identity/plugins, build profiles. |
| `src/app/_layout.tsx`, `src/app/(tabs)/index.tsx` | App bootstrap and Home. |
| `src/database/migrate.ts` | Versioned schema and migration history. |
| `src/database/{vehicles,vehicle-photos,vehicle-services,vehicle-coverage,reminders}.ts` | Vehicle repositories. |
| `src/database/{personal,personal-analytics,tasks}.ts` | Personal and task repositories. |
| `src/features/reminders/*`, `src/features/tasks/*` | Notification and task workflows. |
| `src/features/appearance/*`, `src/constants/lifepilot-theme.ts` | Theme resolution and palette. |
| `src/constants/design-system.ts`, `src/components/ui/*` | UI/UX V2 semantic tokens and reusable interface primitives. |
| `src/storage/*` | Owned file import, path checks, deletion. |
| `scripts/test-*.cjs` | Regression suites. |
| `scripts/generate-project-guide.py`, `docs/LifePilot_Project_Guide.docx` | Development-only Markdown-to-Word generator and its reading copy. |
| `scripts/android-preview-signing.gradle`, `LOCAL_ANDROID_PREVIEW.md` | Local preview signing setup and verified build status. |
| `VEHICLE_*.md`, `PERSONAL_*.md`, `TASKS.md` | Feature notes and manual test plans. |

## 21. Important Technical Decisions

Dates below are **recorded here**; original decision dates are not established from source.

| Decision | Reason | Date recorded | Impact |
| --- | --- | --- | --- |
| Expo/React Native with Expo Router | One routed TypeScript application for configured targets. | 2026-09-21 | Native APIs must be checked against SDK 57. |
| Local SQLite and additive migrations | Offline operation and persistent data safety. | 2026-09-21 | `user_version` gates every schema change. |
| Media outside SQLite | Keep binary files in owned private storage. | 2026-09-21 | Metadata and durable cleanup jobs remain in SQLite. |
| Separate expense domains | Vehicle costs and personal finance have different ownership. | 2026-09-21 | No implicit cross-domain aggregation. |
| Local notification reconciliation | Keep OS schedule aligned with SQLite records and retry failures. | 2026-09-21 | Vehicle/task IDs and channels are distinct. |
| Preserve signing identity for updates | Android updates depend on package/signature/version compatibility. | 2026-09-21 | Compare actual APKs before installing over existing data. |
| Shared UI/UX V2 system | Centralize visual roles and navigation behavior while preserving domain logic. | 2026-09-21 | Active screens use V2 tokens/primitives and the shared header; no schema change was required. |

## 22. Instructions for Future LLMs

Read this document first, then inspect the current repository; code overrides outdated text. Preserve all existing user data and vehicle ownership. Never reset SQLite to fix migrations; use versioned, additive, tested migrations. Keep vehicle and personal expense data separate. Keep files in validated LifePilot-owned directories and never expose secrets. Preserve Android package and signing identity. Do not commit/push unless explicitly requested. Verify Expo/native behavior against SDK 57 and on the relevant runtime/device. Explain migration, dependency and data-safety impact before major changes. For every significant feature, schema/index, dependency, SDK, Android build, signing, notification, storage, security, theme/navigation or release change: read this file, inspect changed code, update affected sections plus Current Project State and Known Issues, add a concise changelog entry, and remove stale claims. Avoid changelog noise for cosmetic edits.

## 23. Current Project State

- **Completed in source:** UI/UX V2 across Home, Tasks, Garage/Vehicle Detail, Personal Expenses, Vehicle Reminders/Settings, Settings/About and remaining vehicle forms; vehicle CRUD/photos/services/coverage; personal transactions and analytics; tasks; appearance themes; local reminder scheduling; Expo Go notification isolation; migrations through v9; and regression scripts.
- **In progress / unverified:** final full-device V2 regression, native notification/media testing, installed-data upgrade safety and current-device verification of the historical personal-save concern.
- **Paused:** local preview APK troubleshooting after the documented NDK download failure. No successful APK build is recorded. EAS preview is the intended supported build route when available.
- **Next:** design and implement Backup & Restore for transferring the database plus owned photos/documents between phones. Fuel/charging, general document uploads and cloud account/sync remain future work.

## 24. Changelog

| Date | Feature/change | Important technical impact |
| --- | --- | --- |
| 2026-09-21 | Created master context from current repository and existing feature notes. | Captures schema v9, domain boundaries, storage/notification design and unverified Android update state; no app behavior changed. |
| 2026-09-21 | Added a generated Word reading copy. | Markdown remains canonical; a Python standard-library script produces the DOCX without mobile dependencies. |
| 2026-09-21 | Isolated native notifications from Expo Go startup. | Expo Go keeps UI/database and in-app reminders without importing `expo-notifications`; native builds retain full notification behavior. |
| 2026-09-21 | Added UI/UX V2 Stage 1 shared design system. | Adds theme-aware tokens and reusable cards, buttons, headers, sections, chips, forms, empty states and status presentation; no business behavior or schema changed. |
| 2026-09-21 | Completed the staged UI/UX V2 migration and polish pass. | Home, Tasks, Vehicles, Personal Expenses, Reminders, Settings/About and vehicle forms use the shared semantic system and icon-only headers; accessibility and touch targets were standardized without a migration. |
| 2026-09-21 | Recorded Backup & Restore as the next planned capability. | Future transfer must include SQLite data and LifePilot-owned photos/documents; cloud account/sync remains later work. |

Documentation maintenance rule: update affected sections of this file in the **same work** as any significant implementation or architectural change. Do not rewrite it wholesale; verify paths, versions, implemented status and known issues against source each time. Never add credentials, tokens, signing passwords, private keys or environment secrets.

This Markdown is the canonical technical context. `docs/LifePilot_Project_Guide.docx` is a generated reading copy, created with `python scripts/generate-project-guide.py` after significant documentation changes. Do not edit the DOCX independently; if copies disagree, regenerate it from this file. The generator uses only Python's standard library and is never bundled with the mobile app.
