import { router } from 'expo-router';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';

import { lifePilotColors as colors } from '@/constants/lifepilot-theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.title}>
          Life<Text style={styles.green}>Pilot</Text>
        </Text>

        <Text style={styles.subtitle}>
          Manage your vehicles and personal expenses in one place.
        </Text>

        <View style={styles.accentLine} />

        <Text style={styles.tagline}>
          DRIVE SMART  •  SPEND WISE  •  LIVE BETTER
        </Text>
        
      </View>

      <View style={styles.cards}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/vehicle-manager')}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
          <View style={styles.iconBox}>
            <Text style={styles.icon}>🚗</Text>
          </View>

          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Vehicle Manager</Text>
            <Text style={styles.cardText}>
              Vehicles, service, fuel, documents, reminders and reports.
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </Pressable>

        <Pressable style={styles.card}>
          <View style={styles.iconBox}>
            <Text style={styles.icon}>▣</Text>
          </View>

          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Personal Expense Manager</Text>
            <Text style={styles.cardText}>
              Daily expenses, income, budgets, categories and reports.
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
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
  iconBox: {
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
    color: colors.green,
    fontSize: 32,
    marginLeft: 8,
  },
});
