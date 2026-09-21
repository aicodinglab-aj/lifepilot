import { useAppearance } from '@/features/appearance/appearance-provider';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormTextField } from '@/components/forms/form-text-field';
import { OptionSelector } from '@/components/forms/option-selector';
import { Button } from '@/components/ui/button';
import { StandardCard } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Section } from '@/components/ui/section';
import { layout, spacing, typography } from '@/constants/design-system';
import { DuplicateRegistrationError } from '@/database/vehicles';
import { SelectedPhotos } from '@/components/vehicles/selected-photos';
import { createVehicleWithPhotos } from '@/features/vehicles/create-vehicle';
import { pickVehiclePhotos, type SelectedVehiclePhoto } from '@/features/vehicles/photo-service';
import {
  fuelTypes,
  initialVehicleForm,
  type VehicleForm,
  type VehicleFormErrors,
  validateVehicleForm,
  vehicleFormToNewVehicle,
  vehicleTypes,
} from '@/features/vehicles/vehicle';

export default function AddVehicleScreen() {
  const appearance = useAppearance();
  const db = useSQLiteContext();
  const [form, setForm] = useState<VehicleForm>(initialVehicleForm);
  const [errors, setErrors] = useState<VehicleFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [photos, setPhotos] = useState<SelectedVehiclePhoto[]>([]);
  const [coverId, setCoverId] = useState<string>();
  const working = useRef(false);
  const created = useRef(false);

  async function selectPhotos(camera: boolean) {
    if (working.current || created.current) return;
    working.current = true;
    setIsPicking(true);
    Keyboard.dismiss();
    try {
      const selected = await pickVehiclePhotos(camera);
      setPhotos((current) => [...current, ...selected]);
      setCoverId((current) => current ?? selected[0]?.id);
    } catch (error) {
      Alert.alert('Could not select photos', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      working.current = false;
      setIsPicking(false);
    }
  }

  function removePhoto(id: string) {
    if (working.current || created.current) return;
    const remaining = photos.filter((photo) => photo.id !== id);
    setPhotos(remaining);
    if (coverId === id) setCoverId(remaining[0]?.id);
  }

  function updateField<Field extends keyof VehicleForm>(field: Field, value: VehicleForm[Field]) {
    setForm((current) => ({ ...current, [field]: value }));
    setSubmitError(null);
    setErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  async function handleSubmit() {
    if (working.current || created.current) return;
    const validationErrors = validateVehicleForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) return;

    working.current = true;
    setIsSaving(true);
    Keyboard.dismiss();
    setSubmitError(null);

    try {
      const result = await createVehicleWithPhotos(db, vehicleFormToNewVehicle(form), photos, coverId);
      created.current = true;
      if (result.photoError) {
        Alert.alert('Vehicle saved — photos need attention',
          `Your vehicle is safely saved. ${result.photoError} You can add any missing photos from its gallery.`);
        router.replace({ pathname: '/vehicle/[id]', params: { id: String(result.vehicleId) } });
      } else {
        Alert.alert('Vehicle saved', 'Your vehicle and selected photos were added to My Garage.');
        router.back();
      }
    } catch (error) {
      if (error instanceof DuplicateRegistrationError) {
        setErrors((current) => ({ ...current, registrationNumber: error.message }));
        setSubmitError(error.message);
      } else {
        setSubmitError('The vehicle could not be saved. Please try again.');
      }
    } finally {
      working.current = false;
      if (!created.current) setIsSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: appearance.colors.background }}>
      <ScreenHeader title="Add Vehicle" fallbackHref="/vehicle-manager" />
      <StatusBar barStyle={appearance.isDark ? 'light-content' : 'dark-content'} backgroundColor={appearance.colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={layout.screenContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.label, { color: appearance.colors.primary, letterSpacing: 1.2 }]}>MY GARAGE</Text>
            <Text accessibilityRole="header" style={[typography.screenTitle, { color: appearance.colors.text }]}>Add Vehicle</Text>
            <Text style={[typography.body, { color: appearance.colors.muted }]}>
              Enter the basics now. You can add expenses and service details later.
            </Text>
          </View>

          <StandardCard><Section title="Vehicle information" subtitle="Required details used throughout your garage.">
            <OptionSelector
              error={errors.vehicleType}
              label="Vehicle type"
              onChange={(value) => updateField('vehicleType', value)}
              options={vehicleTypes}
              value={form.vehicleType}
            />
            <FormTextField
              autoCapitalize="characters"
              error={errors.registrationNumber}
              label="Registration number"
              onChangeText={(value) => updateField('registrationNumber', value)}
              placeholder="KA 01 AB 1234"
              value={form.registrationNumber}
            />
            <FormTextField
              autoCapitalize="words"
              error={errors.make}
              label="Make"
              onChangeText={(value) => updateField('make', value)}
              placeholder="Honda"
              value={form.make}
            />
            <FormTextField
              autoCapitalize="words"
              error={errors.model}
              label="Model"
              onChangeText={(value) => updateField('model', value)}
              placeholder="City"
              value={form.model}
            />
            <FormTextField
              autoCapitalize="words"
              label="Variant"
              onChangeText={(value) => updateField('variant', value)}
              optional
              placeholder="ZX CVT"
              value={form.variant}
            />
            <FormTextField
              error={errors.modelYear}
              keyboardType="number-pad"
              label="Model year"
              maxLength={4}
              onChangeText={(value) => updateField('modelYear', value)}
              placeholder="2024"
              value={form.modelYear}
            />
            <OptionSelector
              error={errors.fuelType}
              label="Fuel type"
              onChange={(value) => updateField('fuelType', value)}
              options={fuelTypes}
              value={form.fuelType}
            />
            <FormTextField
              error={errors.odometerKm}
              keyboardType="decimal-pad"
              label="Current odometer (km)"
              onChangeText={(value) => updateField('odometerKm', value)}
              placeholder="12500"
              value={form.odometerKm}
            />
          </Section></StandardCard>

          <SelectedPhotos photos={photos} coverId={coverId} disabled={isSaving || isPicking}
            onPick={(camera) => { void selectPhotos(camera); }} onRemove={removePhoto}
            onCover={(id) => { if (!working.current && !created.current) setCoverId(id); }} />

          {submitError && <Text accessibilityRole="alert" style={[typography.secondaryBody, { color: appearance.colors.danger }]}>{submitError}</Text>}

          <Button label="Save Vehicle" loading={isSaving} disabled={isSaving || isPicking} onPress={() => { void handleSubmit(); }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
