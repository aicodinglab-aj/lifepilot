import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, Alert, ScrollView } from 'react-native';
import { TaskAction, TaskCard, TaskMetadata, TaskPage, TaskText } from '@/components/tasks/task-ui';
import { completeTask, deleteTask, getTask } from '@/database/tasks';
import { taskId, type Task } from '@/features/tasks/task';
import { useTaskNotifications } from '@/features/tasks/task-provider';
import { useCoverageToday } from '@/features/vehicles/use-coverage';
import { useAppearance } from '@/features/appearance/appearance-provider';

export default function TaskDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext(), today = useCoverageToday(), notifications = useTaskNotifications(), { colors } = useAppearance();
  const [task, setTask] = useState<Task | null>(null), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const working = useRef(false), generation = useRef(0);
  useFocusEffect(useCallback(() => {
    const token = ++generation.current; setLoading(true); setError(null);
    void (async () => {
      try { const found = await getTask(db, taskId(id)); if (token === generation.current) setTask(found); }
      catch { if (token === generation.current) { setTask(null); setError('Could not load task.'); } }
      finally { if (token === generation.current) setLoading(false); }
    })();
    return () => { generation.current++; };
    // Retry also refreshes after a completion change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id, retry]));
  async function perform(remove: boolean) {
    if (working.current || !task) return;
    working.current = true; setBusy(true); const token = generation.current;
    try {
      if (remove) await deleteTask(db, task.id); else await completeTask(db, task.id, !task.completed);
      void notifications.refresh();
      if (token === generation.current) { if (remove) router.dismissTo('/tasks'); else setRetry((n) => n + 1); }
    } catch { if (token === generation.current) setError('Could not update task. Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <TaskPage title="Task Details"><ScrollView contentContainerStyle={{ padding: 24, gap: 18 }}>
    {loading ? <ActivityIndicator color={colors.primary} /> : <>
      {error && <><TaskText danger>{error}</TaskText><TaskAction label="Try again" onPress={() => setRetry((n) => n + 1)} /></>}
      {!task ? !error && <TaskText>This task no longer exists.</TaskText> : <>
        <TaskCard><TaskText heading>{task.title}</TaskText><TaskMetadata task={task} today={today} />
          <TaskText>{task.description || 'No description'}</TaskText>
          {!task.reminderEnabled && <TaskText>Reminder off</TaskText>}
          <TaskText>Created {new Date(task.createdAt).toLocaleString()}</TaskText>
          {task.completedAt && <TaskText>Completed {new Date(task.completedAt).toLocaleString()}</TaskText>}
        </TaskCard>
        {notifications.warning && <TaskText>{notifications.warning}</TaskText>}
        <TaskAction label="Edit" disabled={busy} onPress={() => router.push({ pathname: '/tasks/edit', params: { id: String(task.id) } })} />
        <TaskAction label={task.completed ? 'Reopen' : 'Mark Complete'} disabled={busy} onPress={() => { void perform(false); }} />
        <TaskAction label="Delete" disabled={busy} onPress={() => Alert.alert('Delete task?', 'This permanently deletes this task.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void perform(true); } },
        ])} />
      </>}
    </>}
  </ScrollView></TaskPage>;
}
