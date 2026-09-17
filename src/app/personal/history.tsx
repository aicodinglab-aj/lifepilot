import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, LoadState, PersonalHeader, TransactionCard, styles } from '@/components/personal/ui';
import { OptionSelector } from '@/components/forms/option-selector';
import { FormTextField } from '@/components/forms/form-text-field';
import { getTransactions, type HistoryFilter } from '@/database/personal';
import { localToday, monthRange } from '@/features/personal/date';
import { usePersonalQuery } from '@/features/personal/use-personal-query';
import type { Transaction } from '@/features/personal/transaction';
export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

type Cursor = Pick<Transaction, 'id' | 'transactionDate'> | undefined;
export default function TransactionHistory() {
  const db = useSQLiteContext();
  const [filter, setFilter] = useState<HistoryFilter>({});
  const [month, setMonth] = useState(localToday().slice(0, 7));
  const [pages, setPages] = useState<Cursor[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const state = usePersonalQuery(useCallback(() => getTransactions(db, filter, cursor), [db, filter, cursor]));
  function changeFilter(next: HistoryFilter) { setPages([undefined]); setFilter(next); }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
    <PersonalHeader title="Transaction History" />
    <FlatList data={state.loading || state.error ? [] : state.data?.rows ?? []} keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <TransactionCard transaction={item} />}
      ListHeaderComponent={<View style={{ gap: 18 }}>
        <Text style={styles.title}>Transactions</Text>
        <Action label="Add Transaction" onPress={() => router.push('/personal/edit')} />
        <OptionSelector label="Transaction type" options={['All', 'Expenses', 'Income']}
          value={filter.type === 'expense' ? 'Expenses' : filter.type === 'income' ? 'Income' : 'All'}
          onChange={(value) => changeFilter({ ...filter, type: value === 'Expenses' ? 'expense' : value === 'Income' ? 'income' : undefined })} />
        <FormTextField label="Month (YYYY-MM)" value={month} onChangeText={setMonth} placeholder="YYYY-MM" maxLength={7} />
        <Action label="Apply month" onPress={() => {
          try { monthRange(month); changeFilter({ ...filter, month }); }
          catch (cause) { Alert.alert('Invalid month', cause instanceof Error ? cause.message : 'Use YYYY-MM.'); }
        }} />
        <Action label="All dates" onPress={() => changeFilter({ ...filter, month: undefined })} />
        <Text style={styles.body}>{filter.month || 'All dates'} · Page {pages.length}</Text>
        <LoadState loading={state.loading} error={state.error} retry={state.retry} />
      </View>}
      ListEmptyComponent={!state.loading && !state.error ? <View style={styles.card}><Text style={styles.heading}>No transactions found</Text><Text style={styles.body}>Add a transaction or try another filter.</Text></View> : null}
      ListFooterComponent={<View style={{ gap: 12 }}>
        {pages.length > 1 && <Action label="Previous page" disabled={state.loading} onPress={() => setPages((current) => current.slice(0, -1))} />}
        {!state.error && state.data?.hasMore && <Action label="Next page" disabled={state.loading} onPress={() => {
          const last = state.data?.rows.at(-1);
          if (last) { setPages((current) => [...current, { id: last.id, transactionDate: last.transactionDate }]); }
        }} />}
      </View>} />
  </SafeAreaView>;
}
