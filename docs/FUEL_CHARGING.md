# Fuel / Charging V1 — Stages 1 and 2

Implemented: database/domain/repository/calculation foundation and vehicle-specific dashboard, add/edit, history and entry details UI. Vehicle Detail opens the active destination; old module links redirect to it. No dependencies, personal transaction writes, file attachments or backup format changes are introduced.

## Storage and validation

Additive migration v9 → v10 creates `vehicle_fuel_entries`, with an indexed `(vehicle_id, entry_date DESC, id DESC)` history and cascading vehicle foreign key. Existing tables and rows are preserved. One table uses kind-specific constraints; TypeScript discriminated unions expose only applicable refuel or charge fields.

Costs and optional quoted rates are integer paise (0–99,999,999,999); zero supports free charging. Odometers are integer metres (0–999,999,999,999). Positive quantities are integer thousandths (1–999,999,999): litres for Petrol/Diesel, kilograms for CNG, kWh for charging. Inputs accept at most two money decimals and three quantity/odometer decimals, without rounding. Dates must be real YYYY-MM-DD dates. Percentages are optional integers 0–100; after cannot be below before. Location is limited to 200 characters and notes to 2,000. Non-finite numbers, invalid IDs and incompatible fuel types are rejected.

Pure Petrol/Diesel/CNG vehicles accept matching refuels; Electric accepts charges. Existing Hybrid/Other types accept explicit supported energy sources but have no attributable efficiency calculation. There are no new vehicle types or inferred battery capacities.

## Repository and lifecycle

`src/database/vehicle-fuel.ts` exports:

- `createFuelEntry(db, vehicleId, input, context?)` and `updateFuelEntry(db, vehicleId, id, input, context?)`, returning the entry ID.
- `deleteFuelEntry(db, vehicleId, id, context?)` and `getFuelEntry(db, vehicleId, id)`; reads return null for absent/wrong-owner records, while missing mutation targets throw.
- `getFuelHistory(db, vehicleId, cursor?, limit?)`, returning entries and nextCursor; default 40, maximum 100. The cursor includes vehicle ID, date and ID. Same-day ordering uses insertion ID.
- `getFuelSummary(db, vehicleId, month?)`, defaulting to the current local month. Returns month/total spend, count, five recent entries, per-source purchased quantities and weighted paid prices, latest valid efficiency and cost/km.

Mutations use existing `withVehicleOperation` and share explicit OperationContext when nested. The lease covers validation, opening a private SQLite connection, enabling foreign keys, the transaction and awaited close. New mutations are rejected during maintenance; already admitted nested work can finish before exclusive ownership.

Create/update raises the vehicle odometer only for a higher reading, atomically with the entry in the same transaction and lease. Historical/lower readings and deletion never reduce it. Existing service behavior is untouched. Correcting an erroneously high vehicle reading remains a separate explicit vehicle edit.

## Calculations and assumptions

Spend and quantity summaries use integer SQL sums returned as decimal strings, then BigInt arithmetic; source units are never combined. Quoted unit price is optional metadata; total paid cost is authoritative. Weighted actual price is summed cost / summed quantity. Ratios are JSON-safe numerator/denominator strings. `formatFuelRatio` rounds only for display; monetary ratios remain in paise and need conversion for rupee display.

The efficiency scanner receives complete history newest first, including partial fills and all energy kinds. A refuel interval needs two full-tank boundaries with matching fuel type. It excludes the starting fill and includes all later partial fills plus the ending full fill. Distance / purchased quantity gives km/L or km/kg; interval paid cost / distance gives paise/km. Arbitrary consecutive partial fills never produce economy. Partials newer than the latest completed boundary remain unfinished.

Electric intervals use two explicitly recorded 100%-after-charge endpoints and measured kWh added between them, excluding the starting charge. Efficiency is km/kWh; input energy may include charging losses, so this is supplied-energy efficiency. Percentages never synthesize kWh. Hybrid/Other efficiency is unavailable.

Intervals require one vehicle, chronological date/ID order and strictly increasing odometers at every step. Mixed sources, equal or reversed readings invalidate an interval; the scanner can continue to an older valid interval. Incomplete boundaries return null, not zero. A completed interval assumes all purchases were logged and full endpoints are comparable; missing records, tank changes, fuel loss or inconsistent charging measurements cannot be detected. The dashboard exposes interval dates because the latest valid interval may be old.

History is vehicle-scoped and indexed. Summary scanning uses bounded pages and stops at the latest valid interval; worst case scans that vehicle's full history. Nothing is loaded globally or at startup. SQL sums retain SQLite's signed 64-bit limit.

## Backup and verification

The existing complete SQLite snapshot automatically includes this table. Current v10 backups restore directly; v9 backups migrate in isolation to v10 with an empty fuel table. `.lpbackup` and restore architecture are unchanged.

`node scripts/test-vehicle-fuel.cjs` exercises real Node SQLite databases with Expo bridge adapters: fresh/upgrade/rollback/preservation, CRUD and ownership, validation, exact large sums, paging, monthly totals, cascade deletion, odometer atomicity, valid/invalid efficiency, lifecycle suspension/drain and actual v9/v10 SQLite backup bytes through the existing backup engine. These tests do not establish native Expo/device behavior.

## Stage 2 UI and application integration

Vehicle Detail labels the module Fuel for Petrol/Diesel/CNG, Charging for Electric, and Fuel / Charging for Hybrid/Other. `/vehicle/fuel` shows current month/total spend, count, latest valid efficiency and cost/km, grouped weighted paid prices and five recent entries. Empty records have an Add action. Unavailable efficiency reads "Not enough data yet"; Hybrid/Other explains that efficiency cannot be attributed to one energy source. Completed intervals include their dates and assumptions. Individual history entries never claim efficiency.

`/vehicle/fuel-history` uses a FlatList and explicit Load more with the repository's 40-row keyset pages, retry on failure and guarded requests. `/vehicle/fuel-details` hides null and irrelevant fields, distinguishes quoted and actual unit prices, and provides Edit and confirmed Delete. Delete does not lower the vehicle odometer. All screens reload on focus; asynchronous read results are ignored after blur.

`/vehicle/fuel-edit` handles both add and edit. New entries prefill the local date and current vehicle odometer; edits use stored values. Historical readings remain allowed. Petrol/Diesel use L, CNG uses kg and Electric uses kWh, with matching price and efficiency units. Hybrid/Other can select a supported refuel source or charging. Electric forms contain measured energy, optional before/after battery percentages and optional Home/Work/Public/Other location. Full-tank help explains that one full fill is insufficient. Validation delegates to Stage 1 and appears inline; unexpected storage failures use safe generic messages.

Total paid is authoritative and editable. The optional quoted price is independent receipt metadata. Once valid total/quantity values exist, the form previews actual paid price using exact integer ratios, converted from paise to rupees and rounded only for display. It never overwrites total or quoted price and never loops between controlled fields. Battery percentages never infer energy.

Save/update/delete call the existing coordinated repository APIs. Synchronous ref guards prevent duplicate saves/pages and repeated delete dialogs; shared V2 buttons expose disabled/busy states. Save/delete continuations check focus before navigation. No new background writes, schemas, dependencies, file storage or personal expense integration were added in Stage 2.

The screens reuse ScreenHeader, V2 cards/buttons/chips/inputs/toggles/EmptyState, semantic appearance colors, scalable typography and wrapping layouts. History is virtualized; forms use numeric keyboards, persistent keyboard taps and iOS keyboard avoidance. Native Android resize/keyboard behavior still needs device verification.

`node scripts/test-fuel-ui.cjs` passes 11 focused groups using adapted React hooks/native components: active routes, ICE/Diesel/CNG/EV/Hybrid forms, empty/populated summaries, valid/null metrics, add/edit submissions, validation, exact amount preview, odometer prefill/history, conditional details, confirmed deletion, paging, duplicate prevention, failure/blur behavior and shared-theme wiring. These are automated component/integration checks, not visual or device tests. Stage 1's seven real-SQLite groups and vehicle/lifecycle/backup/restore/appearance regressions also pass.

## Remaining limitations and manual testing

No receipts, reporting/export, filters, inferred capacity, or Hybrid/Other efficiency were added. Calculations retain Stage 1's complete-log assumptions and bounded-memory scan behavior. Same-day records use insertion-ID ordering.

On a preserved-data native installation, verify v9 upgrade, each vehicle type's add/edit/detail/history flow, correct units, rounding, empty and unavailable states, full-fill intervals, vehicle isolation, higher/historical odometers, cancellation/deletion and restart persistence. Test narrow screens, large fonts, all appearance modes, TalkBack, numeric keyboards, in-app/hardware Back, rapid save/delete taps and save/restore races. Verify v9/v10 restore without resetting application data. No APK/EAS build, emulator or native Android testing was performed.
