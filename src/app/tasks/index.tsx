import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { TaskAction, TaskCard, TaskMetadata, TaskPage, TaskText } from '@/components/tasks/task-ui';
import { completeTask, getTaskCategories, getTasks, getTaskSummary, TASK_PAGE_SIZE } from '@/database/tasks';
import { priorities, taskViews, type Task, type TaskView, type Priority } from '@/features/tasks/task';
import { useCoverageToday } from '@/features/vehicles/use-coverage';
import { useTaskNotifications } from '@/features/tasks/task-provider';
import { useAppearance } from '@/features/appearance/appearance-provider';

export default function TasksScreen() {
  const db = useSQLiteContext(), today = useCoverageToday(), { colors } = useAppearance();
  const notifications = useTaskNotifications();
  const [view, setView] = useState<TaskView>('Today');
  const [category, setCategory] = useState<string>();
  const [priority, setPriority] = useState<Priority>();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Task[]>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getTaskSummary>>>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false), [busy, setBusy] = useState(false), [paging, setPaging] = useState(false);
  const generation = useRef(0), working = useRef(false), fetching = useRef(false);
  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setError(null); fetching.current = false; setPaging(false);
    try {
      const [tasks, totals, groups] = await Promise.all([getTasks(db, { view, today, category, priority }), getTaskSummary(db, today), getTaskCategories(db)]);
      if (token === generation.current) { setRows(tasks); setSummary(totals); setCategories(groups); setMore(tasks.length === TASK_PAGE_SIZE); }
    } catch { if (token === generation.current) { setRows([]); setMore(false); setSummary(null); setError('Could not load tasks. Please try again.'); } }
    finally { if (token === generation.current) setLoading(false); }
  }, [db, view, today, category, priority]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  async function loadMore() {
    if (!more || fetching.current || loading || working.current) return;
    fetching.current = true; setPaging(true);
    const token = generation.current;
    try {
      const tasks = await getTasks(db, { view, today, category, priority }, rows.length);
      if (token === generation.current) { setRows((current) => [...current, ...tasks]); setMore(tasks.length === TASK_PAGE_SIZE); }
    } catch { if (token === generation.current) setError('Could not load more tasks. Please try again.'); }
    finally { if (token === generation.current) { fetching.current = false; setPaging(false); } }
  }
  async function toggle(task: Task) {
    if (working.current) return;
    working.current = true; setBusy(true); const token = generation.current;
    try { await completeTask(db, task.id, !task.completed); void notifications.refresh(); if (token === generation.current) await load(); }
    catch { if (token === generation.current) setError('Could not update task. Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <TaskPage title="Tasks / To-Do">
    <FlatList data={loading ? [] : rows} keyExtractor={(task) => String(task.id)} contentContainerStyle={{ padding: 24, gap: 14 }}
      ListHeaderComponent={<View style={{ gap: 16 }}>
        <TaskText heading>Tasks / To-Do</TaskText>
        <TaskAction label="Add Task" onPress={() => router.push('/tasks/edit')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['Today', 'Upcoming', 'Completed', 'Overdue'] as const).map((name) => <TaskAction key={name}
            label={`${name}: ${summary?.[name.toLowerCase() as keyof NonNullable<typeof summary>] ?? '…'}`} selected={view === name} onPress={() => setView(name)} />)}
        </View>
        <TaskText heading>View</TaskText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{taskViews.filter((name) => name === 'No due date' || name === 'All open').map((name) =>
          <TaskAction key={name} label={name} selected={view === name} onPress={() => setView(name)} />)}</View>
        <TaskText>Category</TaskText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TaskAction label="All categories" selected={!category} onPress={() => setCategory(undefined)} />
          {categories.map((group) => <TaskAction key={group.id} label={group.name} selected={category === group.id} onPress={() => setCategory(group.id)} />)}
        </View>
        <TaskText>Priority</TaskText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TaskAction label="All priorities" selected={!priority} onPress={() => setPriority(undefined)} />
          {priorities.map((item) => <TaskAction key={item} label={item} selected={priority === item} onPress={() => setPriority(item)} />)}
        </View>
        {notifications.warning && <TaskText>{notifications.warning}</TaskText>}
        <TaskAction label="Enable / retry task notifications" onPress={() => { void notifications.request(); }} />
        <TaskText>After denial, allow notifications in device Settings. Reminders need a due date and time.</TaskText>
        {error && <><TaskText danger>{error}</TaskText><TaskAction label="Try again" onPress={() => { void load(); }} /></>}
        {loading && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading tasks" />}
      </View>}
      ListEmptyComponent={!loading && !error ? <TaskCard><TaskText heading>No tasks in this view</TaskText>
        <TaskText>Add a task or choose another view. Tasks without dates are in No due date.</TaskText></TaskCard> : null}
      ListFooterComponent={!loading && more ? <TaskAction label={paging ? 'Loading…' : 'Load more'} disabled={paging || busy}
        onPress={() => { void loadMore(); }} /> : null}
      renderItem={({ item }) => <TaskCard>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open task ${item.title}`}
          onPress={() => router.push({ pathname: '/tasks/details', params: { id: String(item.id) } })} style={{ gap: 10, minHeight: 44 }}>
          <TaskText heading>{item.title}</TaskText><TaskMetadata task={item} today={today} />
        </Pressable>
        <TaskAction label={`${item.completed ? 'Reopen' : 'Mark complete'}: ${item.title}`} disabled={busy}
          onPress={() => { void toggle(item); }} />
      </TaskCard>} />
  </TaskPage>;
}
