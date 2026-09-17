import { useThemedStyles } from '@/features/appearance/appearance-provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Keyboard, Text, View } from 'react-native';
import { Action, PersonalPage, styles } from '@/components/personal/ui';
import { FormTextField } from '@/components/forms/form-text-field';
import { OptionSelector } from '@/components/forms/option-selector';
import { getCategories, getTransaction, saveTransaction } from '@/database/personal';
import { localToday } from '@/features/personal/date';
import { moneyInput } from '@/features/personal/money';
import { PAYMENT_METHODS, validateTransaction, type Category, type TransactionInput } from '@/features/personal/transaction';
import { createSaveFlow } from '@/features/personal/save-flow';
import { personalDiagnostic } from '@/features/personal/diagnostics';

export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

export default function TransactionEditor() {
  const themed_styles = useThemedStyles(styles);
  const { id } = useLocalSearchParams<{ id?: string }>(), db = useSQLiteContext();
  const [categories, setCategories] = useState<Category[]>([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null), [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const flow = useRef(createSaveFlow()), working = useRef(false), focused = useRef(true);
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  const [draft, setDraft] = useState<TransactionInput>({ type: 'expense', amount: '', categoryId: '', transactionDate: localToday(), description: '', paymentMethod: '', notes: '' });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await getCategories(db);
        if (id !== undefined) {
          if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error('Invalid transaction.');
          const record = await getTransaction(db, Number(id));
          if (!record) throw new Error('Transaction not found.');
          if (active) setDraft({ ...record, amount: moneyInput(record.amount), description: record.description ?? '', notes: record.notes ?? '', paymentMethod: record.paymentMethod ?? '' });
        }
        if (active) setCategories(rows);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load transaction.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [db, id, attempt]);
  function field(key: keyof TransactionInput, value: string) { setDraft((current) => ({ ...current, [key]: value })); }
  async function save() {
    if (working.current) return;
    working.current = true; setBusy(true);
    try {
      if (!saved) validateTransaction(draft, categories);
      const outcome = await flow.current.run(
        () => saveTransaction(db, draft, id === undefined ? undefined : Number(id)),
        (savedId) => {
          if (!focused.current) return;
          Keyboard.dismiss();
          // Return to the dashboard/history/details that opened this editor.
          // A directly opened editor has a deterministic fallback using a string param.
          if (router.canGoBack()) router.back();
          else router.replace({ pathname: '/personal/transaction', params: { id: savedId } });
        },
        (stage) => { personalDiagnostic(stage); if (stage === 'save-success' && focused.current) setSaved(true); },
      );
      if (!focused.current) return;
      if (outcome === 'save-failed') Alert.alert('Could not save transaction', 'The save could not be confirmed. Check history before trying again.');
      if (outcome === 'navigation-failed') Alert.alert('Transaction saved', 'Your transaction was saved, but the next screen could not open. Use Continue or Back; do not add it again.');
    } catch (cause) { Alert.alert('Could not save transaction', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { working.current = false; if (focused.current) setBusy(false); }
  }
  const available = categories.filter((category) => category.type === draft.type);
  return <PersonalPage title={id === undefined ? 'Add Transaction' : 'Edit Transaction'} loading={loading} error={error} retry={() => { setLoading(true); setError(null); setAttempt((value) => value + 1); }}>
    {saved && <View style={themed_styles.card}><Text style={themed_styles.heading}>Transaction saved</Text>
      <Text style={themed_styles.body}>Continue to leave this screen. Your transaction will not be saved again.</Text>
      <Action label="Continue" disabled={busy} onPress={() => { void save(); }} /></View>}
    <View style={{ gap: 20 }} pointerEvents={busy || saved ? 'none' : 'auto'}>
      <Text style={themed_styles.title}>{id === undefined ? 'Add Transaction' : 'Edit Transaction'}</Text>
      <OptionSelector label="Type *" options={['Expense', 'Income']} value={draft.type === 'income' ? 'Income' : 'Expense'} onChange={(value) => setDraft((current) => ({ ...current, type: value.toLowerCase(), categoryId: '' }))} />
      <FormTextField label="Amount (₹) *" value={draft.amount} onChangeText={(value) => field('amount', value)} keyboardType="decimal-pad" placeholder="1250.50" maxLength={20} editable={!busy} />
      <OptionSelector label="Category *" options={available.map((category) => category.name)} value={available.find((category) => category.id === draft.categoryId)?.name ?? ''}
        onChange={(value) => field('categoryId', available.find((category) => category.name === value)?.id ?? '')} />
      <FormTextField label="Date *" value={draft.transactionDate} onChangeText={(value) => field('transactionDate', value)} placeholder="YYYY-MM-DD" maxLength={10} editable={!busy} />
      <FormTextField label="Description" optional value={draft.description} onChangeText={(value) => field('description', value)} maxLength={200} editable={!busy} />
      <OptionSelector label="Payment Method (optional)" options={['Not added', ...PAYMENT_METHODS]} value={draft.paymentMethod || 'Not added'} onChange={(value) => field('paymentMethod', value === 'Not added' ? '' : value)} />
      <FormTextField label="Notes" optional multiline value={draft.notes} onChangeText={(value) => field('notes', value)} maxLength={2000} editable={!busy} />
      <Action label={saved ? 'Saved' : busy ? 'Saving…' : 'Save Transaction'} disabled={busy || saved} onPress={() => { void save(); }} />
    </View>
  </PersonalPage>;
}
