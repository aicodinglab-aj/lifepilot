import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/features/appearance/appearance-provider';

export default function AboutScreen() {
  const { colors } = useAppearance();
  const config = Constants.expoConfig;
  const version = config?.version ?? 'Not available';
  const build = Platform.OS === 'android' ? config?.android?.versionCode
    : Platform.OS === 'ios' ? config?.ios?.buildNumber : undefined;

  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <Stack.Screen options={{ title: 'About LifePilot', headerBackVisible: false, headerLeft: () =>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={{ minWidth: 64, minHeight: 44, justifyContent: 'center' }}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>{'\u2190 Back'}</Text>
      </Pressable> }} />
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 24 }}>
      <View style={{ alignItems: 'center', gap: 14, paddingVertical: 16 }}>
        <Image source={require('@/assets/images/lifepilot-icon.png')} accessibilityLabel="LifePilot LP and leaf logo"
          contentFit="contain" style={{ width: 128, height: 128, borderRadius: 24 }} />
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 30, fontWeight: '800' }}>LifePilot</Text>
        <Text style={{ color: colors.muted, fontSize: 16, lineHeight: 24, textAlign: 'center' }}>
          Your personal vehicle and expense companion.
        </Text>
      </View>
      <View style={{ padding: 18, gap: 18, borderRadius: 18, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.card }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>App Information</Text>
        <InfoRow label="Version" value={version} />
        <InfoRow label="Build" value={build == null ? 'Not available' : String(build)} />
      </View>
      <View style={{ padding: 18, gap: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.card }}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Developed by</Text>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>DMJ Labs</Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 'auto', paddingTop: 12 }}>
        © 2026 DMJ Labs. All rights reserved.
      </Text>
    </ScrollView>
  </SafeAreaView>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppearance();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
    <Text style={{ color: colors.muted, fontSize: 15 }}>{label}</Text>
    <Text selectable style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{value}</Text>
  </View>;
}
