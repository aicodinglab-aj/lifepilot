import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { BackHandler, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { restoreBackup, type RestoreResult } from './restore-service';
import { createRestoreSession, restoreBlocksNavigation } from './restore-session';
import type { File } from 'expo-file-system';

type ContextValue = { busy: boolean; lastError: string | null; runRestore: (file: File) => Promise<RestoreResult> };
const Context = createContext<ContextValue | null>(null);
export function RestoreCoordinator({ children }: { children: ReactNode }) {
  const db = useSQLiteContext(), { colors } = useAppearance();
  const [session] = useState(createRestoreSession);
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  // Read live state even before React has committed the locked view.
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => restoreBlocksNavigation(session.getState()));
    return () => listener.remove();
  }, [session]);
  const runRestore = (file: File) => session.run((authorization) => restoreBackup(db, file, authorization));
  if (restoreBlocksNavigation(state)) {
    const title = state === 'recovery' ? 'Recovery did not complete' : state === 'success' ? 'Restore complete' : 'Restoring LifePilot';
    const message = state === 'recovery'
      ? 'Stop using LifePilot and close the application. Recovery material has been retained. Reopening does not confirm that your data has recovered.'
      : state === 'success' ? 'Close and reopen LifePilot before continuing.'
        : state === 'suspending' ? 'Waiting for current changes to finish. Keep LifePilot open.'
          : 'Keep LifePilot open while your data is restored.';
    return <View accessibilityViewIsModal accessibilityLabel={title} style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
      <Text accessibilityRole="header" style={[typography.screenTitle, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      <Text style={[typography.body, { color: colors.muted, textAlign: 'center' }]}>{message}</Text>
    </View>;
  }
  return <Context.Provider value={{ busy: false, lastError: session.getError(), runRestore }}>{children}</Context.Provider>;
}
export function useRestoreCoordinator() {
  const value = useContext(Context);
  if (!value) throw new Error('RestoreCoordinator is missing.');
  return value;
}
