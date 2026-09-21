import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InteractiveCard, StandardCard } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Section } from '@/components/ui/section';
import { iconSizes, layout, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { ACCENT_OPTIONS, ACCENT_PRESETS, CUSTOM_BASES, THEME_OPTIONS, type ThemePreference } from '@/features/appearance/theme';

const labels: Record<ThemePreference, string> = { lifepilot: 'LifePilot', light: 'Light', system: 'System default', custom: 'Custom' };
const descriptions: Record<ThemePreference, string> = {
  lifepilot: "LifePilot's signature black & emerald theme", light: 'Light appearance with LifePilot accents',
  system: 'Follow your device appearance', custom: "Personalize LifePilot's appearance",
};

function Choice({ label, description, selected, swatch, onPress }: {
  label: string; description?: string; selected: boolean; swatch?: string; onPress: () => void;
}) {
  const { colors, saving } = useAppearance();
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled: saving }}
    disabled={saving} onPress={onPress} style={({ pressed }) => ({ minHeight: 64, padding: spacing.base, borderRadius: radii.lg,
      borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : colors.divider,
      backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      opacity: pressed ? 0.72 : saving ? 0.5 : 1 })}>
    <Text accessible={false} style={{ color: colors.primary, fontSize: 22 }}>{selected ? '\u25CF' : '\u25CB'}</Text>
    {swatch && <View accessible={false} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: swatch }} />}
    <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
      <Text style={[typography.cardTitle, { color: colors.text }]}>{label}</Text>
      {description && <Text style={[typography.secondaryBody, { color: colors.muted }]}>{description}</Text>}
    </View>
  </Pressable>;
}

export default function SettingsScreen() {
  const { colors, preference, custom, setPreference, setCustom, saving, error } = useAppearance();
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="Settings" fallbackHref="/" />
    <ScrollView contentContainerStyle={layout.screenContent}>
      <Section title="Appearance" subtitle="Choose how LifePilot looks across every screen.">
        <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={{ gap: spacing.md }}>
          {THEME_OPTIONS.map((option) => <Choice key={option} label={labels[option]} description={descriptions[option]}
            selected={preference === option} onPress={() => { void setPreference(option); }} />)}
        </View>
      </Section>

      {preference === 'custom' && <StandardCard>
        <Section title="Customize theme">
          <Text style={[typography.label, { color: colors.text }]}>Base appearance</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Base appearance" style={{ gap: spacing.sm }}>
            {CUSTOM_BASES.map((base) => <Choice key={base} label={base === 'dark' ? 'Dark' : 'Light'}
              selected={custom.base === base} onPress={() => { void setCustom({ ...custom, base }); }} />)}
          </View>
          <Text style={[typography.label, { color: colors.text }]}>Accent color</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Accent color" style={{ gap: spacing.sm }}>
            {ACCENT_OPTIONS.map((accent) => <Choice key={accent} label={ACCENT_PRESETS[accent].label}
              swatch={ACCENT_PRESETS[accent][custom.base]} selected={custom.accent === accent}
              onPress={() => { void setCustom({ ...custom, accent }); }} />)}
          </View>
        </Section>
      </StandardCard>}

      {preference === 'custom' && <StandardCard>
        <Section title="Custom Theme Preview">
          <Text style={[typography.cardTitle, { color: colors.text }]}>Sample Card</Text>
          <View accessibilityLabel="Primary Action appearance preview" style={{ minHeight: 48, padding: spacing.md,
            borderRadius: radii.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[typography.label, { color: colors.onPrimary }]}>Primary Action</Text>
          </View>
          <Text style={[typography.body, { color: colors.text }]}>Sample text</Text>
          <Text style={[typography.secondaryBody, { color: colors.muted }]}>Secondary text</Text>
          <Text style={[typography.secondaryBody, { color: colors.success }]}>Success message</Text>
          <Text style={[typography.secondaryBody, { color: colors.warning }]}>Warning message</Text>
          <Text style={[typography.secondaryBody, { color: colors.danger }]}>Error message</Text>
        </Section>
      </StandardCard>}

      {saving && <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.muted }]}>Saving appearance...</Text>}
      {error && <Text accessibilityRole="alert" style={[typography.secondaryBody, { color: colors.danger }]}>{error}</Text>}
      <InteractiveCard accessibilityLabel="Backup and Restore" onPress={() => router.push('/backup-restore')}
        leading={<SymbolView name={{ ios: 'externaldrive', android: 'backup', web: 'backup' }} size={iconSizes.card} tintColor={colors.primary} />}
        trailing={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={iconSizes.action} tintColor={colors.primary} />}>
        <Text style={[typography.cardTitle, { color: colors.text }]}>Backup & Restore</Text>
        <Text style={[typography.secondaryBody, { color: colors.muted }]}>Save or recover your LifePilot data</Text>
      </InteractiveCard>
      <InteractiveCard accessibilityLabel="About LifePilot" onPress={() => router.push('/about')}
        leading={<SymbolView name={{ ios: 'info.circle', android: 'info', web: 'info' }} size={iconSizes.card} tintColor={colors.primary} />}
        trailing={<SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={iconSizes.action} tintColor={colors.primary} />}>
        <Text style={[typography.cardTitle, { color: colors.text }]}>About LifePilot</Text>
        <Text style={[typography.secondaryBody, { color: colors.muted }]}>App information and developer</Text>
      </InteractiveCard>
    </ScrollView>
  </SafeAreaView>;
}
