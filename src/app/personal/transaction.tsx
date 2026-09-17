import { useThemedStyles } from '@/features/appearance/appearance-provider';
import { useCallback, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Text, View } from 'react-native';
import { Action, PersonalPage, styles } from '@/components/personal/ui';
import { deleteTransaction, getTransaction } from '@/database/personal';
import { usePersonalQuery } from '@/features/personal/use-personal-query';
import { formatMoney } from '@/features/personal/money';
import { displayDate } from '@/features/personal/date';
export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

export default function TransactionDetails() {
  const themed_styles = useThemedStyles(styles);
  const { id } = useLocalSearchParams<{ id?: string }>(), db = useSQLiteContext();
  const [busy, setBusy] = useState(false), working = useRef(false);
  const state = usePersonalQuery(useCallback(async () => {
    if (!id || !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error('Invalid transaction.');
    const record = await getTransaction(db, Number(id));
    if (!record) throw new Error('Transaction not found.');
    return record;
  }, [db, id]));
  async function remove() {
    if (working.current || !state.data) return;
    working.current = true; setBusy(true);
    try {
      await deleteTransaction(db, state.data.id);
      if (router.canGoBack()) router.back(); else router.replace('/personal');
    }
    catch (cause) { Alert.alert('Could not delete transaction', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  const item = state.data;
  return <PersonalPage title="Transaction Details" {...state}>
    {item && <>
      <Text style={themed_styles.title}>{item.type === 'income' ? 'Income' : 'Expense'}</Text>
      <Text style={themed_styles.amount}>{formatMoney(item.amount)}</Text>
      {[
        ['Category', item.categoryName], ['Date', displayDate(item.transactionDate)], ['Description', item.description],
        ['Payment Method', item.paymentMethod], ['Notes', item.notes],
      ].map(([label, value]) => <View key={label} style={themed_styles.card}><Text style={themed_styles.heading}>{label}</Text><Text style={themed_styles.body}>{value || 'Not added'}</Text></View>)}
      <Action label="Edit" disabled={busy} onPress={() => router.push({ pathname: '/personal/edit', params: { id: String(item.id) } })} />
      <Action label="Delete" destructive disabled={busy} onPress={() => Alert.alert('Delete transaction?', 'This will permanently remove this personal transaction.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void remove(); } },
      ])} />
    </>}
  </PersonalPage>;
}
