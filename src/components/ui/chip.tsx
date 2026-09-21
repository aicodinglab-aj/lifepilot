import { Pressable, Text } from 'react-native';
import { controlSizes, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';

export function Chip({ label, selected, onPress, disabled = false }: {
  label: string; selected: boolean; onPress: () => void; disabled?: boolean;
}) {
  const { colors } = useAppearance();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: controlSizes.minimumTouch,
      borderRadius: radii.pill, paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
      justifyContent: 'center', borderWidth: selected ? 0 : 1, borderColor: colors.controlBorder,
      backgroundColor: disabled ? colors.disabledSurface : selected ? colors.primary : colors.surface,
      opacity: pressed ? 0.72 : 1 })}>
    <Text style={[typography.label, { color: disabled ? colors.disabledText : selected ? colors.onPrimary : colors.text }]}>{label}</Text>
  </Pressable>;
}
