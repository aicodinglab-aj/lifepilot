import type { TextInputProps } from 'react-native';
import { FormInput } from '@/components/ui/form-controls';

type FormTextFieldProps = Pick<TextInputProps,
  'autoCapitalize' | 'keyboardType' | 'maxLength' | 'onChangeText' | 'placeholder' | 'value' | 'multiline' | 'editable'> & {
  error?: string;
  label: string;
  optional?: boolean;
};

export function FormTextField(props: FormTextFieldProps) {
  return <FormInput {...props} />;
}
