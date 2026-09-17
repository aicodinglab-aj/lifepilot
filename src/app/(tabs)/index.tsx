import { useThemedStyles, useAppearance } from '@/features/appearance/appearance-provider';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import { lifePilotColors as colors } from '@/constants/lifepilot-theme';

export default function HomeScreen() {
  const themed_styles = useThemedStyles(styles);
  const appearance = useAppearance();
  function openVehicleManager() {
    if (__DEV__) {
      console.debug('[Home] Vehicle Manager pressed -> /vehicle-manager');
    }
    router.push('/vehicle-manager');
  }

  return (
    <ScrollView style={{ backgroundColor: appearance.colors.background }} contentContainerStyle={themed_styles.container}>
      <StatusBar barStyle={appearance.isDark ? 'light-content' : 'dark-content'} backgroundColor={appearance.colors.background} />

      <View style={themed_styles.header}>
        <Text style={themed_styles.title}>
          Life<Text style={themed_styles.green}>Pilot</Text>
        </Text>

        <Text style={themed_styles.subtitle}>
          Manage your vehicles and personal expenses in one place.
        </Text>

        <View style={themed_styles.accentLine} />
        <Pressable accessibilityRole="button" accessibilityLabel="Settings and appearance" onPress={() => router.push('/settings')}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text style={{ color: appearance.colors.green, fontWeight: '700' }}>Settings</Text>
        </Pressable>

        <Text style={themed_styles.tagline}>
          DRIVE SMART  •  SPEND WISE  •  LIVE BETTER
        </Text>
        
      </View>

      <View style={themed_styles.cards}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/reminders')}
          style={({ pressed }) => [themed_styles.card, { minHeight: 72 }, pressed && themed_styles.cardPressed]}>
          <View style={themed_styles.iconBox}>
            <SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} size={26} tintColor={appearance.colors.green} />
          </View>
          <View style={themed_styles.cardContent}><Text style={themed_styles.cardTitle}>Vehicle Reminders</Text>
            <Text style={themed_styles.cardText}>Insurance, PUC and service due dates.</Text></View>
          <Text style={themed_styles.arrow}>›</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={openVehicleManager}
          style={({ pressed }) => [themed_styles.card, pressed && themed_styles.cardPressed]}>
          <View style={themed_styles.iconBox}>
            <Text style={themed_styles.icon}>🚗</Text>
          </View>

          <View style={themed_styles.cardContent}>
            <Text style={themed_styles.cardTitle}>Vehicle Manager</Text>
            <Text style={themed_styles.cardText}>
              Vehicles, service, fuel, documents, reminders and reports.
            </Text>
          </View>

          <Text style={themed_styles.arrow}>›</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Personal Expense Manager"
          onPress={() => router.push('/personal')}
          style={({ pressed }) => [themed_styles.card, pressed && themed_styles.cardPressed]}>
          <View style={themed_styles.iconBox}>
            <SymbolView name={{ ios: 'wallet.pass', android: 'account_balance_wallet', web: 'account_balance_wallet' }} size={26} tintColor={appearance.colors.green} />
          </View>

          <View style={themed_styles.cardContent}>
            <Text style={themed_styles.cardTitle}>Personal Expense Manager</Text>
            <Text style={themed_styles.cardText}>
              Personal expenses, income, categories and transaction history.
            </Text>
          </View>
          <Text style={themed_styles.arrow}>›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 44,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -1,
  },
  green: {
    color: colors.green,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 12,
  },
  accentLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.green,
    marginTop: 24,
    marginBottom: 22,
  },
  tagline: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  cards: {
    gap: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 140,
  },
  cardPressed: {
    opacity: 0.8,
  },
  comingSoon: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  iconBox: {
    flexShrink: 0,
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#193D2C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  icon: {
    fontSize: 26,
    color: colors.green,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  arrow: {
    flexShrink: 0,
    color: colors.green,
    fontSize: 32,
    marginLeft: 8,
  },
});
