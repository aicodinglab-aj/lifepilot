import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { Alert, Keyboard, Text, View } from 'react-native';
import { PersonalPage, Action } from '@/components/personal/ui';
import { Button, Chip, FieldMessage, FormInput, StandardCard } from '@/components/ui';
import { spacing, typography } from '@/constants/design-system';
import { getMonthlyBudgetSummary, removeCategoryBudget, removeOverallBudget, setCategoryBudget, setOverallBudget, updateCategoryBudget, updateOverallBudget } from '@/database/personal-budgets';
import { OperationSuspendedError } from '@/features/activity/operation-lifecycle';
import { useAppearance } from '@/features/appearance/appearance-provider';
import type { MonthlyBudgetSummary } from '@/features/personal/budget';
import { budgetRouteMonth } from '@/features/personal/budget-presentation';
import { monthLabel } from '@/features/personal/date';
import { moneyInput, parseMoney } from '@/features/personal/money';
import { usePersonalQuery } from '@/features/personal/use-personal-query';
export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

export default function BudgetEditorScreen() {
  const { month: raw, kind, categoryId } = useLocalSearchParams<{ month?: string; kind?: string; categoryId?: string }>();
  const month = budgetRouteMonth(raw);
  if (!month || (kind !== undefined && kind !== 'category') || (categoryId !== undefined && kind !== 'category')) {
    return <PersonalPage title="Budget" error="This budget link is invalid. Go back and select a budget." />;
  }
  return <BudgetEditorLoader key={`${month}-${kind}-${categoryId}`} month={month} category={kind === 'category'} categoryId={categoryId} />;
}
function BudgetEditorLoader({ month, category, categoryId }: { month: string; category: boolean; categoryId?: string }) {
  const db = useSQLiteContext();
  const state = usePersonalQuery(useCallback(() => getMonthlyBudgetSummary(db, month), [db, month]));
  const missingCategory = categoryId !== undefined && state.data && !state.data.categories.some(row => row.categoryId === categoryId);
  return <PersonalPage title={category ? 'Category budget' : 'Monthly budget'} loading={state.loading && !state.data}
    error={state.error ? 'Could not load the budget. Please try again.' : missingCategory ? 'This expense category is no longer available.' : null} retry={state.retry}>
    {state.data && <BudgetEditor db={db} summary={state.data} category={category} initialCategoryId={categoryId} />}
  </PersonalPage>;
}
export function BudgetEditor({ db, summary, category, initialCategoryId }: {
  db: SQLiteDatabase; summary: MonthlyBudgetSummary; category: boolean; initialCategoryId?: string;
}) {
  const { colors } = useAppearance();
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? '');
  const selected = summary.categories.find(row => row.categoryId === categoryId);
  const budget = category ? selected?.budget ?? null : summary.overallBudget;
  const [amount, setAmount] = useState(() => budget ? moneyInput(budget.amountPaise) : '');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string | null>(null);
  const working = useRef(false), focused = useRef(false), done = useRef(false);
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
  const leave = () => { Keyboard.dismiss(); router.dismissTo({ pathname: '/personal/budget', params: { month: summary.month } }); };
  function finish(message: string) {
    done.current = true;
    setCompleted(message);
    if (!focused.current) return;
    try { leave(); } catch { setError('Your change was saved. Use Continue or Back to return to budgets.'); }
  }
  async function save() {
    if (working.current || done.current) return;
    setError(null);
    if (category && !selected) { setError('Select an expense category.'); return; }
    try { parseMoney(amount); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enter a valid positive amount.'); return; }
    working.current = true; setBusy(true);
    try {
      if (category) await (budget ? updateCategoryBudget : setCategoryBudget)(db, summary.month, categoryId, amount);
      else await (budget ? updateOverallBudget : setOverallBudget)(db, summary.month, amount);
      finish('Budget saved');
    } catch (cause) { if (focused.current) setError(cause instanceof OperationSuspendedError ? cause.message : 'Could not save the budget. Go back to refresh before trying again.'); }
    finally { working.current = false; setBusy(false); }
  }
  function remove() {
    if (working.current || done.current || !budget) return;
    working.current = true; setBusy(true); setError(null);
    const release = () => { working.current = false; setBusy(false); };
    Alert.alert('Remove budget?', `Remove ${category ? selected?.categoryName : 'the monthly budget'} for ${monthLabel(summary.month)}? Transactions, categories and other budgets will stay unchanged.`, [
      { text: 'Cancel', style: 'cancel', onPress: release },
      { text: 'Remove', style: 'destructive', onPress: () => {
        if (!focused.current) { release(); return; }
        void (category ? removeCategoryBudget(db, summary.month, categoryId) : removeOverallBudget(db, summary.month))
          .then(() => finish('Budget removed'))
          .catch(cause => { if (focused.current) setError(cause instanceof OperationSuspendedError ? cause.message : 'Could not remove the budget. Please try again.'); })
          .finally(release);
      } },
    ], { cancelable: false });
  }
  return <>
    <Text accessibilityRole="header" style={[typography.sectionHeading, { color: colors.text }]}>{monthLabel(summary.month)}</Text>
    {completed ? <StandardCard><Text style={[typography.body, { color: colors.text }]}>{completed}</Text>
      <Button label="Continue" onPress={() => { try { leave(); } catch { setError('Use Back to return to budgets.'); } }} /></StandardCard> : <>
      {category && <StandardCard>
        <Text style={[typography.label, { color: colors.text }]}>Expense category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {summary.categories.map(row => <Chip key={row.categoryId} label={`${row.categoryName}${row.budget ? ' (Edit budget)' : ''}`}
            selected={row.categoryId === categoryId} disabled={busy} onPress={() => {
              setCategoryId(row.categoryId); setAmount(row.budget ? moneyInput(row.budget.amountPaise) : ''); setError(null);
            }} />)}
        </View>
        {!summary.categories.length && <FieldMessage>No expense categories are available.</FieldMessage>}
        {selected?.budget && <FieldMessage>A budget already exists for this category and month. You are editing that limit.</FieldMessage>}
      </StandardCard>}
      <FormInput label={'Budget amount (\u20b9)'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={20}
        editable={!busy} helper="Enter a positive amount with up to two decimal places. This limit applies only to the selected month." />
      <Button label={budget ? 'Save changes' : 'Set budget'} loading={busy} disabled={category && !selected} onPress={() => { void save(); }} />
      {budget && <Action label="Remove budget" destructive disabled={busy} onPress={remove} />}
    </>}
    {error && <FieldMessage error>{error}</FieldMessage>}
  </>;
}
