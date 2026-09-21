import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { TaskCard, TaskMetadata, TaskPage } from '@/components/tasks/task-ui';
import { Button } from '@/components/ui/button';
import { spacing, typography } from '@/constants/design-system';
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
  return <TaskPage title="Task Details"><ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xl, gap: spacing.lg }}>
    {loading ? <ActivityIndicator color={colors.primary} /> : <>
      {error && <><Text accessibilityRole="alert" style={[typography.secondaryBody, { color: colors.danger }]}>{error}</Text><Button label="Try again" variant="secondary" onPress={() => setRetry((n) => n + 1)} /></>}
      {!task ? !error && <Text style={[typography.body, { color: colors.muted }]}>This task no longer exists.</Text> : <>
        <TaskCard><Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.text }]}>{task.title}</Text><TaskMetadata task={task} today={today} />
          <Text style={[typography.body, { color: task.description ? colors.text : colors.muted }]}>{task.description || 'No description'}</Text>
          {!task.reminderEnabled && <Text style={[typography.secondaryBody, { color: colors.muted }]}>Reminder off</Text>}
          <Text style={[typography.caption, { color: colors.muted }]}>Created {new Date(task.createdAt).toLocaleString()}</Text>
          {task.completedAt && <Text style={[typography.caption, { color: colors.muted }]}>Completed {new Date(task.completedAt).toLocaleString()}</Text>}
        </TaskCard>
        {notifications.warning && <Text style={[typography.caption, { color: colors.muted }]}>{notifications.warning}</Text>}
        <View style={{ gap: spacing.sm }}>
          <Button label={task.completed ? 'Reopen' : 'Mark Complete'} disabled={busy} onPress={() => { void perform(false); }} />
          <Button label="Edit" variant="secondary" disabled={busy} onPress={() => router.push({ pathname: '/tasks/edit', params: { id: String(task.id) } })} />
          <Button label="Delete" variant="tertiary" disabled={busy} onPress={() => Alert.alert('Delete task?', 'This permanently deletes this task.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void perform(true); } },
          ])} />
        </View>
      </>}
    </>}
  </ScrollView></TaskPage>;
}
