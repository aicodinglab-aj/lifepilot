import type { SQLiteDatabase } from 'expo-sqlite';
import { normalizeTask, type Task, type TaskDraft, type TaskView, type Priority } from '@/features/tasks/task';

const columns = `t.id, t.title, t.description, t.category_id AS categoryId, c.name AS categoryName, t.priority,
  t.due_date AS dueDate, t.due_time AS dueTime, t.reminder_enabled AS reminderEnabled, t.completed,
  t.completed_at AS completedAt, t.created_at AS createdAt, t.updated_at AS updatedAt`;
const from = 'FROM tasks t LEFT JOIN task_categories c ON c.id = t.category_id';
export const TASK_PAGE_SIZE = 40;
export const getTaskCategories = (db: SQLiteDatabase) => db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM task_categories ORDER BY name');
export const getTask = (db: SQLiteDatabase, id: number) => db.getFirstAsync<Task>(`SELECT ${columns} ${from} WHERE t.id = ?`, [id]);
export type TaskFilter = { view: TaskView; today: string; category?: string; priority?: Priority };
export function getTasks(db: SQLiteDatabase, filter: TaskFilter, offset = 0) {
  const conditions: Record<TaskView, string> = {
    Today: 't.completed = 0 AND t.due_date = ?', Overdue: 't.completed = 0 AND t.due_date < ?',
    Upcoming: 't.completed = 0 AND t.due_date > ?', 'No due date': 't.completed = 0 AND t.due_date IS NULL',
    Completed: 't.completed = 1', 'All open': 't.completed = 0',
  };
  const date = ['Today', 'Overdue', 'Upcoming'].includes(filter.view);
  const params: (string | number)[] = date ? [filter.today] : [];
  let where = conditions[filter.view];
  if (!where) throw new Error('Invalid task filter.');
  if (filter.category) { where += ' AND t.category_id = ?'; params.push(filter.category); }
  if (filter.priority) { where += ' AND t.priority = ?'; params.push(filter.priority); }
  const order = filter.view === 'Completed' ? 't.completed_at DESC, t.id DESC' : 't.due_date IS NULL, t.due_date, t.due_time, t.id';
  return db.getAllAsync<Task>(`SELECT ${columns} ${from} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, TASK_PAGE_SIZE, offset]);
}
export function getTaskSummary(db: SQLiteDatabase, today: string) {
  return db.getFirstAsync<{ today: number; upcoming: number; completed: number; overdue: number }>(`SELECT
    COUNT(CASE WHEN completed = 0 AND due_date = ? THEN 1 END) AS today,
    COUNT(CASE WHEN completed = 0 AND due_date > ? THEN 1 END) AS upcoming,
    COUNT(CASE WHEN completed = 1 THEN 1 END) AS completed,
    COUNT(CASE WHEN completed = 0 AND due_date < ? THEN 1 END) AS overdue FROM tasks`, [today, today, today]);
}
export async function saveTask(db: SQLiteDatabase, input: TaskDraft, id?: number) {
  const task = normalizeTask(input), now = new Date().toISOString();
  const values = [task.title, task.description, task.categoryId, task.priority, task.dueDate, task.dueTime, task.reminderEnabled, now];
  if (id != null) {
    const result = await db.runAsync(`UPDATE tasks SET title = ?, description = ?, category_id = ?, priority = ?,
      due_date = ?, due_time = ?, reminder_enabled = ?, updated_at = ? WHERE id = ?`, [...values, id]);
    if (!result.changes) throw new Error('This task no longer exists.');
    return id;
  }
  const result = await db.runAsync(`INSERT INTO tasks (title, description, category_id, priority, due_date, due_time,
    reminder_enabled, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...values, now]);
  return result.lastInsertRowId;
}
export async function completeTask(db: SQLiteDatabase, id: number, completed: boolean) {
  const now = new Date().toISOString();
  const result = await db.runAsync('UPDATE tasks SET completed = ?, completed_at = ?, updated_at = ? WHERE id = ?', [completed ? 1 : 0, completed ? now : null, now, id]);
  if (!result.changes) throw new Error('This task no longer exists.');
}
export const deleteTask = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM tasks WHERE id = ?', [id]);
export function getTaskReminderCandidates(db: SQLiteDatabase, today: string, offset = 0) {
  return db.getAllAsync<Task>(`SELECT ${columns} ${from} WHERE t.completed = 0 AND t.reminder_enabled = 1
    AND t.due_date >= ? AND t.due_time IS NOT NULL ORDER BY t.due_date, t.due_time, t.id LIMIT 100 OFFSET ?`, [today, offset]);
}
