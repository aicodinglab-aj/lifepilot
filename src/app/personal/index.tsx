import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppState, Text, View } from 'react-native';
import { Action, PersonalPage, TransactionCard, styles } from '@/components/personal/ui';
import { getTransactions } from '@/database/personal';
import { getPersonalAnalytics } from '@/database/personal-analytics';
import { AnalyticsSections } from '@/components/personal/analytics';
import { formatMoney } from '@/features/personal/money';
import { localToday, monthLabel, shiftMonth } from '@/features/personal/date';
import { usePersonalQuery } from '@/features/personal/use-personal-query';
export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

export default function PersonalDashboard() {
  const db = useSQLiteContext();
  const [currentMonth, setCurrentMonth] = useState(localToday().slice(0, 7));
  const [selection, setSelection] = useState<string | null>(null);
  const month = selection ?? currentMonth;
  useEffect(() => {
    const update = () => setCurrentMonth(localToday().slice(0, 7));
    const timer = setInterval(update, 30000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') update(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const state = usePersonalQuery(useCallback(async () => {
    const analytics = await getPersonalAnalytics(db, month);
    const recent = await getTransactions(db, { month }, undefined, 5);
    return { analytics, recent };
  }, [db, month]));
  const previous = shiftMonth(month, -1), next = shiftMonth(month, 1);
  return <PersonalPage title="Personal Expenses" {...state} loading={state.loading || (!state.error && state.data?.analytics.selected.month !== month)}>
    {state.data && <>
      <Text style={styles.title}>Personal Expenses</Text>
      <Text style={styles.heading}>{monthLabel(month)}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Action label="← Previous month" disabled={!previous} onPress={() => setSelection(previous)} />
        <Action label="Next month →" disabled={!next} onPress={() => setSelection(next)} />
      </View>
      <Action label="Current month" onPress={() => { setSelection(null); setCurrentMonth(localToday().slice(0, 7)); }} />
      <View style={styles.card}>
        <Text style={styles.body}>Income · {state.data.analytics.selected.incomeCount} transactions</Text>
        <Text style={styles.amount}>{formatMoney(state.data.analytics.selected.income)}</Text>
        <Text style={styles.body}>Expenses · {state.data.analytics.selected.expenseCount} transactions</Text>
        <Text style={styles.amount}>{formatMoney(state.data.analytics.selected.expenses)}</Text>
        <Text style={styles.body}>Balance</Text><Text style={styles.amount}>{formatMoney(state.data.analytics.selected.balance)}</Text>
      </View>
      <Action label="Add Transaction" onPress={() => router.push('/personal/edit')} />
      <AnalyticsSections data={state.data.analytics} />
      <Text style={styles.heading}>Recent Transactions · Selected month</Text>
      {state.data.recent.rows.length ? state.data.recent.rows.map((item) => <TransactionCard key={item.id} transaction={item} />)
        : <View style={styles.card}><Text style={styles.heading}>No transactions this month</Text><Text style={styles.body}>Choose another month or add a personal transaction.</Text></View>}
      <Action label="View All Transactions" onPress={() => router.push('/personal/history')} />
    </>}
  </PersonalPage>;
}
