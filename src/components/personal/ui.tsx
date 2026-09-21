import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { InteractiveCard, StandardCard } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { iconSizes, layout, radii, spacing, typography } from '@/constants/design-system';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { useAppearance, useThemeColor } from '@/features/appearance/appearance-provider';
import { displayDate } from '@/features/personal/date';
import { formatMoney } from '@/features/personal/money';
import type { Transaction } from '@/features/personal/transaction';

export function PersonalHeader({ title }: { title: string }) {
  return <ScreenHeader title={title} fallbackHref={title === 'Personal Expenses' ? '/' : '/personal'} />;
}

export function Action({ label, onPress, disabled = false, destructive = false }: {
  label: string; onPress: () => void; disabled?: boolean; destructive?: boolean;
}) {
  const themedColor = useThemeColor();
  return destructive ? <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 48, borderRadius: radii.md,
      alignItems: 'center', justifyContent: 'center', padding: spacing.md, opacity: disabled || pressed ? 0.5 : 1 })}>
    <Text style={[typography.label, { color: themedColor('#FF9A9A') }]}>{label}</Text>
  </Pressable> : <Button label={label} variant="secondary" disabled={disabled} onPress={onPress} />;
}

export function LoadState({ loading, error, retry }: { loading?: boolean; error?: string | null; retry?: () => void }) {
  const { colors: themeColors } = useAppearance();
  return loading ? <ActivityIndicator color={themeColors.primary} accessibilityLabel="Loading personal expenses" />
    : error ? <StandardCard><Text accessibilityRole="alert" style={[typography.secondaryBody, { color: themeColors.danger }]}>{error}</Text>
      {retry && <Button label="Try again" variant="secondary" onPress={retry} />}</StandardCard> : null;
}

export function PersonalPage({ title, children, loading, error, retry }: {
  title: string; children?: ReactNode; loading?: boolean; error?: string | null; retry?: () => void;
}) {
  const { colors: themeColors } = useAppearance();
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: themeColors.background }}>
    <PersonalHeader title={title} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={layout.screenContent}>
        <LoadState loading={loading} error={error} retry={retry} />
        {!loading && !error && children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function TransactionCard({ transaction }: { transaction: Transaction }) {
  const { colors: themeColors } = useAppearance();
  const income = transaction.type === 'income';
  return <InteractiveCard accessibilityLabel={`Open ${income ? 'income' : 'expense'} transaction, ${formatMoney(transaction.amount)}`}
    onPress={() => router.push({ pathname: '/personal/transaction', params: { id: String(transaction.id) } })}
    trailing={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
      size={iconSizes.action} tintColor={themeColors.primary} />}>
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <Text style={[typography.cardTitle, { color: themeColors.text, flex: 1 }]} numberOfLines={2}>
          {transaction.description || transaction.categoryName}
        </Text>
        <Text style={[typography.cardTitle, { color: income ? themeColors.income : themeColors.expense }]}>
          {income ? '+' : '-'}{formatMoney(transaction.amount)}
        </Text>
      </View>
      <Text style={[typography.secondaryBody, { color: themeColors.muted }]}>{transaction.categoryName} · {displayDate(transaction.transactionDate)}</Text>
      {transaction.paymentMethod && <Text style={[typography.caption, { color: themeColors.muted }]}>{transaction.paymentMethod}</Text>}
    </View>
  </InteractiveCard>;
}

// Compatibility styles for personal screens that have not needed structural V2 changes.
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { ...layout.screenContent, paddingBottom: 40 },
  title: { color: colors.white, ...typography.screenTitle },
  heading: { color: colors.white, ...typography.sectionHeading },
  body: { color: colors.muted, ...typography.secondaryBody },
  accent: { color: colors.green, ...typography.label },
  amount: { color: colors.white, fontSize: 24, lineHeight: 30, fontWeight: '800' },
  error: { color: '#FF9A9A', ...typography.secondaryBody },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, padding: spacing.base, gap: spacing.sm },
  action: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: spacing.md },
  monthNavigation: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.sm, justifyContent: 'space-between' },
  monthNavigationSide: { flexGrow: 1, flexBasis: 120, minWidth: 0, alignItems: 'flex-start' },
  monthNavigationNext: { alignItems: 'flex-end' },
});
