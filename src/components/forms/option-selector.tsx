import { View } from 'react-native';
import { Chip } from '@/components/ui/chip';
import { FieldLabel, FieldMessage } from '@/components/ui/form-controls';
import { spacing } from '@/constants/design-system';

type OptionSelectorProps = {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
};

export function OptionSelector({ error, label, onChange, options, value }: OptionSelectorProps) {
  return <View style={{ gap: spacing.sm }}>
    <FieldLabel>{label}</FieldLabel>
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((option) => <Chip key={option} label={option} selected={option === value} onPress={() => onChange(option)} />)}
    </View>
    {error && <FieldMessage error>{error}</FieldMessage>}
  </View>;
}
