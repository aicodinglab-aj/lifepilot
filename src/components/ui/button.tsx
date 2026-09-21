import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { controlSizes, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary';
export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false, icon, style }: {
  label: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean; loading?: boolean; icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppearance();
  const unavailable = disabled || loading;
  const backgroundColor = variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.surface : 'transparent';
  const foreground = variant === 'primary' ? colors.onPrimary : colors.primary;
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: unavailable, busy: loading }} disabled={unavailable} onPress={onPress}
    style={({ pressed }) => [{ minHeight: controlSizes.button, borderRadius: radii.md, paddingHorizontal: spacing.base,
      paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: unavailable ? colors.disabledSurface : backgroundColor,
      borderWidth: variant === 'secondary' ? 1 : 0, borderColor: colors.controlBorder,
      opacity: pressed ? 0.76 : 1 }, style]}>
    {loading ? <ActivityIndicator color={unavailable ? colors.disabledText : foreground} /> : icon}
    <Text style={[typography.label, { color: unavailable ? colors.disabledText : foreground }]}>{label}</Text>
  </Pressable>;
}

export function IconButton({ accessibilityLabel, onPress, icon, disabled = false, style }: {
  accessibilityLabel: string; onPress: () => void; icon: ReactNode; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppearance();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} hitSlop={4} style={({ pressed }) => [{ minWidth: controlSizes.minimumTouch,
      minHeight: controlSizes.minimumTouch, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center',
      backgroundColor: pressed ? colors.surfaceSecondary : 'transparent', opacity: disabled ? 0.45 : 1 }, style]}>{icon}</Pressable>;
}
