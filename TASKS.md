# Tasks / To-Do V1

Tasks are an independent offline SQLite domain. No task write updates vehicle,
vehicle-reminder, personal-transaction or personal-category tables.

## Schema (version 8 → 9)

The additive, transactional migration creates `task_categories` and `tasks`.
Categories use stable text IDs: personal, work, shopping, home and other. Seeds
are idempotent. Tasks use an integer ID, title, optional description/category,
low/medium/high priority, optional due_date/due_time, reminder_enabled, completed,
completed_at, created_at and updated_at. Category deletion sets category_id null.
Constraints enforce title/description lengths, priority/boolean values, time
shape, completion timestamps and date/time prerequisites for reminders. Calendar
validation also runs in the repository before writes.

Indexes: tasks_completed_due, tasks_due, tasks_category, tasks_priority,
tasks_completed_history. List queries join categories once and fetch 40 rows per
page, including Completed history. Summary queries return counts, not histories.
Pagination uses a stable order and offsets; any edit/focus refresh restarts at
page one. V1 has no external writers/cloud sync.

## Screens

- Home → Tasks / To-Do (`/tasks`): summary counts, Today, Overdue, Upcoming,
  No due date, Completed and All open views; category/priority filters; quick
  complete/reopen; explicit Load more.
- `/tasks/edit`: Add without an ID, Edit with an ID. Updates preserve the ID and
  completion state. Required title, optional description/category/date/time,
  medium default priority and reminder toggle.
- `/tasks/details`: metadata, Edit, Complete/Reopen and confirmed Delete.

Screens refresh from SQLite on focus. Local date changes refresh on focus,
foreground and midnight using the existing calendar clock hook. All UI uses
semantic appearance tokens and the existing form field component.

## Dates and status

Dates are local `YYYY-MM-DD`, time is optional 24-hour `HH:MM`. They are not stored
as UTC timestamps. Shared date validation is reused. `taskStatus` defines:
completed first; no date; overdue before today; today; upcoming after today.
Due-time passing does not move a task out of Today. Completion timestamps are UTC
instants displayed in local time. Removing a due date clears time and reminder;
removing time clears reminder. No schedule is inferred from a date alone.

## Notifications

Uses installed expo-notifications, the existing native inventory/cancellation
adapter and one application-wide foreground handler/response listener. Tasks
have a separate `task-reminders` Android channel and owner/ID prefix
`lifepilot.tasks.v1:`. Tapping a task notification opens the task dashboard.
No push tokens, backend, vehicle preferences or vehicle notification rows are used.

Only incomplete reminder-enabled tasks with a valid future local date/time are
scheduled. Title is `LifePilot Task`, body is the task title; descriptions are
never included. Stable IDs and title/time fingerprints avoid duplicates.
Permission is requested only by an explicit button, only while undetermined and
askable. Denial does not repeatedly prompt; use OS Settings afterward.

SQLite saves finish independently of notification scheduling. Reconciliation is
serialized and rereads current tasks after each queued edit. Completion,
deletion, disabling and edits cancel obsolete schedules. Reopen schedules again
only if the due time is still in the future. The OS scheduled inventory is the
durable source for cancellation retries, including notifications whose task was
deleted. Failed cancellations block replacement for that identifier. Reconcile
runs at app startup, foreground, mutations and explicit retry. Permission and
scheduling failures surface a warning without rolling back tasks.

Scheduling reserves existing non-task notifications and queues earliest tasks
within the existing platform capacity. Later tasks are deferred until a future
active-app reconciliation. There is no background replenishment service.
Nonexistent local DST times are not silently shifted and are not scheduled;
ambiguous fall-back times use the JavaScript platform's first occurrence. Device
timezone changes are reconciled on foreground. Android battery/notification
settings can delay delivery; V1 adds no exact-alarm native configuration.

## Verification and limitations

Run `node scripts/test-tasks.cjs`, existing migration/reminder/appearance tests,
`npx tsc --noEmit`, changed-file ESLint and `git diff --check`.
Test delivery/cancellation/permission on a device as well as automated mocks.
Local notifications are supported in Expo Go; a current preview APK is preferred
for release behavior. No new native dependency/configuration is introduced, but
an old standalone APK needs a new build to include this JavaScript and migration.

No recurring tasks, subtasks, custom category editor/lists, attachments, cloud,
accounts, collaboration, AI, calendar or location reminders. Future features can
use additive migrations referencing stable task IDs; no speculative tables exist.
