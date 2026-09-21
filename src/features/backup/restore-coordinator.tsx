import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { restoreBackup, type RestoreResult } from './restore-service';
import type { File } from 'expo-file-system';

type ContextValue = { busy: boolean; lastError: string | null; runRestore: (file: File) => Promise<RestoreResult> };
const Context = createContext<ContextValue | null>(null);
export function RestoreCoordinator({ children }: { children: ReactNode }) {
  const db = useSQLiteContext(), { colors } = useAppearance();
  const [state, setState] = useState<'idle'|'restoring'|'success'>('idle');
  const [lastError, setLastError] = useState<string | null>(null), ready = useRef<(() => void) | null>(null), operation = useRef(false);
  useEffect(() => { if (state === 'restoring') { ready.current?.(); ready.current = null; } }, [state]);
  useEffect(() => { if (state === 'idle') return; const listener = BackHandler.addEventListener('hardwareBackPress', () => true); return () => listener.remove(); }, [state]);
  const runRestore = async (file: File) => {
    if (operation.current || state !== 'idle') throw new Error('A backup operation is already running.');
    operation.current = true;
    setLastError(null); const suspended = new Promise<void>((resolve) => { ready.current = resolve; }); setState('restoring'); await suspended;
    try { const result = await restoreBackup(db, file, { dataAccessSuspended: true }); setState('success'); return result; }
    catch (error) { operation.current = false; setLastError(error instanceof Error ? error.message : 'Restore failed.'); setState('idle'); throw error; }
  };
  if (state !== 'idle') return <View accessibilityViewIsModal accessibilityLabel="Restore in progress" style={{ flex:1, backgroundColor:colors.background, alignItems:'center', justifyContent:'center', padding:spacing.xl, gap:spacing.md }}>
    <Text accessibilityRole="header" style={[typography.screenTitle,{color:colors.text,textAlign:'center'}]}>{state === 'success' ? 'Restore complete' : 'Restoring LifePilot'}</Text>
    <Text style={[typography.body,{color:colors.muted,textAlign:'center'}]}>{state === 'success' ? 'Close and reopen LifePilot before continuing.' : 'Keep LifePilot open. Your current data is protected while the backup is restored.'}</Text>
  </View>;
  return <Context.Provider value={{ busy:false, lastError, runRestore }}>{children}</Context.Provider>;
}
export function useRestoreCoordinator() { const value=useContext(Context); if(!value) throw new Error('RestoreCoordinator is missing.'); return value; }
