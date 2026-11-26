import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { FormInput } from '@/components/ui/form-controls';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { formatDate, isIsoDate, parseFormattedDate } from '@/features/dates/date-format';

type DateInputProps = Omit<ComponentProps<typeof FormInput>, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (value: string) => void;
};

export function DateInput({ value, onChangeText, placeholder, maxLength, ...props }: DateInputProps) {
  const { dateFormat } = useAppearance();
  const [text, setText] = useState(() => isIsoDate(value) ? formatDate(value, dateFormat) : value);
  const localEdit = useRef(false), lastFormat = useRef(dateFormat);

  useEffect(() => {
    const formatChanged = lastFormat.current !== dateFormat;
    if (formatChanged || !localEdit.current) setText(isIsoDate(value) ? formatDate(value, dateFormat) : value);
    localEdit.current = false;
    lastFormat.current = dateFormat;
  }, [value, dateFormat]);

  return <FormInput {...props} value={text} placeholder={placeholder ?? dateFormat} maxLength={maxLength ?? 10}
    onChangeText={(next) => {
      const internalValue = parseFormattedDate(next, dateFormat) ?? next;
      localEdit.current = true;
      setText(next);
      if (internalValue === value) localEdit.current = false;
      onChangeText(internalValue);
    }} />;
}
