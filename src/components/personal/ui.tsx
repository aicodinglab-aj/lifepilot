import type { ReactNode } from 'react';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { formatMoney } from '@/features/personal/money';
import { displayDate } from '@/features/personal/date';
import type { Transaction } from '@/features/personal/transaction';

export function PersonalHeader({ title }: { title: string }) {
  return <Stack.Screen options={{ title, headerBackVisible: false, headerLeft: () =>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}
      onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
      <Text style={styles.accent}>← Back</Text>
    </Pressable> }} />;
}
export function Action({ label, onPress, disabled = false, destructive = false }: { label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, (pressed || disabled) && { opacity: 0.5 }]}>
    <Text style={[styles.accent, destructive && { color: '#FF9A9A' }]}>{label}</Text>
  </Pressable>;
}
export function LoadState({ loading, error, retry }: { loading?: boolean; error?: string | null; retry?: () => void }) {
  return loading ? <ActivityIndicator color={colors.green} accessibilityLabel="Loading personal expenses" />
    : error ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      {retry && <Action label="Try again" onPress={retry} />}</View> : null;
}
export function PersonalPage({ title, children, loading, error, retry }: {
  title: string; children?: ReactNode; loading?: boolean; error?: string | null; retry?: () => void;
}) {
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
    <PersonalHeader title={title} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <LoadState loading={loading} error={error} retry={retry} />
        {!loading && !error && children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function TransactionCard({ transaction }: { transaction: Transaction }) {
  const income = transaction.type === 'income';
  return <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/personal/transaction', params: { id: String(transaction.id) } })} style={styles.card}>
    <Text style={styles.heading}>{transaction.description || transaction.categoryName}</Text>
    <Text style={styles.body}>{transaction.categoryName} · {displayDate(transaction.transactionDate)}</Text>
    {transaction.paymentMethod && <Text style={styles.body}>{transaction.paymentMethod}</Text>}
    <Text style={[styles.amount, { color: income ? colors.green : '#FFB6A6' }]}>{income ? '+' : '-'}{formatMoney(transaction.amount)}</Text>
    <Text style={styles.body}>{income ? 'Income' : 'Expense'}</Text>
  </Pressable>;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  title: { color: colors.white, fontSize: 27, fontWeight: '800' },
  heading: { color: colors.white, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  accent: { color: colors.green, fontSize: 15, fontWeight: '700' },
  amount: { color: colors.white, fontSize: 24, fontWeight: '800' },
  error: { color: '#FF9A9A', fontSize: 14, lineHeight: 22 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  action: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12 },
  back: { minHeight: 44, minWidth: 64, justifyContent: 'center' },
});
