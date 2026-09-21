import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StandardCard } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Section } from '@/components/ui/section';
import { layout, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';

export default function AboutScreen() {
  const { colors } = useAppearance();
  const config = Constants.expoConfig;
  const version = config?.version ?? 'Not available';
  const build = Platform.OS === 'android' ? config?.android?.versionCode
    : Platform.OS === 'ios' ? config?.ios?.buildNumber : undefined;

  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="About LifePilot" fallbackHref="/settings" />
    <ScrollView contentContainerStyle={[layout.screenContent, { flexGrow: 1 }]}>
      <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.base }}>
        <Image source={require('@/assets/images/lifepilot-icon.png')} accessibilityLabel="LifePilot LP and leaf logo"
          contentFit="contain" style={{ width: 128, height: 128, borderRadius: 24 }} />
        <Text accessibilityRole="header" style={[typography.hero, { color: colors.text }]}>LifePilot</Text>
        <Text style={[typography.body, { color: colors.muted, textAlign: 'center' }]}>Your personal vehicle and expense companion.</Text>
      </View>
      <StandardCard>
        <Section title="App Information">
          <InfoRow label="Version" value={version} />
          <InfoRow label="Build" value={build == null ? 'Not available' : String(build)} />
        </Section>
      </StandardCard>
      <StandardCard>
        <Text style={[typography.caption, { color: colors.muted }]}>DEVELOPED BY</Text>
        <Text style={[typography.sectionHeading, { color: colors.text }]}>DMJ Labs</Text>
      </StandardCard>
      <Text style={[typography.caption, { color: colors.muted, textAlign: 'center', marginTop: 'auto', paddingTop: spacing.md }]}>
        © 2026 DMJ Labs. All rights reserved.
      </Text>
    </ScrollView>
  </SafeAreaView>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppearance();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md }}>
    <Text style={[typography.body, { color: colors.muted }]}>{label}</Text>
    <Text selectable style={[typography.body, { color: colors.text, fontWeight: '600' }]}>{value}</Text>
  </View>;
}
