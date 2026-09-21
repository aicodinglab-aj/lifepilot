import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { taskDue, taskFireAt, taskStatus, type Task } from '@/features/tasks/task';

export function TaskPage({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useAppearance();
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title={title} fallbackHref={title === 'Tasks / To-Do' ? '/' : '/tasks'} />
    {children}
  </SafeAreaView>;
}
export function TaskAction({ label, onPress, disabled = false, selected = false }: {
  label: string; onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  const { colors } = useAppearance();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 44, padding: 12, borderRadius: 12, borderWidth: 1,
      borderColor: selected ? colors.primary : colors.controlBorder, backgroundColor: colors.card, opacity: disabled || pressed ? 0.5 : 1 })}>
    <Text style={{ color: colors.primary, fontWeight: '600' }}>{label}</Text>
  </Pressable>;
}
export function TaskText({ children, heading = false, danger = false }: { children: ReactNode; heading?: boolean; danger?: boolean }) {
  const { colors } = useAppearance();
  return <Text accessibilityRole={heading ? 'header' : undefined} style={{ color: danger ? colors.danger : heading ? colors.text : colors.muted,
    fontSize: heading ? 20 : 15, lineHeight: heading ? 28 : 22, fontWeight: heading ? '700' : '400' }}>{children}</Text>;
}
export function TaskCard({ children }: { children: ReactNode }) {
  const { colors } = useAppearance();
  return <View style={{ padding: 18, gap: 10, borderRadius: 18, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.card }}>{children}</View>;
}
export function TaskMetadata({ task, today }: { task: Task; today: string }) {
  const { colors } = useAppearance();
  const status = taskStatus(task, today);
  const fireAt = taskFireAt(task);
  return <View style={{ gap: 6 }}>
    <Text style={{ color: status === 'Overdue' ? colors.danger : task.completed ? colors.success : colors.muted }}>{status} · {taskDue(task)}</Text>
    <Text style={{ color: task.priority === 'high' ? colors.warning : colors.muted }}>
      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} priority{task.categoryName ? ` · ${task.categoryName}` : ''}
    </Text>
    {!!task.reminderEnabled && <TaskText>Reminder enabled{task.completed ? ' · inactive while completed' : ''}</TaskText>}
    {!!task.reminderEnabled && !task.completed && <TaskText>{fireAt == null ? 'Reminder not scheduled: this local time is unavailable.'
      : status === 'Overdue' ? 'Reminder time has passed.' : 'Delivery depends on notification permission and device settings. Past times are not scheduled.'}</TaskText>}
  </View>;
}
