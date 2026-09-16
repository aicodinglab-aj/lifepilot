import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, Text, View } from 'react-native';
import { FormTextField } from '@/components/forms/form-text-field';
import { VehiclePage } from '@/components/vehicles/vehicle-page';
import { BillImage, BillViewer, ServiceAction, serviceStyles as styles } from '@/components/vehicles/service-ui';
import { pickVehiclePhotos, type SelectedVehiclePhoto } from '@/features/vehicles/photo-service';
import { createService } from '@/features/vehicles/service-maintenance';
import { calculateServiceTotal, emptyServiceForm, serviceFields, serviceMoney, validateServiceForm, type ServiceErrors } from '@/features/vehicles/service-record';
import { useVehicle } from '@/features/vehicles/use-vehicle';

export default function AddServiceScreen() {
  const state = useVehicle();
  const db = useSQLiteContext();
  const [form, setForm] = useState({ ...emptyServiceForm });
  const [errors, setErrors] = useState<ServiceErrors>({});
  const [photos, setPhotos] = useState<SelectedVehiclePhoto[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  async function pick(camera: boolean) {
    if (working.current) return;
    working.current = true; setBusy(true);
    try { const selected = await pickVehiclePhotos(camera); setPhotos((current) => [...current, ...selected]); }
    catch (cause) { Alert.alert('Could not select bills', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function save() {
    if (working.current) return;
    const validation = validateServiceForm(form); setErrors(validation);
    if (Object.keys(validation).length) { Alert.alert('Check service details', 'Please correct the highlighted fields.'); return; }
    working.current = true; setBusy(true);
    try {
      await createService(db, state.vehicleId, form, photos);
      if (focused.current) router.dismissTo({ pathname: '/vehicle/services', params: { id: String(state.vehicleId) } });
    } catch (cause) { if (focused.current) Alert.alert('Service not saved', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  const validation = validateServiceForm(form);
  const invalidCost = validation.partsCost || validation.labourCost || validation.otherCost;
  const total = invalidCost ? null : calculateServiceTotal({ partsCost: form.partsCost.trim() ? Number(form.partsCost) : null,
    labourCost: form.labourCost.trim() ? Number(form.labourCost) : null, otherCost: form.otherCost.trim() ? Number(form.otherCost) : null });
  return <VehiclePage title="Add Service" {...state}>
    {state.vehicle && <>
      <Text style={styles.eyebrow}>{state.vehicle.registrationNumber}</Text>
      <Text style={styles.title}>Add Service</Text>
      {serviceFields.map((field) => <View key={field.key} style={styles.section}>
        <FormTextField label={`${field.label}${field.required ? ' *' : ''}`} optional={!field.required}
          value={form[field.key]} onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
          placeholder={field.date ? 'YYYY-MM-DD' : undefined} keyboardType={field.numeric ? 'decimal-pad' : 'default'}
          multiline={field.multiline} editable={!busy} error={errors[field.key]} />
        {field.key === 'otherCost' && <View style={styles.card}><Text style={styles.body}>Total Cost</Text>
          <Text style={styles.sectionTitle}>{invalidCost ? 'Check cost fields' : serviceMoney(total)}</Text>
          <Text style={styles.body}>Parts + labour + other. Blank cost fields are not added.</Text></View>}
      </View>)}
      <View style={styles.section}><Text style={styles.sectionTitle}>Bill / Receipt Photos</Text>
        <ServiceAction label="Select from gallery" disabled={busy} onPress={() => { void pick(false); }} />
        <ServiceAction label="Take a photo" disabled={busy} onPress={() => { void pick(true); }} />
        {photos.map((photo, index) => <View key={photo.id} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Preview bill ${index + 1}`} onPress={() => setViewing(photo.uri)}>
            <BillImage uri={photo.uri} /></Pressable>
          <ServiceAction label={`Remove bill ${index + 1}`} disabled={busy} onPress={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))} />
        </View>)}
      </View>
      <ServiceAction label={busy ? 'Please wait…' : 'Save Service'} disabled={busy} onPress={() => { void save(); }} />
      <BillViewer uri={viewing} close={() => setViewing(null)} />
    </>}
  </VehiclePage>;
}
