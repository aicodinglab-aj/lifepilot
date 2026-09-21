import { AppearanceProvider, useThemedStyles, useAppearance } from '@/features/appearance/appearance-provider';
import { useState } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { lifePilotColors } from '@/constants/lifepilot-theme';
import { migrateDatabase } from '@/database/migrate';
import { ReminderProvider } from '@/features/reminders/reminder-provider';
import { TaskProvider } from '@/features/tasks/task-provider';

SplashScreen.preventAutoHideAsync();

// SQLiteProvider observes options by identity. Theme renders must not reopen the database.
const databaseOptions = { enableChangeListener: true };

export default function AppRoot() {
  return <AppearanceProvider><RootLayout /></AppearanceProvider>;
}
function RootLayout() {
  const themed_styles = useThemedStyles(styles);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  if (databaseError) {
    return (
      <View style={themed_styles.errorScreen} onLayout={() => { SplashScreen.hide(); }}>
        <Text style={themed_styles.errorTitle}>Could not open LifePilot</Text>
        <Text style={themed_styles.errorText}>{databaseError}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDatabaseError(null)}
          style={themed_styles.retryButton}>
          <Text style={themed_styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SQLiteProvider
      databaseName="lifepilot.db"
      options={databaseOptions}
      onError={(error) => setDatabaseError(error.message)}
      onInit={migrateDatabase}>
      <ThemedNavigation />
    </SQLiteProvider>
  );
}

// Consume appearance inside SQLiteProvider's memo boundary so navigation updates
// independently of database setup and without remounting the application tree.
function ThemedNavigation() {
  const appearance = useAppearance();
  const baseTheme = appearance.isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = { ...baseTheme, colors: { ...baseTheme.colors,
    background: appearance.colors.background, card: appearance.colors.card,
    text: appearance.colors.text, border: appearance.colors.border, primary: appearance.colors.primary } };
  return (
      <ThemeProvider value={navigationTheme}>
        <StatusBar barStyle={appearance.isDark ? 'light-content' : 'dark-content'} backgroundColor={appearance.colors.background} />
        <ReminderProvider>
        <TaskProvider>
        <AnimatedSplashOverlay />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: appearance.colors.background },
            headerStyle: { backgroundColor: appearance.colors.background },
            headerTintColor: appearance.colors.white,
            headerShadowVisible: false,
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="vehicle-manager" options={{ title: 'Vehicle Manager' }} />
          <Stack.Screen name="add-vehicle" options={{ title: 'Add Vehicle' }} />
          <Stack.Screen name="vehicle/[id]" options={{ title: 'My Vehicle' }} />
          <Stack.Screen name="vehicle/manage" options={{ title: 'Manage Vehicle' }} />
          <Stack.Screen name="vehicle/details" options={{ title: 'Vehicle Details' }} />
          <Stack.Screen name="vehicle/edit" options={{ title: 'Edit Vehicle Details' }} />
          <Stack.Screen name="vehicle/photos" options={{ title: 'Documents & Photos' }} />
          <Stack.Screen name="vehicle/module" options={{ title: 'My Vehicle' }} />
        </Stack>
        </TaskProvider>
        </ReminderProvider>
      </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lifePilotColors.background,
    padding: 24,
  },
  errorTitle: { color: lifePilotColors.white, fontSize: 22, fontWeight: '800' },
  errorText: {
    color: lifePilotColors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: lifePilotColors.green,
    borderRadius: 14,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  retryText: { color: lifePilotColors.background, fontSize: 15, fontWeight: '800' },
});
