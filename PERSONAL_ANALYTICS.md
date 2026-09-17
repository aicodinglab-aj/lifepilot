# Personal Expense Dashboard & Analytics

## Implementation

The Personal Expense dashboard now shows the selected calendar month with Previous month, Next month and Current month controls. It starts on the device's local current month. Explicit month selection survives screen focus changes; a clock/foreground check tracks the current month without resetting an explicit selection. January/December transitions use calendar arithmetic. Navigation is bounded to years 0001–9999.

For the selected month:

- Income, Expenses, Balance, and separate income/expense transaction counts.
- Expense and income category breakdowns with amount and one-decimal percentages, sorted by amount descending and category name/ID for ties.
- Top three spending categories derived directly from the expense breakdown; inactive categories are omitted.
- Full-calendar-month comparison with the previous month, including each amount and a neutral higher/lower/unchanged description. No previous-month transactions is explicitly distinguished from recorded activity. The screen explains that an in-progress month is not a like-for-like elapsed-days comparison.
- Six-month spending trend ending in the selected month, with an optional Income and expenses mode. Missing months are filled with zero. At the earliest supported dates fewer than six calendar months exist.
- Deterministic insights: highest/tied-highest expense category and share, expense difference when both months contain expense activity, or income-only activity. Empty months show insufficient activity. No advice or financial judgments.
- Five recent transactions for the selected month, Add Transaction and View All Transactions.

Comparison, complete category lists and insights are expandable to keep the dashboard manageable. Top Spending and the trend remain visible. No average-daily-spending metric was added because partial-month/future-dated activity would require an additional product definition.

Tap a category in either breakdown or Top Spending to open the existing paginated history with month, type and category filters. Clear category filter removes the category restriction. Changing type also clears the category so it cannot silently restrict Income to an expense category. Existing All dates and pagination behavior remain available. Route filter values are validated/bound as parameters, never interpolated into SQL.

## Database and precision

**No migration was needed. Schema remains v8.** No stored totals, schema changes, resets or file operations were added. Personal analytics read only `personal_transactions` and `personal_categories`; service costs, insurance premiums, PUC costs and all other vehicle data remain separate.

`database/personal-analytics.ts` executes one parameterized SELECT containing two UNION ALL aggregate branches:

1. Six-month date-range scan grouped by calendar month and transaction type, using SUM and COUNT.
2. Selected-month date-range scan grouped by category/type, joined to personal category labels.

One statement gives both sets the same SQLite read snapshot. Existing date/type/category indexes are sufficient; no separate transaction around these reads interferes with other app operations. Monthly rows are limited by grouping to 12; category rows represent only active selected-month categories. The default category catalog has 15 entries. No individual transactions are fetched to calculate totals.

SQLite integer sums/counts cross the native bridge as text. Exact BigInt arithmetic stays internal, and repository objects expose decimal strings for React/JSON safety. Balance subtracts integer totals. Percentages use integer multiplication/division with rounding to one decimal, with zero-total protection. Rounded shares may not add to exactly 100%. Large financial values are never converted to floating-point Numbers for comparison, totals or sorting. SQLite's signed 64-bit SUM limit still applies; overflow produces a load error instead of a rounded financial result.

The lightweight chart uses existing React Native View/Text components. Bars share the maximum displayed monthly total as a scale. Only the resulting bounded 0–100 percentage is converted to Number for the width; exact INR labels remain visible. Very small amounts may round to zero bar width but retain their exact text label. Zero months have empty bars and ₹0 labels. Horizontal full-width rows and wrapping text accommodate small screens and large amounts. No new dependencies or native setup are required.

## Refresh and performance

Queries run on selected-month changes, focus, foreground or explicit retry, through the existing personal query hook. Returning from Add/Edit/Delete refreshes analytics. Stale requests cannot replace the latest results; a month/result guard prevents labeling a previous month's totals with the newly selected month. Expanding a section or switching chart mode does not query SQLite again.

The recent transaction query stays limited to five records plus a pagination sentinel. History retains 40-row keyset pagination and database-side category filtering. No photos/filesystem work or vehicle repository calls are performed.

## Files

Added:

- `src/database/personal-analytics.ts` — aggregate query and serialized analytics result
- `src/features/personal/analytics.ts` — types, exact percentage/comparison calculations and deterministic insights
- `src/components/personal/analytics.tsx` — expandable sections, category drill-down and native trend bars
- `scripts/test-personal-analytics.cjs` — SQLite-backed analytics regression suite
- `PERSONAL_ANALYTICS.md` — this guide

Modified:

- `src/app/personal/index.tsx` — selected-month dashboard and refresh behavior
- `src/app/personal/history.tsx` — validated category/month/type route filters and clear control
- `src/database/personal.ts` — parameterized category history filter
- `src/features/personal/date.ts` — centralized month shifting, labels and six-month range

Existing add/edit save recovery, error boundaries, integer-paise storage, vehicle functionality, SDK/dependencies and EAS signing configuration were preserved.

## Checks performed

- `npx tsc --noEmit` — passed
- `node scripts/test-personal.cjs` — passed, including earlier runtime-boundary/save-navigation regression tests
- `node scripts/test-personal-analytics.cjs` — passed
- ESLint on every changed/new TypeScript and test file — passed
- `git diff --check` — passed

Analytics tests cover monthly summaries/counts, separate category totals/order, percentages/zero protection, previous-month comparison, January/December and earliest/latest month boundaries, six-month zero filling, income-only/expense-only/empty states, deterministic tie wording, JSON-safe large values, category filtering/SQL binding, changes after add/edit/delete, and preservation of vehicle records/reminder metadata. A 100,001-row fixture checks exact totals above Number's safe range and bounded aggregate result counts. EXPLAIN QUERY PLAN confirms date-index use. Schema version remains unchanged after analytics.

The existing personal suite checks local dates in three time zones via child processes; it was run with sandbox escalation for that requirement. No vehicle/shared infrastructure code changed in this milestone, so the vehicle suites were not rerun. Analytics tests explicitly seed vehicle service/insurance/PUC costs and verify they never enter personal totals or change during personal operations.

## Exact preview APK test plan

Use disposable personal transactions and record any pre-existing totals before adding test amounts. Expected figures below assume September/October 2026 are otherwise empty; if those months already contain real data, compare changes against the existing totals.

1. Build from `lifepilot`: `eas build -p android --profile preview`.
2. Install the resulting APK over the existing app with the same signing identity. Do not uninstall or clear app storage.
3. Verify existing vehicles, details, photos, service bills, insurance/PUC documents and reminder settings remain.
4. Open Personal Expense Manager from Home.
5. Open View All Transactions and verify existing v8 personal entries remain. Do not recreate any transaction from an earlier crash without first checking history.
6. Verify the current-month income/expenses/balance and counts against existing records.
7. Use Previous month and Next month; verify labels, totals and recent transactions change together. Tap Current month to return. Navigate away/back and confirm an explicitly selected month is retained.
8. Navigate December 2026 → Next → January 2027 → Previous → December 2026. Confirm comparison/trend year labels follow correctly.
9. Add September 2026 expenses: Food ₹100 on September 1; Food ₹50 on September 30; Groceries ₹50 on September 15. Return to September using month navigation if needed.
10. Verify Expenses ₹200, expense count 3, Food ₹150 and Groceries ₹50 (adjust for any pre-existing data).
11. Expand Expense category breakdown: expect Food 75.0% and Groceries 25.0%. Tap Food and verify history shows only September Food expenses. Test Clear category filter, type switching and All dates.
12. Verify Top Spending lists Food then Groceries and no inactive categories. For equal category totals, verify stable ordering and tied-highest insight wording.
13. Add September Salary income ₹1,000 and Interest income ₹10.
14. Expand Income category breakdown: expect Salary ₹1,000, Interest ₹10, income count 2, Income ₹1,010 and Balance ₹810. Expense totals/percentages must remain unchanged.
15. Add August Food expense ₹80 and Salary income ₹500. In September's Monthly Comparison, expect Expenses ₹120 higher and Income ₹510 higher than August. Select an empty earlier month and verify the no-previous-activity message and zero handling.
16. Add April Food expense ₹20. Select September: trend should span April–September with expenses ₹20, ₹0, ₹0, ₹0, ₹80, ₹200 where no other data exists. Toggle Income and expenses and verify same-scale bars with exact labels. Test a six-month period containing only zeros.
17. Edit September's ₹100 Food expense to ₹200 Groceries. Expect September Expenses ₹300, Groceries ₹250 and Food ₹50; counts stay 3. Move it to August and verify both months/comparison/trend update.
18. Delete September's remaining ₹50 Food transaction through explicit confirmation. Verify the affected totals/counts/breakdown/top category/insights refresh; unrelated records remain. First test Cancel as well.
19. Close/reopen LifePilot and verify the same stored results. Test an income-only month, an expense-only month and an empty month. No NaN, Infinity, undefined or null should appear.
20. Return to Vehicle Manager and confirm data, service costs, insurance/PUC and reminders remain unchanged. Changing a vehicle cost must not change personal analytics.
21. Test visible Back from dashboard → category history → details → edit and back. Add from dashboard/history, save, and verify updated analytics when returning.
22. Repeat using Android system/hardware Back. Check small-screen scrolling, expanded sections, long category labels and large INR labels. Confirm rapidly tapping Save creates only one transaction.

## Unverified

No APK build/install, real-device UI, Hermes rendering, performance profiling or Android Back test was performed here. Automated tests run on real temporary Node SQLite databases, not the phone's Expo bridge. The earlier reported post-save device exit still requires device confirmation/crash logs; passing analytics tests does not establish that it is resolved. No commits or pushes were made.
