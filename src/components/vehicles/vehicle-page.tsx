import type { ReactNode } from 'react';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';

export function VehicleHeader({ title, vehicleId, action }: {
  title: string; vehicleId?: number; action?: { label: string; onPress: () => void };
}) {
  return <Stack.Screen options={{ title, headerBackVisible: false,
    headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Go back"
      onPress={() => router.canGoBack() ? router.back() : router.replace('/vehicle-manager')} style={styles.headerButton}>
      <Text style={styles.headerIcon}>{'\u2190'}</Text>
    </Pressable>,
    headerRight: () => action ? <Pressable accessibilityRole="button" accessibilityLabel={action.label}
      onPress={action.onPress} style={styles.headerButton}><Text style={styles.accent}>{action.label}</Text></Pressable>
      : vehicleId ? <Pressable accessibilityRole="button" accessibilityLabel="Vehicle settings" style={styles.headerButton}
        onPress={() => router.push({ pathname: '/vehicle/manage', params: { id: String(vehicleId) } })}>
        <Text style={styles.headerIcon}>{'\u2699'}</Text></Pressable> : null,
  }} />;
}

export function VehiclePage({ title, vehicleId, action, loading, error, reload, children }: {
  title: string; vehicleId?: number; action?: { label: string; onPress: () => void };
  loading?: boolean; error?: string | null; reload?: () => void; children?: ReactNode;
}) {
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
    <VehicleHeader title={title} vehicleId={vehicleId} action={action} />
    <ScrollView contentContainerStyle={styles.content}>
      {loading ? <ActivityIndicator accessibilityLabel="Loading vehicle" color={colors.green} />
        : error ? <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.body}>{error}</Text>
          {reload && <Pressable accessibilityRole="button" onPress={reload} style={styles.button}><Text style={styles.accent}>Try again</Text></Pressable>}
          <Pressable accessibilityRole="button" onPress={() => router.replace('/vehicle-manager')} style={styles.button}>
            <Text style={styles.accent}>My Garage</Text></Pressable>
        </View> : children}
    </ScrollView>
  </SafeAreaView>;
}

export const vehiclePageStyles = StyleSheet.create({
  title: { color: colors.white, fontSize: 27, fontWeight: '800', letterSpacing: -0.5 },
  sectionTitle: { color: colors.white, fontSize: 19, fontWeight: '700' },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 12 },
});
const styles = StyleSheet.create({
  ...vehiclePageStyles,
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 24 },
  headerButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  headerIcon: { color: colors.green, fontSize: 27 },
  accent: { color: colors.green, fontWeight: '700', fontSize: 15 },
  button: { minHeight: 44, justifyContent: 'center' },
});
