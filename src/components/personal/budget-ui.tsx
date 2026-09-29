import { Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Button, IconButton, StandardCard, StatusBadge } from '@/components/ui';
import { iconSizes, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import type { BudgetProgress } from '@/features/personal/budget';
import { budgetProgressPresentation } from '@/features/personal/budget-presentation';
import { localToday, monthLabel, shiftMonth } from '@/features/personal/date';
import { formatMoney } from '@/features/personal/money';

export function BudgetMonthSelector({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const { colors } = useAppearance();
  const previous = shiftMonth(month, -1), next = shiftMonth(month, 1);
  return <View style={{ gap: spacing.sm }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <IconButton accessibilityLabel="Previous month" disabled={!previous} onPress={() => { if (previous) onChange(previous); }}
        icon={<SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={iconSizes.navigation} tintColor={colors.primary} />} />
      <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.xs }}>
        <Text style={[typography.label, { color: colors.muted }]}>SELECTED MONTH</Text>
        <Text accessibilityRole="header" style={[typography.sectionHeading, { color: colors.text, textAlign: 'center' }]}>{monthLabel(month)}</Text>
      </View>
      <IconButton accessibilityLabel="Next month" disabled={!next} onPress={() => { if (next) onChange(next); }}
        icon={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={iconSizes.navigation} tintColor={colors.primary} />} />
    </View>
    <Button label="Current month" variant="tertiary" onPress={() => onChange(localToday().slice(0, 7))} />
  </View>;
}

export function BudgetProgressCard({ title, progress, onEdit }: { title: string; progress: BudgetProgress; onEdit: () => void }) {
  const { colors } = useAppearance();
  const display = budgetProgressPresentation(progress);
  if (!progress.configured || !display) return null;
  const remainingText = progress.status === 'OVER_BUDGET' ? `${formatMoney(progress.overByPaise)} over budget` : `${formatMoney(progress.remainingPaise)} remaining`;
  return <StandardCard style={{ gap: spacing.md }}>
    <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.text }]}>{title}</Text>
    <Text style={[typography.sectionHeading, { color: colors.text }]}>{formatMoney(progress.spentPaise)} / {formatMoney(progress.limitPaise)}</Text>
    <Text style={[typography.caption, { color: colors.muted }]}>Spent / budget limit</Text>
    <StatusBadge label={display.label} tone={display.tone} />
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`${title} spending`}
      accessibilityValue={{ min: 0, max: 100, now: display.fill, text: `${display.percentText} used. ${display.label}. ${remainingText}.` }}
      style={{ height: 10, borderRadius: radii.pill, backgroundColor: colors.surfaceSecondary, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${display.fill}%`, backgroundColor: colors[display.tone] }} />
    </View>
    <Text style={[typography.body, { color: colors.text }]}>{display.percentText} used</Text>
    <Text style={[typography.body, { color: colors.text }]}>{remainingText}</Text>
    <Button label={`Edit ${title}`} variant="secondary" onPress={onEdit} />
  </StandardCard>;
}
