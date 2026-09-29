import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Text, View } from 'react-native';
import { PersonalPage } from '@/components/personal/ui';
import { BudgetMonthSelector, BudgetProgressCard } from '@/components/personal/budget-ui';
import { Button, EmptyState, Section, StandardCard } from '@/components/ui';
import { spacing, typography } from '@/constants/design-system';
import { getMonthlyBudgetSummary } from '@/database/personal-budgets';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { budgetRouteMonth } from '@/features/personal/budget-presentation';
import { formatMoney } from '@/features/personal/money';
import { usePersonalQuery } from '@/features/personal/use-personal-query';
export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

export default function BudgetScreen() {
  const { month: raw } = useLocalSearchParams<{ month?: string }>();
  const month = budgetRouteMonth(raw);
  return month ? <BudgetDashboard key={month} initialMonth={month} /> : <PersonalPage title="Budget" error="This budget month is invalid. Go back and select a month." />;
}
export function BudgetDashboard({ initialMonth }: { initialMonth: string }) {
  const db = useSQLiteContext(), { colors } = useAppearance();
  const [month, setMonth] = useState(initialMonth);
  const state = usePersonalQuery(useCallback(() => getMonthlyBudgetSummary(db, month), [db, month]));
  const summary = state.data;
  const edit = (categoryId?: string) => router.push({ pathname: '/personal/budget-edit', params: { month, ...(categoryId ? { categoryId, kind: 'category' } : {}) } });
  return <PersonalPage title="Budget" loading={state.loading || (!state.error && summary?.month !== month)}
    error={state.error ? 'Could not load budgets. Please try again.' : null} retry={state.retry}>
    <BudgetMonthSelector month={month} onChange={setMonth} />
    {summary && <>
      {summary.overall.configured ? <BudgetProgressCard title="Monthly Budget" progress={summary.overall} onEdit={() => edit()} />
        : <StandardCard><EmptyState title="No monthly budget set" description="Set a limit to compare your personal expenses with your plan."
          action={{ label: 'Set Monthly Budget', onPress: () => edit() }} />
          <Text style={[typography.body, { color: colors.muted }]}>Spent this month: {formatMoney(summary.overall.spentPaise)}</Text>
        </StandardCard>}
      <Section title="Category budgets" subtitle="Category limits are independent of your monthly limit.">
        <View style={{ gap: spacing.md }}>
          {summary.categories.filter(row => row.budget !== null).map(row => <BudgetProgressCard key={row.categoryId}
            title={row.categoryName} progress={row.progress} onEdit={() => edit(row.categoryId)} />)}
          {!summary.categories.some(row => row.budget !== null) && <EmptyState title="No category budgets set" description="Choose an existing expense category to set its monthly limit." />}
          <Button label="Set Category Budget" variant="secondary" onPress={() => router.push({ pathname: '/personal/budget-edit', params: { month, kind: 'category' } })} />
        </View>
      </Section>
      <Text style={[typography.caption, { color: colors.muted }]}>Based on personal expenses only. Income and vehicle costs do not use these budgets.</Text>
      <Button label="View month's expenses" variant="tertiary" onPress={() => router.push({ pathname: '/personal/history', params: { month, type: 'expense' } })} />
    </>}
  </PersonalPage>;
}
