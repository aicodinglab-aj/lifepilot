import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { lifePilotColors as colors } from '@/constants/lifepilot-theme';

type FormTextFieldProps = Pick<
  TextInputProps,
  'autoCapitalize' | 'keyboardType' | 'maxLength' | 'onChangeText' | 'placeholder' | 'value' | 'multiline' | 'editable'
> & {
  error?: string;
  label: string;
  optional?: boolean;
};

export function FormTextField({ error, label, optional, ...inputProps }: FormTextFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional && <Text style={styles.optional}> (optional)</Text>}
      </Text>
      <TextInput
        accessibilityLabel={label}
        {...inputProps}
        placeholderTextColor={colors.muted}
        style={[styles.input, inputProps.multiline && { minHeight: 120, textAlignVertical: 'top', paddingTop: 14 }, error && styles.inputError]}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: colors.white, fontSize: 14, fontWeight: '700' },
  optional: { color: colors.muted, fontWeight: '400' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.card,
    color: colors.white,
    fontSize: 16,
    paddingHorizontal: 16,
  },
  inputError: { borderColor: '#FF7A7A' },
  error: { color: '#FF9A9A', fontSize: 12 },
});
