import { useAppearance } from '@/features/appearance/appearance-provider';
import { useCallback, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Text, View } from 'react-native';
import { Action, PersonalPage } from '@/components/personal/ui';
import { Button } from '@/components/ui/button';
import { StandardCard } from '@/components/ui/card';
import { spacing, typography } from '@/constants/design-system';
import { deleteTransaction, getTransaction } from '@/database/personal';
import { usePersonalQuery } from '@/features/personal/use-personal-query';
import { formatMoney } from '@/features/personal/money';
import { displayDate } from '@/features/personal/date';
export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

export default function TransactionDetails() {
  const { colors } = useAppearance();
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
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <Text style={[typography.label, { color: item.type === 'income' ? colors.income : colors.expense }]}>{item.type === 'income' ? 'INCOME' : 'EXPENSE'}</Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.text, fontSize: 34, lineHeight: 42, fontWeight: '800' }}>{formatMoney(item.amount)}</Text>
      </View>
      <StandardCard>{[
        ['Category', item.categoryName], ['Date', displayDate(item.transactionDate)], ['Description', item.description],
        ['Payment Method', item.paymentMethod], ['Notes', item.notes],
      ].map(([label, value]) => <View key={label} style={{ gap: spacing.xs }}>
        <Text style={[typography.label, { color: colors.muted }]}>{label}</Text>
        <Text style={[typography.body, { color: colors.text }]}>{value || 'Not added'}</Text>
      </View>)}</StandardCard>
      <Button label="Edit" variant="secondary" disabled={busy} onPress={() => router.push({ pathname: '/personal/edit', params: { id: String(item.id) } })} />
      <Action label="Delete" destructive disabled={busy} onPress={() => Alert.alert('Delete transaction?', 'This will permanently remove this personal transaction.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void remove(); } },
      ])} />
    </>}
  </PersonalPage>;
}
