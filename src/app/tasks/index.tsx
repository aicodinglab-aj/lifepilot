import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { StandardCard } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Section } from '@/components/ui/section';
import { TaskMetadata, TaskPage } from '@/components/tasks/task-ui';
import { iconSizes, spacing, typography } from '@/constants/design-system';
import { completeTask, getTaskCategories, getTasks, getTaskSummary, TASK_PAGE_SIZE } from '@/database/tasks';
import { priorities, type Task, type TaskView, type Priority } from '@/features/tasks/task';
import { useCoverageToday } from '@/features/vehicles/use-coverage';
import { useTaskNotifications } from '@/features/tasks/task-provider';
import { useAppearance } from '@/features/appearance/appearance-provider';

const primaryViews: { label: string; value: TaskView }[] = [
  { label: 'Today', value: 'Today' }, { label: 'Upcoming', value: 'Upcoming' }, { label: 'All', value: 'All open' },
];
const secondaryViews: TaskView[] = ['Overdue', 'No due date', 'Completed'];

export default function TasksScreen() {
  const db = useSQLiteContext(), today = useCoverageToday(), { colors } = useAppearance();
  const notifications = useTaskNotifications();
  const [view, setView] = useState<TaskView>('Today');
  const [category, setCategory] = useState<string>();
  const [priority, setPriority] = useState<Priority>();
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const categoryName = categories.find((item) => item.id === category)?.name;
  const activeFilters = [!primaryViews.some((item) => item.value === view) ? view : null, categoryName, priority ? `${priority} priority` : null]
    .filter((value): value is string => !!value);
  const resetFilters = () => { setView('Today'); setCategory(undefined); setPriority(undefined); };
  const addTask = () => router.push('/tasks/edit');
  const addTaskIcon = <Text accessible={false} style={{ color: colors.onPrimary, fontSize: 20 }}>+</Text>;

  return <TaskPage title="Tasks / To-Do">
    <FlatList data={loading ? [] : rows} keyExtractor={(task) => String(task.id)}
      contentContainerStyle={{ flexGrow: 1, padding: spacing.base, paddingBottom: spacing.xl, gap: spacing.md }}
      ListHeaderComponent={<View style={{ gap: spacing.base }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.text }]}>Your tasks</Text>
            <Text style={[typography.secondaryBody, { color: colors.muted }]}>Focus on what needs attention now.</Text>
          </View>
          <Button label="Add Task" onPress={addTask} icon={addTaskIcon} />
        </View>

        <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {primaryViews.map((item) => <Chip key={item.value}
            label={`${item.label}${item.value !== 'All open' ? ` ${summary?.[item.value.toLowerCase() as 'today' | 'upcoming'] ?? '…'}` : ''}`}
            selected={view === item.value} onPress={() => setView(item.value)} />)}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
          <Button label={filtersOpen ? 'Hide filters' : 'Filters'} variant="secondary" onPress={() => setFiltersOpen((open) => !open)}
            icon={<SymbolView name={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
              size={iconSizes.action} tintColor={colors.primary} />} />
          {activeFilters.map((filter) => <View key={filter} style={{ maxWidth: '100%' }}><Chip label={filter} selected onPress={() => setFiltersOpen(true)} /></View>)}
          {!!activeFilters.length && <Button label="Reset" variant="tertiary" onPress={resetFilters} />}
        </View>

        {filtersOpen && <StandardCard>
          <Section title="Filter tasks" subtitle="Choose a view, category or priority.">
            <View style={{ gap: spacing.md }}>
              <Text style={[typography.label, { color: colors.text }]}>More views</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {secondaryViews.map((item) => <Chip key={item} label={item} selected={view === item} onPress={() => setView(item)} />)}
              </View>
              <Text style={[typography.label, { color: colors.text }]}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Chip label="All categories" selected={!category} onPress={() => setCategory(undefined)} />
                {categories.map((item) => <Chip key={item.id} label={item.name} selected={category === item.id} onPress={() => setCategory(item.id)} />)}
              </View>
              <Text style={[typography.label, { color: colors.text }]}>Priority</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Chip label="All priorities" selected={!priority} onPress={() => setPriority(undefined)} />
                {priorities.map((item) => <Chip key={item} label={item} selected={priority === item} onPress={() => setPriority(item)} />)}
              </View>
              <Button label="Reset filters" variant="tertiary" onPress={resetFilters} />
            </View>
          </Section>
        </StandardCard>}

        <View style={{ minHeight: 24, justifyContent: 'center' }}>
          {error && <Text accessibilityRole="alert" style={[typography.secondaryBody, { color: colors.danger }]}>{error}</Text>}
          {loading && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading tasks" />}
        </View>
      </View>}
      ListEmptyComponent={!loading && !error ? <EmptyState
        title="No tasks in this view" description="Try another view or add a task when you are ready."
        action={{ label: 'Add Task', icon: addTaskIcon, onPress: addTask }} /> : null}
      ListFooterComponent={<View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
        {error && <Button label="Try again" variant="secondary" onPress={() => { void load(); }} />}
        {!loading && more && <Button label={paging ? 'Loading…' : 'Load more'} variant="secondary" loading={paging}
          disabled={busy} onPress={() => { void loadMore(); }} />}
        {notifications.warning && <Text style={[typography.caption, { color: colors.muted }]}>{notifications.warning}</Text>}
        <Button label="Notification options" variant="tertiary" onPress={() => { void notifications.request(); }} />
      </View>}
      renderItem={({ item }) => <StandardCard>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open task ${item.title}`}
          onPress={() => router.push({ pathname: '/tasks/details', params: { id: String(item.id) } })}
          style={({ pressed }) => ({ gap: spacing.sm, minHeight: 44, opacity: pressed ? 0.68 : 1 })}>
          <Text style={[typography.cardTitle, { color: item.completed ? colors.muted : colors.text,
            textDecorationLine: item.completed ? 'line-through' : 'none' }]}>{item.title}</Text>
          <TaskMetadata task={item} today={today} />
        </Pressable>
        <Button label={item.completed ? 'Reopen' : 'Complete'} variant="tertiary" disabled={busy}
          onPress={() => { void toggle(item); }} />
      </StandardCard>} />
  </TaskPage>;
}
