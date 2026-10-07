# LifePilot

LifePilot is an offline-first mobile app for managing vehicles, personal finances, and tasks. It is developed by DMJ Labs. Core records are stored locally on the device; backup and restore are user initiated.

## Current modules

- Vehicle Manager
- Fuel / Charging
- Personal Expenses
- Personal Budgets
- Tasks
- Backup & Restore

Vehicle records and personal expenses remain separate. The current SQLite schema is **v11**.

## Stack

React Native, Expo SDK 57, TypeScript, Expo Router, expo-sqlite, Expo FileSystem, and Expo Image Picker.

## Development

```sh
npm install
npx expo start
npx tsc --noEmit
npx eslint .
```

Regression scripts are available under `scripts/` and run with Node, for example `node scripts/test-vehicle-photos.cjs`.

Recent milestones still require native Android verification. Automated checks do not establish device behavior; do not claim an APK, emulator, or real-device check unless it was performed.

See [docs/LIFEPILOT_MASTER_CONTEXT.md](docs/LIFEPILOT_MASTER_CONTEXT.md) for the canonical architecture and project status.
