import { useThemedStyles } from '@/features/appearance/appearance-provider';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lifePilotColors as colors } from '@/constants/lifepilot-theme';

type OptionSelectorProps = {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
};

export function OptionSelector({ error, label, onChange, options, value }: OptionSelectorProps) {
  const themed_styles = useThemedStyles(styles);
  return (
    <View style={themed_styles.field}>
      <Text style={themed_styles.label}>{label}</Text>
      <View accessibilityRole="radiogroup" style={themed_styles.options}>
        {options.map((option) => {
          const selected = option === value;

          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => onChange(option)}
              style={({ pressed }) => [
                themed_styles.option,
                selected && themed_styles.optionSelected,
                pressed && themed_styles.optionPressed,
              ]}>
              <Text style={[themed_styles.optionText, selected && themed_styles.optionTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={themed_styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 10 },
  label: { color: colors.white, fontSize: 14, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  optionSelected: { borderColor: colors.green, backgroundColor: '#193D2C' },
  optionPressed: { opacity: 0.8 },
  optionText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  optionTextSelected: { color: colors.green },
  error: { color: '#FF9A9A', fontSize: 12 },
});
