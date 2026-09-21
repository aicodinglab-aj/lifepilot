import { useThemedStyles, useAppearance } from '@/features/appearance/appearance-provider';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ui/screen-header';
import { iconSizes, typography } from '@/constants/design-system';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';

export function VehicleHeader({ title, vehicleId, action }: {
  title: string; vehicleId?: number; action?: { label: string; onPress: () => void };
}) {
  const { colors: themeColors } = useAppearance();
  const rightAction = action ? { accessibilityLabel: action.label, onPress: action.onPress,
    icon: <Text style={[typography.label, { color: themeColors.primary }]}>{action.label}</Text> }
    : vehicleId ? { accessibilityLabel: 'Vehicle settings',
      onPress: () => router.push({ pathname: '/vehicle/manage', params: { id: String(vehicleId) } }),
      icon: <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
        size={iconSizes.navigation} tintColor={themeColors.primary} /> } : undefined;
  return <ScreenHeader title={title} fallbackHref="/vehicle-manager" rightAction={rightAction} />;
}

export function VehiclePage({ title, vehicleId, action, loading, error, reload, children }: {
  title: string; vehicleId?: number; action?: { label: string; onPress: () => void };
  loading?: boolean; error?: string | null; reload?: () => void; children?: ReactNode;
}) {
  const themed_styles = useThemedStyles(styles);
  const appearance = useAppearance();
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={themed_styles.screen}>
    <VehicleHeader title={title} vehicleId={vehicleId} action={action} />
    <ScrollView contentContainerStyle={themed_styles.content}>
      {loading ? <ActivityIndicator accessibilityLabel="Loading vehicle" color={appearance.colors.green} />
        : error ? <View style={themed_styles.card}>
          <Text accessibilityRole="alert" style={themed_styles.body}>{error}</Text>
          {reload && <Pressable accessibilityRole="button" onPress={reload} style={themed_styles.button}><Text style={themed_styles.accent}>Try again</Text></Pressable>}
          <Pressable accessibilityRole="button" onPress={() => router.replace('/vehicle-manager')} style={themed_styles.button}>
            <Text style={themed_styles.accent}>My Garage</Text></Pressable>
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
  accent: { color: colors.green, fontWeight: '700', fontSize: 15 },
  button: { minHeight: 44, justifyContent: 'center' },
});
