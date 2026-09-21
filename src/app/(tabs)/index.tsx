import type { ComponentProps } from 'react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ScrollView, StatusBar, Text, View } from 'react-native';

import { IconButton } from '@/components/ui/button';
import { InteractiveCard } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { iconSizes, layout, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';

type ModuleIconName = ComponentProps<typeof SymbolView>['name'];

function ModuleIcon({ name }: { name: ModuleIconName }) {
  const { colors } = useAppearance();
  return <View accessible={false} style={{ width: 48, height: 48, borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
    <SymbolView name={name} size={iconSizes.card} tintColor={colors.primary} />
  </View>;
}

function ModuleCard({ title, description, icon, onPress }: {
  title: string; description: string; icon: ModuleIconName; onPress: () => void;
}) {
  const { colors } = useAppearance();
  return <InteractiveCard accessibilityLabel={title} onPress={onPress} leading={<ModuleIcon name={icon} />}
    style={{ minHeight: 96 }}>
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.cardTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[typography.secondaryBody, { color: colors.muted }]}>{description}</Text>
    </View>
  </InteractiveCard>;
}

export default function HomeScreen() {
  const appearance = useAppearance();
  const { colors } = appearance;

  return <ScrollView style={{ backgroundColor: colors.background }}
    contentContainerStyle={[layout.screenContent, { flexGrow: 1, paddingBottom: spacing.xl }]}>
    <StatusBar barStyle={appearance.isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

    <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Text accessibilityRole="header" style={[typography.hero, { color: colors.text, flex: 1, minWidth: 0 }]}>Life<Text style={{ color: colors.primary }}>Pilot</Text></Text>
        <IconButton accessibilityLabel="Settings and appearance" onPress={() => router.push('/settings')}
          icon={<SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
            size={iconSizes.navigation} tintColor={colors.primary} />} />
      </View>
      <Text style={[typography.body, { color: colors.muted, maxWidth: 520 }]}>Your vehicles, finances and daily plans in one calm workspace.</Text>
      <View style={{ width: 40, height: 3, borderRadius: radii.pill, backgroundColor: colors.primary }} />
      <Text style={[typography.caption, { color: colors.muted, letterSpacing: 1.2 }]}>DRIVE SMART  •  SPEND WISE  •  LIVE BETTER</Text>
    </View>

    <Section title="Overview" subtitle="Choose what you want to manage.">
      <View style={{ gap: spacing.md }}>
        <ModuleCard title="Vehicle Reminders" description="Insurance, PUC and service due dates."
          icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }} onPress={() => router.push('/reminders')} />
        <ModuleCard title="Vehicle Manager" description="Vehicle details, photos, service and documents."
          icon={{ ios: 'car', android: 'directions_car', web: 'directions_car' }} onPress={() => router.push('/vehicle-manager')} />
        <ModuleCard title="Personal Expense Manager" description="Income, expenses, categories and transaction history."
          icon={{ ios: 'wallet.pass', android: 'account_balance_wallet', web: 'account_balance_wallet' }} onPress={() => router.push('/personal')} />
        <ModuleCard title="Tasks / To-Do" description="Plan your day, track tasks and use local reminders."
          icon={{ ios: 'checklist', android: 'checklist', web: 'checklist' }} onPress={() => router.push('/tasks')} />
      </View>
    </Section>
  </ScrollView>;
}
