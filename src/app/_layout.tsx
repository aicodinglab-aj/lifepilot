import { useState } from 'react';
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { lifePilotColors } from '@/constants/lifepilot-theme';
import { migrateDatabase } from '@/database/migrate';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  if (databaseError) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Could not open LifePilot</Text>
        <Text style={styles.errorText}>{databaseError}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDatabaseError(null)}
          style={styles.retryButton}>
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SQLiteProvider
      databaseName="lifepilot.db"
      onError={(error) => setDatabaseError(error.message)}
      onInit={migrateDatabase}>
      <ThemeProvider value={DarkTheme}>
        <AnimatedSplashOverlay />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: lifePilotColors.background },
            headerStyle: { backgroundColor: lifePilotColors.background },
            headerTintColor: lifePilotColors.white,
            headerShadowVisible: false,
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="vehicle-manager" options={{ title: 'Vehicle Manager' }} />
          <Stack.Screen name="add-vehicle" options={{ title: 'Add Vehicle' }} />
          <Stack.Screen name="vehicle/[id]" options={{
            title: 'Vehicle Photos',
            headerBackVisible: false,
            headerLeft: () => (
              <Pressable accessibilityRole="button" accessibilityLabel="Go back"
                onPress={() => router.back()}
                style={({ pressed }) => [styles.photoBackButton, pressed && { opacity: 0.6 }]}>
                <Text style={styles.photoBackIcon}>{'\u2190'}</Text>
              </Pressable>
            ),
          }} />
          <Stack.Screen name="vehicle/manage" options={{ title: 'Manage Vehicle' }} />
        </Stack>
      </ThemeProvider>
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  photoBackButton: {
    width: 44, height: 44, marginRight: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  photoBackIcon: { color: lifePilotColors.green, fontSize: 28 },
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
