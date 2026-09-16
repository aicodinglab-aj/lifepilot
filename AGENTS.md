# LifePilot — Agent Instructions

## Expo SDK 57

This project uses Expo SDK 57.

Expo APIs have changed between SDK versions. When working with Expo APIs,
native modules, React Native APIs, or dependencies, verify the implementation
against the exact Expo SDK 57 documentation:

https://docs.expo.dev/versions/v57.0.0/

Do not assume APIs or behavior from older or newer Expo versions.

## Project Stack

- React Native
- Expo SDK 57
- TypeScript
- Expo Router
- expo-sqlite
- Expo FileSystem
- Expo Image Picker
- EAS Build
- Offline-first architecture

## Before Making Changes

Always inspect the existing implementation before writing code.

Reuse existing:
- components
- services
- database helpers
- storage helpers
- types
- theme constants
- navigation structure

Prefer the smallest safe change.

Do not rewrite working functionality just because another implementation
is possible.

Do not modify unrelated code unless it is required to complete the task.

## Data Safety

LifePilot stores persistent user data.

Never:
- reset the SQLite database to fix a problem
- delete existing data during migrations
- delete user photos during debugging
- drop tables without a safe migration
- clear application data automatically
- use destructive migrations as shortcuts

All database schema changes must use versioned migrations and preserve
existing data.

Use parameterized SQL.

## Application Domains

LifePilot contains two separate domains:

1. Vehicle Manager
2. Personal Expense Manager

Vehicle expenses must remain separate from Personal Expense Manager data.

Shared infrastructure and reusable UI components are allowed, but business
data must remain logically separated.

## Vehicle Data

All vehicle-specific records must belong to the correct vehicle ID.

This includes:
- photos
- service records
- service bills
- insurance
- PUC
- documents
- fuel logs
- charging logs
- maintenance
- reminders

Never allow operations on one vehicle to modify another vehicle's data.

## File and Photo Storage

Do not store full images inside SQLite.

Store files in LifePilot-owned app-private filesystem storage and keep
metadata/references in SQLite.

Preserve the existing vehicle-photo storage architecture.

Validate filesystem paths before deletion.

Never delete files outside LifePilot-owned directories.

Expo/Android URIs may contain encoded characters such as `%`.
Do not reject valid URIs simply because they contain encoded characters.

Verify whether Expo filesystem operations are asynchronous in SDK 57 and
await them when required.

For performance, avoid loading full-resolution images unnecessarily.
Prefer thumbnails/resized images for lists and load full-resolution images
when needed.

## Navigation

Use Expo Router.

Inspect the existing `src/app` route structure before creating routes.

Do not create duplicate Home screens or parallel navigation systems.

Do not reintroduce default Expo starter screens or tabs.

Secondary screens should have sensible in-app back navigation, and Android
system Back should work correctly.

## UI

Follow the existing LifePilot black/emerald theme.

Reuse the centralized theme and existing components.

Do not introduce unrelated UI redesigns while implementing a feature.

Do not display fake production information.

For missing information, prefer states such as:

`Not added`

## Performance

Keep performance in mind while implementing features.

- Avoid unnecessary re-renders.
- Avoid unnecessary database queries.
- Do not load all vehicle data when only one vehicle is required.
- Use efficient SQLite queries.
- Add indexes when justified.
- Use virtualized lists such as FlatList for potentially large lists.
- Avoid unnecessary full-resolution image decoding.
- Keep application startup lightweight.

Do not add complicated optimization or caching without a demonstrated need.

## TypeScript

Maintain strong TypeScript typing.

Avoid `any` unless genuinely necessary.

Do not hide TypeScript problems using unsafe casts merely to make the build
pass.

The project uses React Compiler. Do not add `useMemo`, `useCallback`, or
`React.memo` automatically unless there is a real reason.

## Dependencies

Do not add or upgrade dependencies unnecessarily.

Before adding a native/Expo dependency:
1. Check whether the existing stack already provides the functionality.
2. Verify compatibility with Expo SDK 57.
3. Prefer maintained packages.

Do not upgrade Expo SDK or major dependencies as part of an unrelated task.

Do not run:

npm audit fix --force

unless explicitly requested and the impact has been reviewed.

Do not delete `package-lock.json` as a dependency troubleshooting shortcut.

## EAS / Android

Preserve the existing:
- Android package ID
- EAS project configuration
- signing/keystore configuration

Do not reconfigure EAS unless required.

Do not increase the minimum supported Android version unnecessarily.

## Privacy

LifePilot is offline-first.

Do not:
- upload user data automatically
- add analytics/tracking without approval
- send photos/documents to external services without an explicit feature
- hard-code secrets or credentials

Core vehicle and expense functionality should work without internet access.

## Testing

After meaningful code changes, run:

npx tsc --noEmit

Run relevant tests and lint checks where appropriate.

For database changes, verify:
- fresh database creation
- migration of an existing database
- preservation of existing data

For filesystem changes, verify:
- successful operation
- failure handling
- path isolation

Do not claim emulator, Expo Go, standalone APK, or real-device testing was
performed unless it was actually performed or confirmed by the user.

If full-project lint fails because of an existing unrelated problem, report
it rather than modifying unrelated code automatically.

## Git

Do not commit or push unless explicitly requested.

Do not force-push or rewrite Git history.

## Scope Control

Do not fix unrelated issues while completing a focused task unless they
block the requested work.

If a requested change could:
- cause data loss
- require a destructive migration
- significantly change architecture
- change the Android package ID
- upgrade Expo
- replace SQLite
- replace Expo Router

stop and explain the impact before proceeding.

## Completion

At the end of each task, provide a concise summary containing:

- What was implemented
- Files changed
- Database/storage impact
- Tests/checks performed
- What still requires manual testing
- Any relevant risks or follow-up work

Never claim a feature is complete when only its UI or placeholder has been
implemented.

## Core Principle

Preserve working LifePilot functionality.

Prioritize:

1. User data safety
2. Correctness
3. Existing architecture compatibility
4. Maintainability
5. Performance
6. Simplicity

Extend the existing working architecture instead of unnecessarily
rebuilding it.