# Personal Budgets V1 - Stages 1 and 2

Implemented: persistence, typed configuration/progress, repository/calculations and monthly Budget UI within Personal Expenses. Notifications, rollover, automatic copying, weekly/annual budgets and new category management are not implemented.

## Schema v11

The additive v10 -> v11 migration creates `personal_monthly_budgets` (primary key month) and `personal_category_budgets` (primary key month/category_id). Both contain positive integer-paise amount and created/updated timestamps; neither stores spending, remaining, percentages or status. Category budgets have a fixed expense discriminator and composite foreign key to existing personal_categories(id,type), with ON DELETE RESTRICT. A category/type index supports FK checks; primary keys serve monthly configuration reads. Existing tables and rows are unchanged.

## Dates, money and spending

Months are strict YYYY-MM local calendar months (0001-01 through 9999-12), validated with the existing Personal Expense monthRange helper. Inclusive start/end transaction_date text bounds match Personal Expense totals and analytics. No UTC conversion occurs; the default selected month comes from localToday. Creation/update timestamps are UTC ISO strings independent of the budget month.

Set/update APIs accept rupee strings through existing parseMoney: positive, at most two decimals, maximum 99,999,999,999 paise. Storage/configuration uses safe integer numbers. SQL integer SUM results cross the native bridge as decimal strings; BigInt arithmetic preserves exact totals and progress above Number.MAX_SAFE_INTEGER. SQLite signed 64-bit SUM limits still apply. Percentages are exact JSON-safe numerator/denominator decimal strings, representing percent (spent * 100 / limit); UI rounds for presentation only.

Actual spending comes exclusively from personal_transactions where type = 'expense' within the selected month, optionally grouped by existing category_id. Income and all vehicle fuel/charging/service/insurance/PUC costs are excluded. No amounts are copied into budget rows. One summary SQL statement gives all configuration and spending the same read snapshot. It uses the existing transaction type/date index and returns aggregate rows, not transaction history.

## API contract

`src/database/personal-budgets.ts` exports these operations; the first argument is the existing SQLiteDatabase:

- setOverallBudget(db, month, rupeeAmount, context?): create or replace that month's limit, preserving createdAt on conflict.
- updateOverallBudget(db, month, rupeeAmount, context?): update only; reject if not configured.
- removeOverallBudget(db, month, context?): idempotently remove configuration only.
- getOverallBudget(db, month): configuration or null.
- setCategoryBudget / updateCategoryBudget(db, month, categoryId, rupeeAmount, context?): same upsert/update-only rules, requiring an existing expense category.
- removeCategoryBudget(db, month, categoryId, context?): idempotently remove only this category/month configuration.
- getCategoryBudget(db, month, categoryId): configuration or null.
- listCategoryBudgets(db, month): configured budgets ordered by category ID.
- getMonthlyBudgetSummary(db, month?): overall configuration/progress and every existing expense category's configuration/progress.
- listCategoryBudgetProgress(db, month): all existing expense categories, including unconfigured ones.
- getCategoryBudgetProgress(db, month, categoryId): category/progress or null for an unknown/non-expense category.

All six mutations use withOperation around validation and the awaited statement. Nested callers share explicit OperationContext. Category writes use a friendly category check followed by an atomic FK-enforced statement. There is no private connection or background mutation. Maintenance rejects new operations and drains admitted writes.

## Progress and statuses

Stored OverallBudget and CategoryBudget types remain separate from derived BudgetProgress and MonthlyBudgetSummary in `src/features/personal/budget.ts`.

A missing limit yields configured=false and null limit/remaining/overBy/percentage/status, while retaining actual spending and transactionCount. A configured limit with no spending is ON_TRACK with zero spent, full remaining, zero overBy and a zero percentage. Counts distinguish no expense transactions from other states.

For configured limits, remaining = max(limit - spent, 0), overBy = max(spent - limit, 0). Status comparisons use exact integers, never rounded percentages:

- ON_TRACK: spent / limit < 80%.
- NEAR_LIMIT: 80% <= spent / limit < 100%.
- LIMIT_REACHED: spent == limit.
- OVER_BUDGET: spent > limit.

NEAR_LIMIT_PERCENT is centralized. Overall and category limits are independent: category limits need not sum to the overall limit, and overall spending includes unbudgeted categories. Months are independent. Every read reflects committed transaction addition, amount/category/date/type edits and deletion without synchronization rows or caches.

## Categories

Existing categories have ID/name/type/is_system, with no inactive flag. The application currently exposes seeded categories without custom creation/deletion UI. Budget APIs accept any existing expense category, including a non-system category introduced through supported data. No budget-specific category collection exists.

Existing transaction FKs restrict category deletion and type/ID changes while referenced. Budget FKs apply the same protection even when a category has no transactions. Remove budget configuration before deleting an otherwise unreferenced category; deleting a budget never deletes transactions. Renames retain identity and appear under the current name in historical progress; historical name snapshots are not stored. Future category management must preserve these restrictions rather than cascading history away.

## Backup and verification

Whole SQLite backups include both tables without changing .lpbackup or restore architecture. v10 restore migrates in isolation to v11 with empty budget configuration; v11 restore preserves limits and transactions, reproducing derived progress. Older supported schemas continue through normal migrations; newer schemas are rejected.

`node scripts/test-personal-budgets.cjs` passes seven groups covering migration/fresh creation/idempotence/rollback/preservation; CRUD/upsert/validation/missing states; exact thresholds, transaction edits and domain/month isolation; category restrictions; all mutation lifecycle gates/shared-context drain; real large SQLite sums; and actual v10/v11 SQLite backup restore. The existing SQLite/Expo bridge fixture is reused. Native APIs remain adapters in these tests.

Personal Expense, Personal Analytics, lifecycle, backup/restore/session/UI, Fuel, Tasks, Reminders and schema-affected vehicle regression scripts pass. TypeScript, changed-file ESLint and diff whitespace checks are required before delivery. No native Android, Expo Go, APK or EAS testing/build was performed.

## Stage 2 UI

Personal Expenses has a secondary Budget button below Add Transaction. It opens `/personal/budget` with the selected month; no top-level module was added. The budget dashboard reuses PersonalPage/ScreenHeader, V2 cards, buttons, status badges, EmptyState, spacing and semantic appearance colors. Previous/next/current month controls follow the existing Personal Expense convention. The selected month remains explicit; Current month reads the local calendar when tapped. Month switching never copies limits.

The overall card shows spent / limit, remaining or over-budget amount, percentage, status and an accessible progress bar. A missing overall limit says "No monthly budget set" with Set Monthly Budget; actual spending is separate, without a fictional zero limit or percentage. Category cards show only configured budgets. Set Category Budget opens the existing expense-category picker; unconfigured categories are never shown as zero-budget cards.

Human-readable status labels map directly from Stage 1: On track (success), Near limit (warning), Limit reached (warning), Over budget (danger). Status is not recalculated from rounded UI percentages. Percentage text rounds the exact rational value to one decimal using BigInt arithmetic; the visual fill floors to tenths and caps at 100%. Above-limit percentages remain uncapped in text, with overBy instead of negative remaining. Near boundaries the rounded percentage can read 80.0% or 100.0% while the exact Stage 1 status still describes the actual amount. The progressbar accessibility label/value includes the title, actual percentage, status and remaining/over-budget amount. Color is never the only status cue.

`/personal/budget-edit` handles overall and category limits for a fixed displayed month. Amounts use the same positive parseMoney validation and numeric keyboard as Stage 1. Selecting a category with an existing budget loads its amount, marks it Edit budget and uses updateCategoryBudget. New selections use setCategoryBudget; database uniqueness remains authoritative. Overall editing similarly uses update rather than silently recreating a removed budget. Shared controls show disabled/busy state and synchronous refs block duplicate submissions and removal dialogs.

Removal requires an explicit destructive confirmation naming the selected month. Only budget configuration is removed; transactions, categories, other category/overall limits and other months remain unchanged. After save/removal, navigation returns to that month's dashboard and reloads repository data. If navigation fails after persistence, a saved/removed state offers Continue without writing again. Finishing after blur never navigates the user away; the saved state is retained for return.

Dashboard progress uses getMonthlyBudgetSummary through existing usePersonalQuery focus/foreground refresh. Month mismatch and stale-read guards prevent old results appearing under a new month. Returning from transaction flows reflects committed additions, amount/category/month/type edits and deletions. There is no secondary spending cache. View month's expenses opens the existing filtered history. Editor foreground refresh retains the draft rather than unmounting the loaded form.

All UI mutations call the existing lifecycle-coordinated Stage 1 APIs; no direct SQLite writes or background mutations were added. Maintenance rejection has a readable message; unexpected storage errors are replaced with safe generic errors. There is still no category-deletion UI/service to intercept. Category FK restrictions remain covered by Stage 1; no category redesign or unused deletion flow was introduced. Future category deletion must explain that referenced budgets must be removed first and that transaction references also prevent deletion.

`node scripts/test-budget-ui.cjs` passes 12 groups using adapted hooks/native components and real SQLite mutations. Coverage includes entry/month routing, no-budget/configured states, exact threshold/status presentation, capped accessible progress, all appearance modes, set/edit/remove and duplicate handling, removal isolation, live focus/foreground transaction refresh, safe errors/navigation recovery, lifecycle rejection, completion after blur and stale month reads. Seven Stage 1 groups continue to cover vehicle exclusion, category FKs, exact large sums and actual v10/v11 restore. These are not native visual/device tests.

## Remaining limitations and manual verification

No rollover, automatic copying, weekly/annual budgets, reminders or category creation/deletion UI is included. Category limits need not sum to the overall limit. Percent text is rounded for display while statuses remain exact. The dashboard loads category aggregates only; the existing small expense-category set is shown in a wrapping picker.

Before release, verify preserved-data v10 upgrades and native budget persistence; overall/category set/edit/remove and cancellation; September/October switching; transaction changes and return refresh; 0/80/100/over-budget presentation; keyboard behavior, in-app and Android system Back, narrow screens, large fonts, TalkBack and all themes. Exercise rapid taps, background/resume, maintenance races and v10/v11 restore without clearing app data. No APK/EAS build or native Android verification was performed. The generated guide has structural/freshness checks; DOCX visual QA requires LibreOffice, unavailable here.
