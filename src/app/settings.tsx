import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { ACCENT_OPTIONS, ACCENT_PRESETS, CUSTOM_BASES, THEME_OPTIONS, type ThemePreference } from '@/features/appearance/theme';

const labels: Record<ThemePreference, string> = { lifepilot: 'LifePilot', light: 'Light', system: 'System default', custom: 'Custom' };
const descriptions: Record<ThemePreference, string> = {
  lifepilot: "LifePilot's signature black & emerald theme",
  light: 'Light appearance with LifePilot accents',
  system: 'Follow your device appearance',
  custom: "Personalize LifePilot's appearance",
};

function Choice({ label, description, selected, swatch, onPress }: {
  label: string; description?: string; selected: boolean; swatch?: string; onPress: () => void;
}) {
  const { colors, saving } = useAppearance();
  return <Pressable accessibilityRole="radio" accessibilityLabel={label}
    accessibilityState={{ checked: selected, disabled: saving }} disabled={saving} onPress={onPress}
    style={{ padding: 18, minHeight: 64, borderRadius: 18, borderWidth: selected ? 2 : 1,
      borderColor: selected ? colors.primary : colors.controlBorder, backgroundColor: colors.card,
      flexDirection: 'row', alignItems: 'center', gap: 14 }}>
    <Text accessible={false} style={{ color: saving ? colors.disabled : colors.primary, fontSize: 24 }}>{selected ? '\u25CF' : '\u25CB'}</Text>
    {swatch && <View accessible={false} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: swatch }} />}
    <View style={{ flex: 1 }}>
      <Text style={{ color: saving ? colors.disabled : colors.text, fontSize: 16, fontWeight: '700' }}>{label}</Text>
      {description && <Text style={{ color: colors.muted, marginTop: 6 }}>{description}</Text>}
    </View>
  </Pressable>;
}

export default function SettingsScreen() {
  const { colors, preference, custom, setPreference, setCustom, saving, error } = useAppearance();
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <Stack.Screen options={{ title: 'Settings', headerBackVisible: false, headerLeft: () =>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={{ minWidth: 64, minHeight: 44, justifyContent: 'center' }}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>{'\u2190 Back'}</Text>
      </Pressable> }} />
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 27, fontWeight: '800' }}>Appearance</Text>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>Theme</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={{ gap: 12 }}>
        {THEME_OPTIONS.map((option) => <Choice key={option} label={labels[option]} description={descriptions[option]}
          selected={preference === option} onPress={() => { void setPreference(option); }} />)}
      </View>
      {preference === 'custom' && <>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>Customize theme</Text>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Base appearance</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Base appearance" style={{ gap: 12 }}>
          {CUSTOM_BASES.map((base) => <Choice key={base} label={base === 'dark' ? 'Dark' : 'Light'}
            selected={custom.base === base} onPress={() => { void setCustom({ ...custom, base }); }} />)}
        </View>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Accent color</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Accent color" style={{ gap: 12 }}>
          {ACCENT_OPTIONS.map((accent) => <Choice key={accent} label={ACCENT_PRESETS[accent].label}
            swatch={ACCENT_PRESETS[accent][custom.base]} selected={custom.accent === accent}
            onPress={() => { void setCustom({ ...custom, accent }); }} />)}
        </View>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>Custom Theme Preview</Text>
        <View style={{ padding: 18, gap: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.card }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Sample Card</Text>
          <View accessibilityLabel="Primary Action appearance preview" style={{ minHeight: 48, padding: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' }}>
            <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Primary Action</Text>
          </View>
          <Text style={{ color: colors.text }}>Sample text</Text>
          <Text style={{ color: colors.muted }}>Secondary text</Text>
          <Text style={{ color: colors.success }}>Success message</Text>
          <Text style={{ color: colors.warning }}>Warning message</Text>
          <Text style={{ color: colors.danger }}>Error message</Text>
        </View>
      </>}
      {saving && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>Saving appearance...</Text>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
  </SafeAreaView>;
}
