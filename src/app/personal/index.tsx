import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Text, View } from 'react-native';
import { Action, PersonalPage, TransactionCard, styles } from '@/components/personal/ui';
import { getMonthlyTotals, getTransactions } from '@/database/personal';
import { formatMoney } from '@/features/personal/money';
import { localToday } from '@/features/personal/date';
import { usePersonalQuery } from '@/features/personal/use-personal-query';
export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

export default function PersonalDashboard() {
  const db = useSQLiteContext();
  const [month, setMonth] = useState(localToday().slice(0, 7));
  useEffect(() => {
    const timer = setInterval(() => setMonth(localToday().slice(0, 7)), 30000);
    return () => clearInterval(timer);
  }, []);
  const state = usePersonalQuery(useCallback(async () => {
    const currentMonth = localToday().slice(0, 7);
    const [totals, recent] = await Promise.all([getMonthlyTotals(db, currentMonth), getTransactions(db, {}, undefined, 5)]);
    return { totals, recent, month: currentMonth };
    // The month dependency refreshes totals at a local month rollover while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, month]));
  return <PersonalPage title="Personal Expenses" {...state}>
    {state.data && <>
      <Text style={styles.title}>Personal Expense Manager</Text>
      <Text style={styles.accent}>CURRENT MONTH · {state.data.month}</Text>
      <View style={styles.card}>
        <Text style={styles.body}>Income</Text><Text style={styles.amount}>{formatMoney(state.data.totals.income)}</Text>
        <Text style={styles.body}>Expenses</Text><Text style={styles.amount}>{formatMoney(state.data.totals.expenses)}</Text>
        <Text style={styles.body}>Balance</Text><Text style={styles.amount}>{formatMoney(state.data.totals.balance)}</Text>
      </View>
      <Action label="Add Transaction" onPress={() => router.push('/personal/edit')} />
      <Text style={styles.heading}>Recent Transactions</Text>
      {state.data.recent.rows.length ? state.data.recent.rows.map((item) => <TransactionCard key={item.id} transaction={item} />)
        : <View style={styles.card}><Text style={styles.heading}>No transactions yet</Text><Text style={styles.body}>Add your first personal expense or income to get started.</Text></View>}
      <Action label="View All Transactions" onPress={() => router.push('/personal/history')} />
    </>}
  </PersonalPage>;
}
