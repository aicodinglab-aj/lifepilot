import { displayDate, localToday, validDate } from '@/features/personal/date';

export { localToday };
export const priorities = ['low', 'medium', 'high'] as const;
export type Priority = typeof priorities[number];
export const taskViews = ['Today', 'Overdue', 'Upcoming', 'No due date', 'Completed', 'All open'] as const;
export type TaskView = typeof taskViews[number];
export type TaskDraft = {
  title: string; description: string | null; categoryId: string | null; priority: Priority;
  dueDate: string | null; dueTime: string | null; reminderEnabled: number;
};
export type Task = TaskDraft & {
  id: number; categoryName: string | null; completed: number; completedAt: string | null; createdAt: string; updatedAt: string;
};
export function taskId(value: unknown) {
  const id = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id)) throw new Error('Invalid task link.');
  return id;
}
export function normalizeTask(draft: TaskDraft): TaskDraft {
  const title = draft.title.trim(), description = draft.description?.trim() || null;
  if (!title || title.length > 200) throw new Error('Enter a title of 1–200 characters.');
  if (description && description.length > 4000) throw new Error('Description must be at most 4,000 characters.');
  if (!priorities.includes(draft.priority)) throw new Error('Choose a valid priority.');
  const dueDate = draft.dueDate?.trim() || null;
  if (dueDate && !validDate(dueDate)) throw new Error('Enter a real due date as YYYY-MM-DD.');
  const dueTime = dueDate ? draft.dueTime?.trim() || null : null;
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) throw new Error('Enter a time as HH:MM (24-hour).');
  return { ...draft, title, description, dueDate, dueTime, reminderEnabled: dueDate && dueTime && draft.reminderEnabled ? 1 : 0 };
}
export function taskStatus(task: Pick<Task, 'completed' | 'dueDate'>, today = localToday()): TaskView {
  if (task.completed) return 'Completed';
  if (!task.dueDate) return 'No due date';
  return task.dueDate < today ? 'Overdue' : task.dueDate === today ? 'Today' : 'Upcoming';
}
export function taskDue(task: Pick<Task, 'dueDate' | 'dueTime'>) {
  return task.dueDate ? `${displayDate(task.dueDate)}${task.dueTime ? ` · ${task.dueTime}` : ''}` : 'No due date';
}
export function taskFireAt(task: Pick<Task, 'dueDate' | 'dueTime' | 'reminderEnabled' | 'completed'>): number | null {
  if (!task.reminderEnabled || task.completed || !task.dueDate || !validDate(task.dueDate) || !task.dueTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime)) return null;
  const [year, month, day] = task.dueDate.split('-').map(Number), [hour, minute] = task.dueTime.split(':').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day); date.setHours(hour, minute, 0, 0);
  // A nonexistent DST clock time must not silently move the reminder to another time.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute ? date.getTime() : null;
}
