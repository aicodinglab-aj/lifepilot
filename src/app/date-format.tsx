import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Section } from '@/components/ui/section';
import { layout, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { DATE_FORMATS, type DateFormat } from '@/features/dates/date-format';

const examples: Record<DateFormat, string> = {
  'DD-MM-YYYY': '26-11-2026',
  'MM-DD-YYYY': '11-26-2026',
  'YYYY-MM-DD': '2026-11-26',
};

export default function DateFormatScreen() {
  const { colors, dateFormat, setDateFormat, saving, error } = useAppearance();
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="Date Format" fallbackHref="/settings" />
    <ScrollView contentContainerStyle={layout.screenContent}>
      <Section title="Choose a date format" subtitle="Dates are saved as before; this only changes how they appear.">
        <View accessibilityRole="radiogroup" accessibilityLabel="Date format" style={{ gap: spacing.md }}>
          {DATE_FORMATS.map((format) => {
            const selected = dateFormat === format;
            return <Pressable key={format} accessibilityRole="radio" accessibilityLabel={`${format}, example ${examples[format]}`}
              accessibilityState={{ checked: selected, disabled: saving }} disabled={saving}
              onPress={() => { void setDateFormat(format); }}
              style={({ pressed }) => ({ minHeight: 72, padding: spacing.base, borderRadius: radii.lg,
                borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : colors.divider,
                backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                opacity: pressed ? 0.72 : saving ? 0.5 : 1 })}>
              <Text accessible={false} style={{ color: colors.primary, fontSize: 22 }}>{selected ? '\u25CF' : '\u25CB'}</Text>
              <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                <Text style={[typography.cardTitle, { color: colors.text }]}>{format}</Text>
                <Text style={[typography.secondaryBody, { color: colors.muted }]}>{examples[format]}</Text>
              </View>
            </Pressable>;
          })}
        </View>
      </Section>
      {saving && <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.muted }]}>Saving date format...</Text>}
      {error && <Text accessibilityRole="alert" style={[typography.secondaryBody, { color: colors.danger }]}>{error}</Text>}
    </ScrollView>
  </SafeAreaView>;
}
