import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { comparison, insights, percentage, type CategoryTotal, type PersonalAnalytics } from '@/features/personal/analytics';
import { formatMoney } from '@/features/personal/money';
import { monthLabel } from '@/features/personal/date';
import { OptionSelector } from '@/components/forms/option-selector';
import { styles } from './ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={styles.heading}>{title} {expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && children}
  </View>;
}
function CategoryRow({ row, month, rank }: { row: CategoryTotal; month: string; rank?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${row.name}, ${formatMoney(row.amount)}, ${row.percentage} percent. View transactions`}
    onPress={() => router.push({ pathname: '/personal/history', params: { month, categoryId: row.id, type: row.type } })}
    style={{ gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }}>
    <Text style={styles.heading}>{rank ? `${rank}. ` : ''}{row.name}</Text>
    <Text style={styles.body}>{formatMoney(row.amount)} · {row.percentage}%</Text>
    <Text style={styles.accent}>View transactions →</Text>
  </Pressable>;
}
export function AnalyticsSections({ data }: { data: PersonalAnalytics }) {
  const [mode, setMode] = useState('Expenses');
  const includeIncome = mode === 'Income and expenses';
  const maximum = data.trend.reduce((max, row) => {
    const expense = BigInt(row.expenses), income = includeIncome ? BigInt(row.income) : BigInt(0);
    return expense > max ? (income > expense ? income : expense) : income > max ? income : max;
  }, BigInt(0)).toString();
  const facts = insights(data), previous = data.previous;
  return <>
    <Section title="Monthly Comparison">
      <Text style={styles.body}>Full recorded calendar months; the selected month may still be in progress.</Text>
      {previous ? <>
        <Text style={styles.body}>{monthLabel(data.selected.month)} compared with {monthLabel(previous.month)}</Text>
        {(['expenses', 'income'] as const).map((kind) => <View key={kind} style={{ gap: 4, paddingVertical: 8 }}>
          <Text style={styles.heading}>{kind === 'expenses' ? 'Expenses' : 'Income'}</Text>
          <Text style={styles.body}>Selected: {formatMoney(data.selected[kind])}</Text>
          <Text style={styles.body}>Previous: {formatMoney(previous[kind])}</Text>
          <Text style={styles.body}>{comparison(data.selected[kind], previous[kind])}</Text>
        </View>)}
        {previous.incomeCount === '0' && previous.expenseCount === '0' && <Text style={styles.body}>No transactions were recorded in the previous month.</Text>}
      </> : <Text style={styles.body}>No earlier calendar month is available.</Text>}
    </Section>
    <View style={styles.card}>
      <Text style={styles.heading}>Top Spending</Text>
      {data.expenses.length ? data.expenses.slice(0, 3).map((row, index) => <CategoryRow key={row.id} row={row} month={data.selected.month} rank={index + 1} />)
        : <Text style={styles.body}>No expenses recorded this month.</Text>}
    </View>
    <Section title="Expense category breakdown">
      {data.expenses.length ? data.expenses.map((row) => <CategoryRow key={row.id} row={row} month={data.selected.month} />)
        : <Text style={styles.body}>No expenses recorded this month.</Text>}
      {!!data.expenses.length && <Text style={styles.body}>Percentages are rounded to one decimal place and may not total exactly 100%.</Text>}
    </Section>
    <Section title="Income category breakdown">
      {data.income.length ? data.income.map((row) => <CategoryRow key={row.id} row={row} month={data.selected.month} />)
        : <Text style={styles.body}>No income recorded this month.</Text>}
    </Section>
    <View style={styles.card}>
      <Text style={styles.heading}>Spending Trend</Text>
      <OptionSelector label="Show" options={['Expenses', 'Income and expenses']} value={mode} onChange={setMode} />
      <Text style={styles.body}>Monthly totals through {monthLabel(data.selected.month)}. Bars share the same scale.</Text>
      {data.trend.map((row) => <View key={row.month} style={{ gap: 6, paddingVertical: 8 }}>
        <Text style={styles.heading}>{monthLabel(row.month)}</Text>
        {(includeIncome ? ['expenses', 'income'] as const : ['expenses'] as const).map((kind) => <View key={kind} style={{ gap: 4 }}>
          <Text style={styles.body}>{kind === 'expenses' ? 'Expenses' : 'Income'}: {formatMoney(row[kind])}</Text>
          <View accessible={false} style={{ height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View style={{ height: 10, width: `${Number(percentage(row[kind], maximum))}%`, backgroundColor: kind === 'income' ? colors.green : '#FFB6A6' }} />
          </View>
        </View>)}
      </View>)}
    </View>
    <Section title="Insights">
      {facts.length ? facts.map((fact) => <Text key={fact} style={styles.body}>{fact}</Text>)
        : <Text style={styles.body}>Not enough recorded activity for insights this month.</Text>}
    </Section>
  </>;
}
