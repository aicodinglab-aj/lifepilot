import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Keyboard, Text, View } from 'react-native';
import { PersonalPage } from '@/components/personal/ui';
import { Button } from '@/components/ui/button';
import { StandardCard, StatusCard } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FieldLabel, FormInput } from '@/components/ui/form-controls';
import { Section } from '@/components/ui/section';
import { spacing, typography } from '@/constants/design-system';
import { getCategories, getTransaction, saveTransaction } from '@/database/personal';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { localToday } from '@/features/personal/date';
import { personalDiagnostic } from '@/features/personal/diagnostics';
import { moneyInput } from '@/features/personal/money';
import { createSaveFlow } from '@/features/personal/save-flow';
import { PAYMENT_METHODS, validateTransaction, type Category, type TransactionInput } from '@/features/personal/transaction';

export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

export default function TransactionEditor() {
  const { colors } = useAppearance();
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
  return <PersonalPage title={id === undefined ? 'Add Transaction' : 'Edit Transaction'} loading={loading} error={error}
    retry={() => { setLoading(true); setError(null); setAttempt((value) => value + 1); }}>
    {saved && <StatusCard tone="success">
      <Text style={[typography.cardTitle, { color: colors.success }]}>Transaction saved</Text>
      <Text style={[typography.secondaryBody, { color: colors.muted }]}>Continue to leave this screen. Your transaction will not be saved again.</Text>
      <Button label="Continue" variant="secondary" disabled={busy} onPress={() => { void save(); }} />
    </StatusCard>}
    <View style={{ gap: spacing.lg }} pointerEvents={busy || saved ? 'none' : 'auto'}>
      <StandardCard>
        <Section title="Transaction" subtitle="Choose the type and enter the amount.">
          <FieldLabel>Type *</FieldLabel>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(['Expense', 'Income'] as const).map((value) => <Chip key={value} label={value}
              selected={draft.type === value.toLowerCase()} disabled={busy}
              onPress={() => setDraft((current) => ({ ...current, type: value.toLowerCase(), categoryId: '' }))} />)}
          </View>
          <FormInput label="Amount (₹) *" value={draft.amount} onChangeText={(value) => field('amount', value)}
            keyboardType="decimal-pad" placeholder="1250.50" maxLength={20} editable={!busy} />
          <FieldLabel>Category *</FieldLabel>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {available.map((category) => <Chip key={category.id} label={category.name} selected={draft.categoryId === category.id}
              disabled={busy} onPress={() => field('categoryId', category.id)} />)}
          </View>
        </Section>
      </StandardCard>

      <StandardCard>
        <Section title="Details" subtitle="Add the date and any useful context.">
          <FormInput label="Date *" value={draft.transactionDate} onChangeText={(value) => field('transactionDate', value)}
            placeholder="YYYY-MM-DD" maxLength={10} editable={!busy} />
          <FormInput label="Description" optional value={draft.description} onChangeText={(value) => field('description', value)}
            maxLength={200} editable={!busy} />
          <FieldLabel optional>Payment Method</FieldLabel>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {['Not added', ...PAYMENT_METHODS].map((value) => <Chip key={value} label={value}
              selected={(draft.paymentMethod || 'Not added') === value} disabled={busy}
              onPress={() => field('paymentMethod', value === 'Not added' ? '' : value)} />)}
          </View>
          <FormInput label="Notes" optional multiline value={draft.notes} onChangeText={(value) => field('notes', value)}
            maxLength={2000} editable={!busy} />
        </Section>
      </StandardCard>
      <Button label={saved ? 'Saved' : 'Save Transaction'} loading={busy} disabled={busy || saved} onPress={() => { void save(); }} />
    </View>
  </PersonalPage>;
}
