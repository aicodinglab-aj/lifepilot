import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { AppState, Text, View } from 'react-native';
import { AnalyticsSections } from '@/components/personal/analytics';
import { PersonalPage, TransactionCard } from '@/components/personal/ui';
import { Button, IconButton } from '@/components/ui/button';
import { StandardCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Section } from '@/components/ui/section';
import { iconSizes, spacing, typography } from '@/constants/design-system';
import { getTransactions } from '@/database/personal';
import { getPersonalAnalytics } from '@/database/personal-analytics';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { localToday, monthLabel, shiftMonth } from '@/features/personal/date';
import { formatMoney } from '@/features/personal/money';
import { usePersonalQuery } from '@/features/personal/use-personal-query';
export { PersonalErrorBoundary as ErrorBoundary } from '@/components/personal/error-boundary';

export default function PersonalDashboard() {
  const { colors } = useAppearance();
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
  const selectCurrentMonth = () => { setSelection(null); setCurrentMonth(localToday().slice(0, 7)); };

  return <PersonalPage title="Personal Expenses" {...state}
    loading={state.loading || (!state.error && state.data?.analytics.selected.month !== month)}>
    {state.data && <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <IconButton accessibilityLabel="Previous month" disabled={!previous} onPress={() => { if (previous) setSelection(previous); }}
          icon={<SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
            size={iconSizes.navigation} tintColor={previous ? colors.primary : colors.disabledText} />} />
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.xs }}>
          <Text style={[typography.label, { color: colors.muted }]}>SELECTED MONTH</Text>
          <Text accessibilityRole="header" style={[typography.sectionHeading, { color: colors.text, textAlign: 'center' }]}>{monthLabel(month)}</Text>
        </View>
        <IconButton accessibilityLabel="Next month" disabled={!next} onPress={() => { if (next) setSelection(next); }}
          icon={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={iconSizes.navigation} tintColor={next ? colors.primary : colors.disabledText} />} />
      </View>
      <Button label="Current month" variant="tertiary" onPress={selectCurrentMonth} />

      <StandardCard style={{ gap: spacing.lg }}>
        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text style={[typography.label, { color: colors.muted }]}>BALANCE</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.text, fontSize: 34, lineHeight: 42, fontWeight: '800' }}>
            {formatMoney(state.data.analytics.selected.balance)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <SummaryValue label={`Income · ${state.data.analytics.selected.incomeCount}`} value={state.data.analytics.selected.income} color={colors.income} />
          <SummaryValue label={`Expenses · ${state.data.analytics.selected.expenseCount}`} value={state.data.analytics.selected.expenses} color={colors.expense} />
        </View>
      </StandardCard>

      <Button label="Add Transaction" icon={<Text accessible={false} style={{ color: colors.onPrimary, fontSize: 20 }}>+</Text>}
        onPress={() => router.push('/personal/edit')} />

      <AnalyticsSections data={state.data.analytics} />

      <Section title="Recent Transactions" subtitle={monthLabel(month)}>
        <View style={{ gap: spacing.md }}>
          {state.data.recent.rows.length ? state.data.recent.rows.map((item) => <TransactionCard key={item.id} transaction={item} />)
            : <EmptyState title="No transactions this month" description="Choose another month or add a personal transaction."
              action={{ label: 'Add Transaction', onPress: () => router.push('/personal/edit') }} />}
          <Button label="View All Transactions" variant="secondary" onPress={() => router.push('/personal/history')} />
        </View>
      </Section>
    </>}
  </PersonalPage>;
}

function SummaryValue({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors } = useAppearance();
  return <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
    <Text style={[typography.caption, { color: colors.muted }]}>{label}</Text>
    <Text adjustsFontSizeToFit numberOfLines={1} style={[typography.cardTitle, { color }]}>{formatMoney(value)}</Text>
  </View>;
}
