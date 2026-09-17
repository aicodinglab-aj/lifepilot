import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { SQLiteStorage } from 'expo-sqlite/kv-store';
import { DEFAULT_CUSTOM, resolveTheme, themeColor, themedStyles, type CustomTheme, type ThemePreference } from './theme';
import { readCustomTheme, readTheme, writeCustomTheme, writeTheme } from './preference';

const storage = new SQLiteStorage('lifepilot-preferences.db');
const defaultTheme = resolveTheme('lifepilot', null);
const AppearanceContext = createContext({
  preference: 'lifepilot' as ThemePreference, resolved: defaultTheme, custom: DEFAULT_CUSTOM,
  colors: defaultTheme.colors, isDark: true, saving: false, error: null as string | null,
  setPreference: async (_value: ThemePreference): Promise<void> => {},
  setCustom: async (_value: CustomTheme): Promise<void> => {},
});
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('lifepilot');
  const [custom, setCustom] = useState<CustomTheme>(DEFAULT_CUSTOM);
  const [ready, setReady] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null), working = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.all([readTheme(storage), readCustomTheme(storage)]).then(([value, customization]) => {
      if (active) { setPreference(value); setCustom(customization); }
    })
      .catch(() => { if (active) setError('Could not read appearance settings. Using LifePilot.'); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  async function select(value: ThemePreference) {
    if (working.current) return;
    working.current = true; setSaving(true); setPreference(value); setError(null);
    try { await writeTheme(storage, value); }
    catch { setPreference(preference); setError('Could not save the theme. Your previous preference was restored.'); }
    finally { working.current = false; setSaving(false); }
  }
  async function customize(value: CustomTheme) {
    if (working.current) return;
    working.current = true; setSaving(true); setCustom(value); setError(null);
    try { await writeCustomTheme(storage, value); }
    catch { setCustom(custom); setError('Could not save customization. Your previous customization was restored.'); }
    finally { working.current = false; setSaving(false); }
  }
  const resolved = resolveTheme(preference, system, custom);
  if (!ready) return <View style={{ flex: 1, backgroundColor: defaultTheme.colors.background, justifyContent: 'center' }}><ActivityIndicator color={defaultTheme.colors.primary} /></View>;
  return <AppearanceContext.Provider value={{ preference, custom, resolved, colors: resolved.colors, isDark: resolved.isDark, saving, error, setPreference: select, setCustom: customize }}>
    {children}
  </AppearanceContext.Provider>;
}
export function useAppearance() { return useContext(AppearanceContext); }
export function useThemedStyles<T extends object>(styles: T): T {
  return themedStyles(styles, useAppearance().resolved);
}
export function useThemeColor() {
  const { resolved } = useAppearance();
  return (value: string) => themeColor(value, resolved);
}
