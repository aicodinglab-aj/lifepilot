import { useThemedStyles, useAppearance } from '@/features/appearance/appearance-provider';
import { useMemo, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { comparison, insights, percentage, type CategoryTotal, type PersonalAnalytics } from '@/features/personal/analytics';
import { formatMoney } from '@/features/personal/money';
import { monthLabel } from '@/features/personal/date';
import { OptionSelector } from '@/components/forms/option-selector';
import { styles } from './ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const themed_styles = useThemedStyles(styles);
  const [expanded, setExpanded] = useState(false);
  return <View style={themed_styles.card}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={themed_styles.heading}>{title} {expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && children}
  </View>;
}
function CategoryRow({ row, month, rank }: { row: CategoryTotal; month: string; rank?: number }) {
  const themed_styles = useThemedStyles(styles);
  const appearance = useAppearance();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${row.name}, ${formatMoney(row.amount)}, ${row.percentage} percent. View transactions`}
    onPress={() => router.push({ pathname: '/personal/history', params: { month, categoryId: row.id, type: row.type } })}
    style={{ gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderColor: appearance.colors.border }}>
    <Text style={themed_styles.heading}>{rank ? `${rank}. ` : ''}{row.name}</Text>
    <Text style={themed_styles.body}>{formatMoney(row.amount)} · {row.percentage}%</Text>
    <Text style={themed_styles.accent}>View transactions →</Text>
  </Pressable>;
}
export function AnalyticsSections({ data }: { data: PersonalAnalytics }) {
  const themed_styles = useThemedStyles(styles);
  const appearance = useAppearance();
  const [mode, setMode] = useState('Expenses');
  const includeIncome = mode === 'Income and expenses';
  // Appearance context updates should not repeat analytics derivation.
  const maximum = useMemo(() => data.trend.reduce((max, row) => {
    const expense = BigInt(row.expenses), income = includeIncome ? BigInt(row.income) : BigInt(0);
    return expense > max ? (income > expense ? income : expense) : income > max ? income : max;
  }, BigInt(0)).toString(), [data.trend, includeIncome]);
  const facts = useMemo(() => insights(data), [data]), previous = data.previous;
  return <>
    <Section title="Monthly Comparison">
      <Text style={themed_styles.body}>Full recorded calendar months; the selected month may still be in progress.</Text>
      {previous ? <>
        <Text style={themed_styles.body}>{monthLabel(data.selected.month)} compared with {monthLabel(previous.month)}</Text>
        {(['expenses', 'income'] as const).map((kind) => <View key={kind} style={{ gap: 4, paddingVertical: 8 }}>
          <Text style={themed_styles.heading}>{kind === 'expenses' ? 'Expenses' : 'Income'}</Text>
          <Text style={themed_styles.body}>Selected: {formatMoney(data.selected[kind])}</Text>
          <Text style={themed_styles.body}>Previous: {formatMoney(previous[kind])}</Text>
          <Text style={themed_styles.body}>{comparison(data.selected[kind], previous[kind])}</Text>
        </View>)}
        {previous.incomeCount === '0' && previous.expenseCount === '0' && <Text style={themed_styles.body}>No transactions were recorded in the previous month.</Text>}
      </> : <Text style={themed_styles.body}>No earlier calendar month is available.</Text>}
    </Section>
    <View style={themed_styles.card}>
      <Text style={themed_styles.heading}>Top Spending</Text>
      {data.expenses.length ? data.expenses.slice(0, 3).map((row, index) => <CategoryRow key={row.id} row={row} month={data.selected.month} rank={index + 1} />)
        : <Text style={themed_styles.body}>No expenses recorded this month.</Text>}
    </View>
    <Section title="Expense category breakdown">
      {data.expenses.length ? data.expenses.map((row) => <CategoryRow key={row.id} row={row} month={data.selected.month} />)
        : <Text style={themed_styles.body}>No expenses recorded this month.</Text>}
      {!!data.expenses.length && <Text style={themed_styles.body}>Percentages are rounded to one decimal place and may not total exactly 100%.</Text>}
    </Section>
    <Section title="Income category breakdown">
      {data.income.length ? data.income.map((row) => <CategoryRow key={row.id} row={row} month={data.selected.month} />)
        : <Text style={themed_styles.body}>No income recorded this month.</Text>}
    </Section>
    <View style={themed_styles.card}>
      <Text style={themed_styles.heading}>Spending Trend</Text>
      <OptionSelector label="Show" options={['Expenses', 'Income and expenses']} value={mode} onChange={setMode} />
      <Text style={themed_styles.body}>Monthly totals through {monthLabel(data.selected.month)}. Bars share the same scale.</Text>
      {data.trend.map((row) => <View key={row.month} style={{ gap: 6, paddingVertical: 8 }}>
        <Text style={themed_styles.heading}>{monthLabel(row.month)}</Text>
        {(includeIncome ? ['expenses', 'income'] as const : ['expenses'] as const).map((kind) => <View key={kind} style={{ gap: 4 }}>
          <Text style={themed_styles.body}>{kind === 'expenses' ? 'Expenses' : 'Income'}: {formatMoney(row[kind])}</Text>
          <View accessible={false} style={{ height: 10, borderRadius: 5, backgroundColor: appearance.colors.border, overflow: 'hidden' }}>
            <View style={{ height: 10, width: `${Number(percentage(row[kind], maximum))}%`, backgroundColor: kind === 'income' ? appearance.colors.income : appearance.colors.expense }} />
          </View>
        </View>)}
      </View>)}
    </View>
    <Section title="Insights">
      {facts.length ? facts.map((fact) => <Text key={fact} style={themed_styles.body}>{fact}</Text>)
        : <Text style={themed_styles.body}>Not enough recorded activity for insights this month.</Text>}
    </Section>
  </>;
}
