import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { Button } from './button';

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode; title: string; description: string; action?: { label: string; icon?: ReactNode; onPress: () => void };
}) {
  const { colors } = useAppearance();
  return <View style={{ alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl, gap: spacing.md }}>
    {icon}
    <Text accessibilityRole="header" style={[typography.sectionHeading, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
    <Text style={[typography.body, { color: colors.muted, textAlign: 'center' }]}>{description}</Text>
    {action && <Button label={action.label} icon={action.icon} onPress={action.onPress} style={{ marginTop: spacing.xs }} />}
  </View>;
}
