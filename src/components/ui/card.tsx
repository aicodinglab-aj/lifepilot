import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { iconSizes, layout, spacing } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';

type CardProps = { children: ReactNode; style?: StyleProp<ViewStyle> };

export function StandardCard({ children, style }: CardProps) {
  const { colors } = useAppearance();
  return <View style={[layout.card, { backgroundColor: colors.surface, borderColor: colors.divider, borderWidth: 1 }, style]}>{children}</View>;
}

export function InteractiveCard({ children, accessibilityLabel, onPress, leading, trailing, disabled = false, style }: CardProps & {
  accessibilityLabel: string; onPress: () => void; leading?: ReactNode; trailing?: ReactNode; disabled?: boolean;
}) {
  const { colors } = useAppearance();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [layout.card, {
      minHeight: 64, backgroundColor: colors.surface, borderColor: colors.divider, borderWidth: 1,
      flexDirection: 'row', alignItems: 'center', opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
    }, style]}>
    {leading && <View style={{ marginRight: spacing.md }}>{leading}</View>}
    <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    <View style={{ marginLeft: spacing.md }}>{trailing ?? <Text accessible={false} style={{ color: colors.primary, fontSize: iconSizes.action + 4 }}>›</Text>}</View>
  </Pressable>;
}

export function StatusCard({ children, tone = 'neutral', style }: CardProps & { tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const { colors } = useAppearance();
  const accent = tone === 'neutral' ? colors.muted : colors[tone];
  return <View style={[layout.card, { backgroundColor: colors.surfaceSecondary, borderLeftColor: accent, borderLeftWidth: 3 }, style]}>{children}</View>;
}
