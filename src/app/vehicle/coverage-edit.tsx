import { useThemedStyles } from '@/features/appearance/appearance-provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, Text, View } from 'react-native';
import { FormTextField } from '@/components/forms/form-text-field';
import { OptionSelector } from '@/components/forms/option-selector';
import { VehiclePage } from '@/components/vehicles/vehicle-page';
import { CoverageAction, CoverageDocumentImage, CoverageDocumentViewer, coverageStyles as styles } from '@/components/vehicles/coverage-ui';
import { getCoverageDocuments, getCoverageRecord } from '@/database/vehicle-coverage';
import { coverageFields, coverageToForm, emptyCoverageForm, parseCoverageKind, policyTypes, validateCoverageForm,
  type CoverageDocument, type CoverageErrors, type CoverageRecord } from '@/features/vehicles/coverage-record';
import { saveCoverage } from '@/features/vehicles/coverage-service';
import { pickVehiclePhotos, type SelectedVehiclePhoto } from '@/features/vehicles/photo-service';
import { useVehicle } from '@/features/vehicles/use-vehicle';
import { availableCoverageDocumentUri } from '@/storage/coverage-documents';

export default function CoverageEditScreen() {
  const { kind: routeKind, recordId, id } = useLocalSearchParams<{ kind: string; recordId?: string; id: string }>();
  return <CoverageEditor key={`${id}/${routeKind}/${recordId ?? 'new'}`} routeKind={routeKind} recordId={recordId} />;
}

function CoverageEditor({ routeKind, recordId }: { routeKind: string; recordId?: string }) {
  const themed_styles = useThemedStyles(styles);
  const state = useVehicle();
  const db = useSQLiteContext();
  const [form, setForm] = useState({ ...emptyCoverageForm });
  const [record, setRecord] = useState<CoverageRecord | null>(null);
  const [documents, setDocuments] = useState<CoverageDocument[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [photos, setPhotos] = useState<SelectedVehiclePhoto[]>([]);
  const [errors, setErrors] = useState<CoverageErrors>({});
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [viewing, setViewing] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const working = useRef(false), focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  // Load once per editor, not whenever a picker or another screen returns focus.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const kind = parseCoverageKind(routeKind);
        if (recordId !== undefined && typeof recordId !== 'string') throw new Error('Invalid record link.');
        const found = recordId !== undefined ? await getCoverageRecord(db, kind, state.vehicleId, recordId) : null;
        if (recordId !== undefined && !found) throw new Error('This record no longer exists.');
        const saved = found ? await getCoverageDocuments(db, kind, state.vehicleId, found.id) : [];
        if (active) {
          setRecord(found); setForm(found ? coverageToForm(found) : { ...emptyCoverageForm }); setDocuments(saved);
          setRemoved([]); setPhotos([]); setError(null); setErrors({});
        }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load record.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [db, routeKind, recordId, state.vehicleId, retry]);
  async function pick(camera: boolean) {
    if (working.current) return;
    working.current = true; setBusy(true);
    try { const selected = await pickVehiclePhotos(camera); setPhotos((current) => [...current, ...selected]); }
    catch (cause) { if (focused.current) Alert.alert('Could not select documents', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function save() {
    if (working.current || loading || error) return;
    const kind = parseCoverageKind(routeKind);
    const validation = validateCoverageForm(kind, form); setErrors(validation);
    if (Object.keys(validation).length) { Alert.alert('Check details', 'Please correct the highlighted fields.'); return; }
    if (recordId !== undefined && !record) return;
    working.current = true; setBusy(true);
    try {
      const result = await saveCoverage(db, kind, state.vehicleId, form, photos, record ? { id: record.id, revision: record.revision, removedDocumentIds: removed } : undefined);
      if (focused.current) {
        if (result.cleanupPending) Alert.alert('Saved', 'Document file cleanup is pending. Retry from Insurance & PUC or My Garage.');
        const params = { id: String(state.vehicleId), kind, recordId: result.id };
        if (record) router.dismissTo({ pathname: '/vehicle/coverage-details', params });
        else router.replace({ pathname: '/vehicle/coverage-details', params });
      }
    } catch (cause) { if (focused.current) Alert.alert('Changes not saved', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  const title = routeKind === 'insurance' ? 'Insurance' : 'PUC';
  if (loading || state.loading || error || state.error) return <VehiclePage title={`${recordId !== undefined ? 'Edit' : 'Add'} ${title}`}
    loading={loading || state.loading} error={error || state.error} reload={() => { setLoading(true); state.reload(); setRetry((n) => n + 1); }} />;
  const kind = parseCoverageKind(routeKind);
  return <VehiclePage title={`${record ? 'Edit' : 'Add'} ${title}`}>
    <Text style={themed_styles.eyebrow}>{state.vehicle?.registrationNumber}</Text>
    <Text style={themed_styles.title}>{record ? 'Edit' : 'Add'} {title}</Text>
    {coverageFields(kind).map((field) => <View key={field.key} style={themed_styles.section}>
      {field.key === 'policyType' && <View pointerEvents={busy ? 'none' : 'auto'}>
        <OptionSelector label="Common policy types" options={policyTypes} value={form.policyType}
          onChange={(value) => { if (!busy) setForm((current) => ({ ...current, policyType: value })); }} />
      </View>}
      <FormTextField label={`${field.label}${field.required ? ' *' : ''}`} optional={!field.required}
        value={form[field.key]} onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
        placeholder={field.date ? 'YYYY-MM-DD' : field.key === 'policyType' ? 'Choose above or enter another type' : undefined}
        keyboardType={field.numeric ? 'decimal-pad' : 'default'} multiline={field.multiline} editable={!busy} error={errors[field.key]} />
    </View>)}
    <Text style={themed_styles.sectionTitle}>{kind === 'insurance' ? 'Policy Document Photos' : 'PUC Certificate Photos'}</Text>
    <Text style={themed_styles.body}>Attach photos of your documents. Attachment changes apply when you save.</Text>
    <CoverageAction label="Select from gallery" disabled={busy} onPress={() => { void pick(false); }} />
    <CoverageAction label="Take photo" disabled={busy} onPress={() => { void pick(true); }} />
    {documents.map((doc, index) => {
      const uri = availableCoverageDocumentUri(kind, doc), marked = removed.includes(doc.id);
      return <View key={doc.id} style={themed_styles.card}>
        <Text style={themed_styles.body}>Saved document {index + 1}{marked ? ' · Will be removed on save' : ''}</Text>
        {!marked && <Pressable accessibilityRole="button" accessibilityLabel={`Preview saved document ${index + 1}`} disabled={!uri} onPress={() => setViewing(uri)}>
          <CoverageDocumentImage uri={uri} /></Pressable>}
        <CoverageAction label={marked ? 'Keep document' : 'Remove document on save'} disabled={busy}
          onPress={() => setRemoved((current) => marked ? current.filter((id) => id !== doc.id) : [...current, doc.id])} />
      </View>;
    })}
    {photos.map((photo, index) => <View key={photo.id} style={themed_styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Preview new document ${index + 1}`} onPress={() => setViewing(photo.uri)}>
        <CoverageDocumentImage uri={photo.uri} /></Pressable>
      <CoverageAction label={`Remove selected photo ${index + 1}`} disabled={busy} onPress={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))} />
    </View>)}
    <CoverageAction label={busy ? 'Please wait…' : `Save ${title}`} disabled={busy} onPress={() => { void save(); }} />
    <CoverageDocumentViewer uri={viewing} close={() => setViewing(null)} />
  </VehiclePage>;
}
