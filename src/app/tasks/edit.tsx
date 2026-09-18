import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, ScrollView, Switch, View } from 'react-native';
import { TaskAction, TaskPage, TaskText } from '@/components/tasks/task-ui';
import { FormTextField } from '@/components/forms/form-text-field';
import { getTask, getTaskCategories, saveTask } from '@/database/tasks';
import { normalizeTask, priorities, taskId, type TaskDraft } from '@/features/tasks/task';
import { useTaskNotifications } from '@/features/tasks/task-provider';
import { useAppearance } from '@/features/appearance/appearance-provider';

const empty: TaskDraft = { title: '', description: null, categoryId: null, priority: 'medium', dueDate: null, dueTime: null, reminderEnabled: 0 };
export default function TaskEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext(), notifications = useTaskNotifications(), { colors } = useAppearance();
  const [form, setForm] = useState<TaskDraft>(empty), [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false), [retry, setRetry] = useState(0);
  const working = useRef(false), mounted = useRef(true);
  useFocusEffect(useCallback(() => {
    let active = true; mounted.current = true; setLoading(true); setLoadError(false); setError(null);
    void (async () => {
      try {
        const [groups, task] = await Promise.all([getTaskCategories(db), id ? getTask(db, taskId(id)) : Promise.resolve(null)]);
        if (id && !task) throw new Error('This task no longer exists.');
        if (active) { setCategories(groups); setForm(task ?? empty); }
      } catch (cause) { if (active) { setLoadError(true); setError(cause instanceof Error ? cause.message : 'Could not load task.'); } }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; mounted.current = false; };
    // Retry reloads a failed task read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id, retry]));
  async function save() {
    if (working.current || loading || loadError) return;
    working.current = true; setBusy(true); setError(null);
    try {
      const result = await saveTask(db, normalizeTask(form), id ? taskId(id) : undefined);
      void notifications.refresh();
      if (mounted.current) {
        const target = { pathname: '/tasks/details' as const, params: { id: String(result) } };
        if (id) router.dismissTo(target); else router.replace(target);
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not save task.'); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  const update = (patch: Partial<TaskDraft>) => setForm((current) => ({ ...current, ...patch }));
  return <TaskPage title={id ? 'Edit Task' : 'Add Task'}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 18 }}>
      {loading ? <ActivityIndicator color={colors.primary} /> : <>
        {error && <TaskText danger>{error}</TaskText>}
        {loadError ? <TaskAction label="Try again" onPress={() => setRetry((n) => n + 1)} /> : <>
          <FormTextField label="Title" value={form.title} maxLength={200} editable={!busy} onChangeText={(title) => update({ title })} />
          <FormTextField label="Description" optional multiline maxLength={4000} value={form.description ?? ''} editable={!busy} onChangeText={(description) => update({ description })} />
          <TaskText>Category</TaskText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <TaskAction label="No category" selected={!form.categoryId} disabled={busy} onPress={() => update({ categoryId: null })} />
            {categories.map((group) => <TaskAction key={group.id} label={group.name} selected={form.categoryId === group.id} disabled={busy} onPress={() => update({ categoryId: group.id })} />)}
          </View>
          <TaskText>Priority</TaskText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{priorities.map((priority) =>
            <TaskAction key={priority} label={priority} selected={form.priority === priority} disabled={busy} onPress={() => update({ priority })} />)}</View>
          <FormTextField label="Due date" optional placeholder="YYYY-MM-DD" value={form.dueDate ?? ''} editable={!busy}
            onChangeText={(dueDate) => update(dueDate.trim() ? { dueDate } : { dueDate: null, dueTime: null, reminderEnabled: 0 })} />
          <FormTextField label="Due time" optional placeholder="HH:MM (24-hour)" value={form.dueTime ?? ''} editable={!busy && !!form.dueDate}
            onChangeText={(dueTime) => update({ dueTime, ...(!dueTime.trim() ? { reminderEnabled: 0 } : {}) })} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TaskText>Local reminder</TaskText>
            <Switch accessibilityLabel="Local reminder" value={!!form.reminderEnabled} disabled={busy || !form.dueDate || !form.dueTime}
              trackColor={{ false: colors.controlBorder, true: colors.primary }} onValueChange={(enabled) => update({ reminderEnabled: enabled ? 1 : 0 })} />
          </View>
          <TaskText>Choose both a date and time for a reminder. No notification time is assumed. Past reminders will not be scheduled.</TaskText>
          {notifications.warning && <TaskText>{notifications.warning}</TaskText>}
          <TaskAction label="Enable notification permission" disabled={busy} onPress={() => { void notifications.request(); }} />
          <TaskAction label={busy ? 'Saving…' : 'Save Task'} disabled={busy} onPress={() => { void save(); }} />
        </>}
      </>}
    </ScrollView>
  </TaskPage>;
}
