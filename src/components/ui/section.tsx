import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';

export function Section({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: { label: string; onPress: () => void }; children: ReactNode;
}) {
  const { colors } = useAppearance();
  return <View style={{ gap: spacing.md }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <Text accessibilityRole="header" style={[typography.sectionHeading, { color: colors.text }]}>{title}</Text>
        {subtitle && <Text style={[typography.secondaryBody, { color: colors.muted }]}>{subtitle}</Text>}
      </View>
      {action && <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress}
        style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
        <Text style={[typography.label, { color: colors.primary }]}>{action.label}</Text>
      </Pressable>}
    </View>
    {children}
  </View>;
}
