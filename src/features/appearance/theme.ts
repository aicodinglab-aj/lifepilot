import { lifePilotColors } from '@/constants/lifepilot-theme';

export const THEME_OPTIONS = ['lifepilot', 'light', 'system', 'custom'] as const;
export type ThemePreference = typeof THEME_OPTIONS[number];
export const CUSTOM_BASES = ['dark', 'light'] as const;
export type CustomBase = typeof CUSTOM_BASES[number];
// Dark bases use bright accents; light bases use darker variants for readable text.
export const ACCENT_PRESETS = {
  emerald: { label: 'Emerald', dark: '#35D98A', light: '#087F4F' },
  blue: { label: 'Blue', dark: '#79B8FF', light: '#185ABD' },
  purple: { label: 'Purple', dark: '#C4A0FF', light: '#7030B5' },
  teal: { label: 'Teal', dark: '#54D6C7', light: '#08776E' },
  orange: { label: 'Orange', dark: '#FFB366', light: '#A34408' },
  red: { label: 'Red', dark: '#FF9292', light: '#B42332' },
} as const;
export type AccentPreset = keyof typeof ACCENT_PRESETS;
export const ACCENT_OPTIONS = Object.keys(ACCENT_PRESETS) as AccentPreset[];
export type CustomTheme = Readonly<{ base: CustomBase; accent: AccentPreset }>;
export const DEFAULT_CUSTOM: CustomTheme = Object.freeze({ base: 'dark', accent: 'emerald' });
export function themePreference(value: unknown): ThemePreference {
  // Legacy standalone Dark and corrupted values retain the signature appearance.
  return THEME_OPTIONS.find((option) => option === value) ?? 'lifepilot';
}
export function customBase(value: unknown): CustomBase {
  return value === 'light' ? 'light' : 'dark';
}
export function customAccent(value: unknown): AccentPreset {
  return ACCENT_OPTIONS.find((option) => option === value) ?? 'emerald';
}

const bases = {
  lifepilot: lifePilotColors,
  light: { background: '#F7F9F8', card: '#FFFFFF', green: '#087F4F', white: '#16251E', muted: '#52645A', border: '#CCDAD2' },
  dark: { background: '#121212', card: '#202020', green: '#35D98A', white: '#F5F5F5', muted: '#AAAAAA', border: '#393939' },
};
function semanticColors(base: keyof typeof bases, primary = bases[base].green) {
  const light = base === 'light';
  return Object.freeze({ ...bases[base], green: primary, white: bases[base].white,
    primary, text: bases[base].white, onPrimary: light ? '#FFFFFF' : '#0B1110',
    danger: light ? '#AF2525' : '#FF9A9A', warning: light ? '#806000' : '#F5C76B',
    success: light ? '#087F4F' : '#5BE49B', income: light ? '#087F4F' : '#35D98A',
    expense: light ? '#A64029' : '#FFB6A6',
    controlBorder: base === 'lifepilot' ? bases[base].border : light ? '#76867D' : '#808080',
    disabled: bases[base].muted,
    primarySurface: light ? '#F3F6F4' : '#2A2A2A',
  });
}
export type ThemeColors = ReturnType<typeof semanticColors>;
export type ResolvedTheme = Readonly<{ id: string; isDark: boolean; colors: ThemeColors }>;
const signature: ResolvedTheme = Object.freeze({ id: 'lifepilot', isDark: true, colors: semanticColors('lifepilot') });
const lightTheme: ResolvedTheme = Object.freeze({ id: 'light', isDark: false, colors: semanticColors('light') });
const customThemes = new Map<string, ResolvedTheme>();
export function resolveTheme(preference: ThemePreference, system: string | null | undefined, custom: CustomTheme = DEFAULT_CUSTOM): ResolvedTheme {
  if (preference === 'system') return system === 'dark' ? signature : lightTheme;
  if (preference !== 'custom') return preference === 'light' ? lightTheme : signature;
  const base = customBase(custom.base), accent = customAccent(custom.accent);
  const id = `custom:${base}:${accent}`;
  let resolved = customThemes.get(id);
  if (!resolved) {
    resolved = Object.freeze({ id, isDark: base === 'dark', colors: semanticColors(base, ACCENT_PRESETS[accent][base]) });
    customThemes.set(id, resolved);
  }
  return resolved;
}

// Compatibility bridge for existing styles. LifePilot keeps the exact original objects.
// New components consume semantic colors directly, without any preset-specific logic.
export function themeColor(color: string, theme: ResolvedTheme): string {
  if (theme.id === 'lifepilot') return color;
  const palette = theme.colors;
  const tokens: Record<string, string> = {
    '#0B1110': palette.background, '#14201B': palette.card, '#35D98A': palette.primary,
    '#F5F7F6': palette.text, '#9BAAA3': palette.muted, '#244438': palette.controlBorder,
    '#193D2C': palette.primarySurface, '#0B1110DD': `${palette.background}DD`,
    '#261616': theme.isDark ? '#261616' : '#FFF1F0',
    '#FF9A9A': palette.danger, '#FF8585': theme.isDark ? '#FF8585' : palette.danger,
    '#FF7A7A': theme.isDark ? '#FF7A7A' : palette.danger,
    '#FFB6A6': palette.expense, '#5BE49B': palette.success,
    '#F5C76B': palette.warning, '#9BA8A1': palette.muted,
  };
  return tokens[color.toUpperCase()] ?? color;
}
const styleCache = new WeakMap<object, Map<ResolvedTheme, object>>();
export function themedStyles<T extends object>(styles: T, theme: ResolvedTheme): T {
  if (theme.id === 'lifepilot') return styles;
  const cached = styleCache.get(styles)?.get(theme);
  if (cached) return cached as T;
  const converted = Object.fromEntries(Object.entries(styles).map(([name, value]) => [name,
    Object.fromEntries(Object.entries(value).map(([property, entry]) => [property,
      // Existing filled action labels use the signature background as foreground.
      property === 'color' && entry === lifePilotColors.background ? theme.colors.onPrimary :
        typeof entry === 'string' && /color$/i.test(property) ? themeColor(entry, theme) : entry])),
  ])) as T;
  const variants = styleCache.get(styles) ?? new Map<ResolvedTheme, object>();
  variants.set(theme, converted);
  styleCache.set(styles, variants);
  return converted;
}
