import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FormTextField } from '@/components/forms/form-text-field';
import { OptionSelector } from '@/components/forms/option-selector';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { DuplicateRegistrationError } from '@/database/vehicles';
import { saveVehicleDetails } from '@/features/vehicles/details-service';
import { fuelTypes, type Vehicle } from '@/features/vehicles/vehicle';
import { validateVehicleDetails, vehicleDetailSections, vehicleToDetailsForm, type VehicleDetailsErrors, type VehicleDetailsForm } from '@/features/vehicles/vehicle-details';

export function VehicleDetailsEditor({ vehicle }: { vehicle: Vehicle }) {
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
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={styles.intro}>Keep your vehicle information up to date. Optional fields can be left empty.</Text>
      {submitError && <Text accessibilityRole="alert" style={styles.error}>{submitError}</Text>}
      {vehicleDetailSections.map((section) => <View key={section.title} style={styles.section}>
        <Text style={styles.title}>{section.title}</Text>
        {section.fields.map(({ key, label, optional, numeric, date }) => key === 'vehicleType'
          ? <View key={key}><Text style={styles.intro}>{label}</Text><Text style={styles.readOnly}>{vehicle.vehicleType}</Text></View>
          : key === 'fuelType' ? <OptionSelector key={key} label={label} options={fuelTypes} value={form.fuelType}
            onChange={(value) => update('fuelType', value)} error={errors.fuelType} />
            : <FormTextField key={key} label={label} optional={optional} value={form[key]} error={errors[key]}
              editable={!saving} onChangeText={(value) => update(key, value)} multiline={key === 'notes'}
              keyboardType={numeric ? key === 'modelYear' ? 'number-pad' : 'decimal-pad' : 'default'}
              maxLength={key === 'modelYear' ? 4 : undefined} placeholder={date ? 'YYYY-MM-DD' : undefined}
              autoCapitalize={key === 'registrationNumber' || key === 'chassisNumber' || key === 'engineNumber' ? 'characters' : 'sentences'} />)}
      </View>)}
      <Pressable accessibilityRole="button" accessibilityLabel="Save vehicle details" accessibilityState={{ disabled: saving }}
        disabled={saving} onPress={() => { void save(); }} style={({ pressed }) => [styles.save, (saving || pressed) && { opacity: 0.6 }]}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text>
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 48, gap: 28 }, section: { gap: 20 },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 22 }, title: { color: colors.white, fontSize: 20, fontWeight: '700' },
  readOnly: { color: colors.white, fontSize: 16, paddingTop: 6 }, error: { color: '#FF9A9A', lineHeight: 23 },
  save: { minHeight: 52, padding: 15, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.green, borderRadius: 16 },
  saveText: { color: colors.background, fontSize: 16, fontWeight: '800' },
});
