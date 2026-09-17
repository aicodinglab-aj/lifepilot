import { customBase, customAccent, DEFAULT_CUSTOM, themePreference, type CustomTheme, type ThemePreference } from './theme';

export const THEME_KEY = 'appearance.theme';
export const CUSTOM_THEME_KEY = 'appearance.custom';
export type PreferenceStorage = { getItemAsync(key: string): Promise<string | null>; setItemAsync(key: string, value: string): Promise<void> };
export async function readTheme(storage: PreferenceStorage): Promise<ThemePreference> {
  return themePreference(await storage.getItemAsync(THEME_KEY));
}
export async function writeTheme(storage: PreferenceStorage, value: ThemePreference): Promise<void> {
  if (themePreference(value) !== value) throw new Error('Invalid theme preference.');
  await storage.setItemAsync(THEME_KEY, value);
}
export async function readCustomTheme(storage: PreferenceStorage): Promise<CustomTheme> {
  const stored = await storage.getItemAsync(CUSTOM_THEME_KEY);
  try {
    const value: unknown = JSON.parse(stored ?? 'null');
    if (!value || typeof value !== 'object') return DEFAULT_CUSTOM;
    return { base: customBase('base' in value ? value.base : null), accent: customAccent('accent' in value ? value.accent : null) };
  } catch { return DEFAULT_CUSTOM; }
}
export async function writeCustomTheme(storage: PreferenceStorage, value: CustomTheme): Promise<void> {
  if (customBase(value.base) !== value.base || customAccent(value.accent) !== value.accent) {
    throw new Error('Invalid custom theme.');
  }
  // One KV write prevents a partially saved base/accent pair. Main preference is independent.
  await storage.setItemAsync(CUSTOM_THEME_KEY, JSON.stringify({ base: value.base, accent: value.accent }));
}
