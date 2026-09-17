# Personal Expense Manager Foundation

## Implemented

Home now opens a dedicated personal-finance dashboard. It shows current-local-month Income, Expenses and Balance from real personal transactions, plus the five most recent transactions across all dates. Empty totals are ₹0. Add, details, edit and explicitly confirmed deletion are available through Expo Router with visible Back controls. Screens use the existing black/emerald palette and shared form controls.

The reusable editor supports Expense/Income, amount, matching category, calendar date, optional description, payment method and notes. Switching type clears the category selection. Payment methods are Cash, UPI, Credit Card, Debit Card, Bank Transfer and Other, with Not added to clear the optional value. Description is limited to 200 characters and notes to 2,000. Invalid amounts/dates/categories are rejected; save errors remain visible. Editing updates the same ID and preserves created_at. Save actions reject overlapping taps.

History uses FlatList and database-side All/Expenses/Income and optional YYYY-MM filters. Newest dates appear first, with descending ID breaking ties. Keyset pagination fetches at most 41 rows, displays 40, and uses Previous/Next page controls. It retains only the current page's records and small cursor references, rather than accumulating all transactions. Queries use date/type/category indexes. Dashboard/detail/history reload on focus and app foreground; the dashboard also detects a local month rollover while open.

No vehicle costs are imported or included. No budgets, recurring transactions, receipts, personal notifications, charts, cloud services, authentication or new dependencies were added.

## Database v7 → v8

The existing migration runner adds v8 inside a transaction. It never drops/recreates existing tables or clears data. A failed v8 migration rolls back and retains v7. Existing vehicle tables, photo/document metadata and reminder metadata remain unchanged.

- `personal_categories`: text primary ID, name, expense/income type, is_system (defaults to 0 for future custom categories), created_at and updated_at. Unique type/name and id/type constraints. Fifteen stable system IDs are seeded with INSERT OR IGNORE once within the versioned migration: ten expense categories and five income categories. Reopening the app does not duplicate them.
- `personal_transactions`: integer autoincrement ID, type, integer amount in paise, category_id, transaction_date, nullable description/notes/payment_method, created_at and updated_at. A composite category/type foreign key prevents mismatches; deleting a referenced category is restricted. There are no vehicle foreign keys or personal-to-vehicle triggers.
- Indexes: `(transaction_date DESC, id DESC)`, `(type, transaction_date DESC, id DESC)` and `category_id`.

All user values are bound SQL parameters. Dates use validated `YYYY-MM-DD` strings; no UTC conversion is used for transaction dates. Timestamps use ISO instants. Category administration is reserved for a later milestone.

## Money and totals

`money.ts` centralizes parsing, edit-input conversion and Indian currency grouping. Input accepts plain digits or correctly grouped Indian amounts with at most two decimal places. It never silently rounds, accepts exponent notation or coerces invalid text. Positive amounts are limited to ₹99,99,99,999.99 per transaction; both validation and SQLite enforce integer paise.

The dashboard runs SQLite integer SUM queries restricted to the device's current local calendar month, inclusive of the first and last calendar dates. No transaction scan is loaded into JavaScript for totals. Aggregate integers cross the native bridge as text and are converted to BigInt internally; balance is exact integer income minus expenses, even above JavaScript's safe Number range. Totals are returned as decimal strings before entering React state/props. Formatting returns strings using integer operations. SQLite's signed 64-bit SUM limit remains the database limit; overflow produces a load error rather than a rounded total.

## Files

Added:

- `src/app/personal/index.tsx`: dashboard
- `src/app/personal/history.tsx`: paginated, filtered history
- `src/app/personal/edit.tsx`: reusable add/edit form
- `src/app/personal/transaction.tsx`: details and confirmed deletion
- `src/components/personal/ui.tsx`: personal page/header/actions/transaction cards
- `src/features/personal/transaction.ts`: model and validation
- `src/features/personal/money.ts`: money parsing/formatting
- `src/features/personal/date.ts`: local calendar dates/month boundaries
- `src/features/personal/use-personal-query.ts`: focus/foreground loading with stale-result protection
- `src/database/personal.ts`: parameterized repository and aggregation
- `scripts/test-personal.cjs`: SQLite and domain tests
- `PERSONAL_EXPENSES.md`: this implementation and testing guide

Modified:

- `src/database/migrate.ts`: additive v8 schema and category seeds
- `src/app/(tabs)/index.tsx`: enabled Personal Expense Manager card
- `scripts/test-vehicle-photos.cjs`, `test-vehicle-details.cjs`, `test-vehicle-services.cjs`, `test-vehicle-coverage.cjs`, `test-reminders.cjs`: expected latest schema v8 (and future-version rejection v9 where relevant)

No filesystem operations, vehicle business logic, notification calculations, EAS configuration, package versions or signing settings changed. Expo Router generated local types were regenerated using the offline Expo CLI.

## Automated verification

Run from `lifepilot`:

```text
npx tsc --noEmit
node scripts/test-personal.cjs
node scripts/test-vehicle-photos.cjs
node scripts/test-vehicle-details.cjs
node scripts/test-vehicle-services.cjs
node scripts/test-vehicle-coverage.cjs
node scripts/test-vehicle-deletion.cjs
node scripts/test-reminders.cjs
git diff --check
```

Changed-file ESLint covers the new personal files, migration, Home and modified test files. Personal tests cover populated v7 preservation (including gallery, bills, insurance/PUC documents and reminder schedules), v8 rollback, fresh schema, seed idempotence, expense/income creation/edit/deletion, matching category constraints, description/notes/payment validation, integer money, monthly totals/balance/boundaries, newest-first ordering, pagination/filtering, restart persistence and isolation in both deletion directions. A 100,001-row fixture verifies exact aggregates above Number's safe integer range and bounded history retrieval. Calendar checks run in Asia/Kolkata, America/Los_Angeles and Pacific/Auckland subprocesses.

The sandbox blocks Node child-process execution; time-zone suites require approval outside that sandbox. Offline Expo startup regenerated routes successfully; optional React Native DevTools installation reported spawn EPERM. Metro was then stopped. This is not an APK/device test.

## Exact manual APK checklist

Use a disposable set of personal test transactions. Do not clear app storage or uninstall the existing app.

1. From `lifepilot`, run `eas build -p android --profile preview`.
2. Download the resulting APK and install it over the existing LifePilot app with the same signing identity. Do not uninstall or clear data.
3. Open Garage. Verify existing vehicle details, gallery photos, service history/bills, Insurance/PUC records/documents, reminder settings and schedules survived the v7 → v8 upgrade.
4. Return to LifePilot Home and open Personal Expense Manager. Test its visible Back control, then reopen.
5. On first use, verify Income ₹0, Expenses ₹0, Balance ₹0 and No transactions yet. Existing vehicle service costs/premiums must not appear.
6. Add Expense: amount `125.50`, category Food, today's date, description Lunch, payment UPI. Leave notes empty. Save returns to the dashboard/history that opened Add. Open the saved transaction and verify details, including Not added for notes.
7. Add Income: amount `1000`, category Salary, today's date. Leave optional fields empty. Save.
8. Return to the dashboard. For only these current-month tests, expect Income ₹1,000, Expenses ₹125.50, Balance ₹874.50. Both should appear in recent transactions.
9. Close and reopen LifePilot. Verify both transactions and totals persist, with no duplicate categories.
10. Open Lunch → Edit. Change its amount to `200`, save, and verify only one Lunch transaction remains. Expect Income ₹1,000, Expenses ₹200, Balance ₹800.
11. Open View All Transactions. Check All, Expenses and Income filters; only matching personal transactions should appear.
12. Add a ₹10 expense dated the last day of the previous month and a ₹30 expense dated the first day of next month. Enter dates explicitly as YYYY-MM-DD.
13. Current-month totals must remain ₹1,000 / ₹200 / ₹800. Apply each other YYYY-MM month filter and verify the matching entry; tap All dates to reset. Edit one transaction's date into another month and verify both month totals respond, then restore its date.
14. Open Lunch → Delete. First tap Cancel and confirm it remains. Repeat and confirm Delete. Current-month totals should now be Income ₹1,000, Expenses ₹0, Balance ₹1,000.
15. Verify Salary and both out-of-month expenses remain. Edit a disposable transaction from Expense to Income: a matching income category must be required, and the same record must move between filters rather than duplicate.
16. Return to Vehicle Manager. Recheck all vehicle records/photos/documents/reminders. Personal actions must not change them. Adding or editing vehicle costs must not change personal totals.
17. Test visible Back controls through Home → Personal dashboard → History → Details → Edit; saving Edit returns to updated details. Repeat Add from both dashboard and history.
18. Repeat navigation with Android system/hardware Back. Verify keyboard dismissal, long notes, scroll behavior, empty filtered pages and small-screen layout.
19. Try zero, negative, three-decimal and malformed amounts; missing category; impossible date (2026-02-29); blank date. None should save. Verify optional fields can be cleared and a valid ₹0.01 transaction saves exactly.
20. With more than 40 disposable entries, verify Next/Previous pages, newest-first ordering with same-date ties, filter reset to page 1, and absence of duplicates. Quickly tap Save twice: only one new transaction should be created.

## Still unverified

No emulator, Expo Go, APK build/install, real-device migration, visual/keyboard testing or Android hardware Back testing was performed. Run the checklist on the new preview APK. Automated tests use real temporary SQLite files and a Node adapter, not the on-device Expo bridge. No commit or push was performed.

## Android post-save crash investigation

The reported preview-APK process exit has **not been reproduced or identified conclusively** on a device. No Android crash trace was available during this investigation. Source inspection establishes that the old handler awaited the SQLite insert before calling Router. A post-navigation crash can therefore leave the transaction committed, but whether the reported transaction persisted must be checked on that device.

Concrete defects/risks found:

- One try/catch covered both saving and navigation; after an insert followed by a navigation error, Save became available again and could duplicate the transaction.
- Aggregate objects contained BigInts in React state/props. They were not passed to native views or Router, and no existing JSON serialization of them was found. Their JSON incompatibility is demonstrable; it is **not proof of the reported crash**.
- TypeScript SQLite result types did not validate actual runtime values. Money formatting ran during rendering, outside the async query catch. Render errors and asynchronously dispatched navigation errors are not caught by a save-handler try/catch.

Inspected the installed SDK 57 SQLite Android implementation: SQL TEXT returns a Java string and SQL INTEGER returns a Java long for bridge conversion. `lastInsertRowId` is exposed as a number by the Expo API. The aggregate queries explicitly CAST SUM results AS TEXT. No evidence was found that Router receives a BigInt, that BigInt is sent to SQL/Alert/native modules, or that normal BigInt arithmetic itself is the failure. APIs checked against [Expo SDK 57 SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) and [Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/).

Changes for this investigation:

- `src/features/personal/save-flow.ts` (new): serializes save attempts, remembers the committed ID, separates write failure from navigation failure, and retries navigation without another write.
- `src/features/personal/diagnostics.ts` (new): fixed stage labels only. Preview/development logs save-start/success, navigation dispatch and query completion; failures log in every build. No amounts, IDs, SQL, notes or raw errors are logged.
- `src/components/personal/error-boundary.tsx` (new): Expo Router error recovery for personal-screen JS render errors. It warns that a transaction may already be saved; it does not catch Android native crashes.
- `src/app/personal/edit.tsx`: validates, awaits save, dismisses keyboard, returns to the originating dashboard/history/details with Back (direct-route fallback uses replace and a string ID). Prevents navigation after the editor loses focus. Saved state disables edits/reinsertion and provides Continue for recovery.
- `src/database/personal.ts`: validates amount/ID runtime values and returns aggregate decimal strings. Unexpected non-integer/unsafe values become query errors, not silently rounded/zero financial data.
- `src/features/personal/money.ts`: validates integer representations; accepts exact aggregate strings and formats them without losing precision.
- `src/features/personal/use-personal-query.ts`: stage logs and safe query-failure messaging.
- `src/app/personal/index.tsx`, `history.tsx`, `transaction.tsx`: export the scoped error boundary; detail navigation uses string IDs.
- `src/components/personal/ui.tsx`: card navigation uses string IDs.
- `scripts/test-personal.cjs`: serialization/runtime-type tests, precise post-insert totals/formatting, repeat-tap locking, navigation failure after a real insert, navigation-only retry, save-failure retry and existing edit coverage.
- `PERSONAL_EXPENSES.md`: findings, limitations and verification steps.

No change to migration v8, stored paise, existing transactions or vehicle code was made for this investigation.

### Device recheck

1. Before rebuilding, reopen the installed app and check whether the transaction from the crash already exists. Do not recreate it blindly.
2. Build `eas build -p android --profile preview` and install over the current app without uninstalling/clearing data.
3. Add a disposable ₹1.01 Expense and ₹2.02 Income, first from the dashboard and then from history. Tap Save rapidly twice. Each editor should create only one transaction and return to its originating screen.
4. Verify dashboard totals, history, details, edit and restart persistence. Edit one existing transaction and verify its ID/history entry is preserved.
5. If a screen recovery message appears, check history before retrying Add. If the editor says Transaction saved, Continue only retries navigation.
6. If the app still exits, capture Android's crash stack and the nearby `[PersonalExpense]` stages. With Android platform-tools and USB debugging configured, `adb logcat -b crash -d` reads crash logs without clearing them. Also capture relevant ReactNativeJS logs around the reproduction. Share the exception/stack and fixed stage lines, omitting unrelated sensitive logs.

`save-success` means the database promise resolved; `navigation-success` only means the navigation call returned, not that Android rendered the destination. `query-success` means the query completed. A native process exit or deferred navigation error can occur after these markers. Actual root cause and real-device resolution remain pending APK/log verification.
