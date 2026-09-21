import { useMemo, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { StandardCard } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Section } from '@/components/ui/section';
import { iconSizes, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { comparison, insights, percentage, type CategoryTotal, type PersonalAnalytics } from '@/features/personal/analytics';
import { monthLabel } from '@/features/personal/date';
import { formatMoney } from '@/features/personal/money';

function ExpandableSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useAppearance();
  const [expanded, setExpanded] = useState(false);
  return <StandardCard>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }}
      onPress={() => setExpanded((value) => !value)} style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row',
        alignItems: 'center', gap: spacing.md, opacity: pressed ? 0.68 : 1 })}>
      <Text style={[typography.sectionHeading, { color: colors.text, flex: 1 }]}>{title}</Text>
      <SymbolView name={{ ios: expanded ? 'chevron.up' : 'chevron.down', android: expanded ? 'expand_less' : 'expand_more',
        web: expanded ? 'expand_less' : 'expand_more' }} size={iconSizes.action} tintColor={colors.primary} />
    </Pressable>
    {expanded && <View style={{ gap: spacing.md }}>{children}</View>}
  </StandardCard>;
}

function CategoryRow({ row, month, rank }: { row: CategoryTotal; month: string; rank?: number }) {
  const { colors } = useAppearance();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${row.name}, ${formatMoney(row.amount)}, ${row.percentage} percent. View transactions`}
    onPress={() => router.push({ pathname: '/personal/history', params: { month, categoryId: row.id, type: row.type } })}
    style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.divider, opacity: pressed ? 0.68 : 1 })}>
    <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
      <Text style={[typography.cardTitle, { color: colors.text }]}>{rank ? `${rank}. ` : ''}{row.name}</Text>
      <Text style={[typography.secondaryBody, { color: colors.muted }]}>{row.percentage}% of {row.type}</Text>
    </View>
    <Text style={[typography.cardTitle, { color: row.type === 'income' ? colors.income : colors.expense }]}>{formatMoney(row.amount)}</Text>
    <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
      size={iconSizes.action} tintColor={colors.primary} />
  </Pressable>;
}

export function AnalyticsSections({ data }: { data: PersonalAnalytics }) {
  const { colors } = useAppearance();
  const [mode, setMode] = useState('Expenses');
  const includeIncome = mode === 'Income and expenses';
  const maximum = useMemo(() => data.trend.reduce((max, row) => {
    const expense = BigInt(row.expenses), income = includeIncome ? BigInt(row.income) : BigInt(0);
    return expense > max ? (income > expense ? income : expense) : income > max ? income : max;
  }, BigInt(0)).toString(), [data.trend, includeIncome]);
  const facts = useMemo(() => insights(data), [data]);
  const previous = data.previous;
  const noComparisonData = data.selected.incomeCount === '0' && data.selected.expenseCount === '0'
    && (!previous || (previous.incomeCount === '0' && previous.expenseCount === '0'));

  return <View style={{ gap: spacing.lg }}>
    <ExpandableSection title="Monthly Comparison">
      {noComparisonData ? <EmptyState title="No monthly activity to compare" description="A comparison will appear after transactions are recorded." />
        : previous ? <>
          <Text style={[typography.secondaryBody, { color: colors.muted }]}>{monthLabel(data.selected.month)} compared with {monthLabel(previous.month)}</Text>
          {(['expenses', 'income'] as const).map((kind) => <View key={kind} style={{ gap: spacing.xs }}>
            <Text style={[typography.cardTitle, { color: colors.text }]}>{kind === 'expenses' ? 'Expenses' : 'Income'}</Text>
            <Text style={[typography.secondaryBody, { color: colors.muted }]}>Selected: {formatMoney(data.selected[kind])}</Text>
            <Text style={[typography.secondaryBody, { color: colors.muted }]}>Previous: {formatMoney(previous[kind])}</Text>
            <Text style={[typography.label, { color: colors.primary }]}>{comparison(data.selected[kind], previous[kind])}</Text>
          </View>)}
        </> : <EmptyState title="No earlier month available" description="Monthly comparison needs an earlier recorded calendar month." />}
    </ExpandableSection>

    <StandardCard>
      <Section title="Top Spending" subtitle="Largest expense categories for the selected month.">
        {data.expenses.length ? <View>{data.expenses.slice(0, 3).map((row, index) =>
          <CategoryRow key={row.id} row={row} month={data.selected.month} rank={index + 1} />)}</View>
          : <EmptyState title="No spending this month" description="Expense categories will appear after an expense is added." />}
      </Section>
    </StandardCard>

    <ExpandableSection title="Expense category breakdown">
      {data.expenses.length ? <>
        <View>{data.expenses.map((row) => <CategoryRow key={row.id} row={row} month={data.selected.month} />)}</View>
        <Text style={[typography.caption, { color: colors.muted }]}>Percentages are rounded to one decimal place and may not total exactly 100%.</Text>
      </> : <EmptyState title="No expense breakdown" description="There are no expenses in the selected month." />}
    </ExpandableSection>

    <ExpandableSection title="Income category breakdown">
      {data.income.length ? <View>{data.income.map((row) => <CategoryRow key={row.id} row={row} month={data.selected.month} />)}</View>
        : <EmptyState title="No income breakdown" description="There is no income in the selected month." />}
    </ExpandableSection>

    <StandardCard>
      <Section title="Spending Trend" subtitle={`Monthly totals through ${monthLabel(data.selected.month)}.`}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {['Expenses', 'Income and expenses'].map((value) => <Chip key={value} label={value} selected={mode === value} onPress={() => setMode(value)} />)}
        </View>
        {maximum === '0' ? <EmptyState title="No trend to display" description="A trend will appear after transactions are recorded in this period." />
          : <View>{data.trend.map((row) => <View key={row.month} style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
            <Text style={[typography.label, { color: colors.text }]}>{monthLabel(row.month)}</Text>
            {(includeIncome ? ['expenses', 'income'] as const : ['expenses'] as const).map((kind) => <View key={kind} style={{ gap: spacing.xs }}>
              <Text style={[typography.secondaryBody, { color: colors.muted }]}>{kind === 'expenses' ? 'Expenses' : 'Income'}: {formatMoney(row[kind])}</Text>
              <View accessible={false} style={{ height: 10, borderRadius: 5, backgroundColor: colors.divider, overflow: 'hidden' }}>
                <View style={{ height: 10, width: `${Number(percentage(row[kind], maximum))}%`,
                  backgroundColor: kind === 'income' ? colors.income : colors.expense }} />
              </View>
            </View>)}
          </View>)}</View>}
      </Section>
    </StandardCard>

    <ExpandableSection title="Insights">
      {facts.length ? facts.map((fact) => <Text key={fact} style={[typography.body, { color: colors.text }]}>{fact}</Text>)
        : <EmptyState title="Not enough activity for insights" description="Insights will appear as more transactions are recorded." />}
    </ExpandableSection>
  </View>;
}
