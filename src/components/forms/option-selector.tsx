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
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {options.map((option) => {
          const selected = option === value;

          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => onChange(option)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 10 },
  label: { color: colors.white, fontSize: 14, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: {
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
