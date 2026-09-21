import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { FormTextField } from '@/components/forms/form-text-field';
import { OptionSelector } from '@/components/forms/option-selector';
import { Button } from '@/components/ui/button';
import { StandardCard } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { layout, spacing, typography } from '@/constants/design-system';
import { DuplicateRegistrationError } from '@/database/vehicles';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { saveVehicleDetails } from '@/features/vehicles/details-service';
import { fuelTypes, type Vehicle } from '@/features/vehicles/vehicle';
import { validateVehicleDetails, vehicleDetailSections, vehicleToDetailsForm, type VehicleDetailsErrors, type VehicleDetailsForm } from '@/features/vehicles/vehicle-details';

export function VehicleDetailsEditor({ vehicle }: { vehicle: Vehicle }) {
  const { colors } = useAppearance();
  const db = useSQLiteContext();
  const [form, setForm] = useState(() => vehicleToDetailsForm(vehicle));
  const [errors, setErrors] = useState<VehicleDetailsErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const working = useRef(false);
  const scroll = useRef<ScrollView>(null);
  function update(key: keyof VehicleDetailsForm, value: string) {
    if (working.current) return;
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError(null);
  }
  async function save() {
    if (working.current) return;
    const validation = validateVehicleDetails(form);
    setErrors(validation);
    if (Object.keys(validation).length) {
      setSubmitError(Object.values(validation).filter(Boolean).join('\n'));
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    working.current = true;
    setSaving(true);
    Keyboard.dismiss();
    try {
      await saveVehicleDetails(db, vehicle.id, form);
      router.dismissTo({ pathname: '/vehicle/details', params: { id: String(vehicle.id) } });
    } catch (error) {
      if (error instanceof DuplicateRegistrationError) setErrors({ registrationNumber: error.message });
      setSubmitError(error instanceof Error ? error.message : 'Could not save vehicle details. Please try again.');
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally { working.current = false; setSaving(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
    <ScrollView ref={scroll} contentContainerStyle={layout.screenContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={[typography.secondaryBody, { color: colors.muted }]}>Keep your vehicle information up to date. Optional fields can be left empty.</Text>
      {submitError && <Text accessibilityRole="alert" style={[typography.secondaryBody, { color: colors.danger }]}>{submitError}</Text>}
      {vehicleDetailSections.map((section) => <StandardCard key={section.title}>
        <Section title={section.title}>
          {section.fields.map(({ key, label, optional, numeric, date }) => key === 'vehicleType'
            ? <View key={key} style={{ gap: spacing.xs }}>
              <Text style={[typography.label, { color: colors.text }]}>{label}</Text>
              <Text style={[typography.body, { color: colors.muted }]}>{vehicle.vehicleType}</Text>
            </View>
            : key === 'fuelType' ? <OptionSelector key={key} label={label} options={fuelTypes} value={form.fuelType}
              onChange={(value) => update('fuelType', value)} error={errors.fuelType} />
              : <FormTextField key={key} label={label} optional={optional} value={form[key]} error={errors[key]}
                editable={!saving} onChangeText={(value) => update(key, value)} multiline={key === 'notes'}
                keyboardType={numeric ? key === 'modelYear' ? 'number-pad' : 'decimal-pad' : 'default'}
                maxLength={key === 'modelYear' ? 4 : undefined} placeholder={date ? 'YYYY-MM-DD' : undefined}
                autoCapitalize={key === 'registrationNumber' || key === 'chassisNumber' || key === 'engineNumber' ? 'characters' : 'sentences'} />)}
        </Section>
      </StandardCard>)}
      <Button label="Save changes" loading={saving} disabled={saving} onPress={() => { void save(); }} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
