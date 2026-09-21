import type { ReactNode } from 'react';
import { Pressable, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { controlSizes, radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';

export function FieldLabel({ children, optional = false }: { children: ReactNode; optional?: boolean }) {
  const { colors } = useAppearance();
  return <Text style={[typography.label, { color: colors.text }]}>{children}
    {optional && <Text style={{ color: colors.muted, fontWeight: '400' }}> (optional)</Text>}
  </Text>;
}

export function FieldMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const { colors } = useAppearance();
  return <Text accessibilityRole={error ? 'alert' : undefined} style={[typography.caption, { color: error ? colors.danger : colors.muted }]}>{children}</Text>;
}

export function FormInput({ label, error, helper, optional, multiline, style, ...props }: TextInputProps & {
  label: string; error?: string; helper?: string; optional?: boolean;
}) {
  const { colors, isDark } = useAppearance();
  return <View style={{ gap: spacing.sm }}>
    <FieldLabel optional={optional}>{label}</FieldLabel>
    <TextInput accessibilityLabel={label} {...props} multiline={multiline} keyboardAppearance={isDark ? 'dark' : 'light'}
      selectionColor={colors.primary} placeholderTextColor={colors.muted} style={[typography.body, { minHeight: multiline ? 112 : controlSizes.input,
        borderRadius: radii.md, borderWidth: 1, borderColor: error ? colors.danger : colors.controlBorder,
        backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.base, paddingVertical: spacing.md,
        textAlignVertical: multiline ? 'top' : 'center' }, style]} />
    {(error || helper) && <FieldMessage error={!!error}>{error ?? helper}</FieldMessage>}
  </View>;
}

export function SelectorRow({ label, value, onPress, disabled = false }: {
  label: string; value: string; onPress: () => void; disabled?: boolean;
}) {
  const { colors } = useAppearance();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: controlSizes.input, borderRadius: radii.md,
      borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: disabled ? colors.disabledSurface : colors.surface,
      paddingHorizontal: spacing.base, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      opacity: pressed ? 0.72 : 1 })}>
    <Text style={[typography.body, { color: disabled ? colors.disabledText : colors.text, flex: 1 }]}>{value}</Text>
    <Text accessible={false} style={{ color: colors.primary, fontSize: 20 }}>›</Text>
  </Pressable>;
}

export function ToggleRow({ label, description, value, onValueChange, disabled = false }: {
  label: string; description?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean;
}) {
  const { colors } = useAppearance();
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }}
    disabled={disabled} onPress={() => onValueChange(!value)} style={({ pressed }) => ({ minHeight: 56,
      flexDirection: 'row', alignItems: 'center', gap: spacing.base, opacity: disabled ? 0.5 : pressed ? 0.72 : 1 })}>
    <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
      <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>{label}</Text>
      {description && <Text style={[typography.secondaryBody, { color: colors.muted }]}>{description}</Text>}
    </View>
    <Switch accessible={false} pointerEvents="none" value={value} disabled={disabled}
      trackColor={{ false: colors.controlBorder, true: colors.primary }} thumbColor={value ? colors.onPrimary : colors.surfaceSecondary} />
  </Pressable>;
}
