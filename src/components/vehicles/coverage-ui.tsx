import { useThemedStyles, useThemeColor } from '@/features/appearance/appearance-provider';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ServiceAction, serviceStyles as styles } from './service-ui';
import { coverageDate, coverageStatus, type CoverageStatus } from '@/features/vehicles/coverage-status';
import type { CoverageRecord } from '@/features/vehicles/coverage-record';

export { ServiceAction as CoverageAction, serviceStyles as coverageStyles } from './service-ui';
const statusColors: Record<CoverageStatus, string> = {
  Valid: '#5BE49B', 'Expiring soon': '#F5C76B', Expired: '#FF9A9A', 'Not added': '#9BA8A1', 'Not started': '#9BA8A1',
};
export function CoverageStatusBadge({ record, today }: { record: CoverageRecord | null; today: string }) {
  const themedColor = useThemeColor();
  const themed_styles = useThemedStyles(styles);
  const status = coverageStatus(record?.expiryDate, record?.startDate, today);
  return <View style={{ gap: 8 }}>
    <Text style={[themed_styles.accent, { color: themedColor(statusColors[status]) }]}>{status}</Text>
    {record && status !== 'Not added' && <Text style={themed_styles.body}>{status === 'Not started' ? `Starts ${coverageDate(record.startDate)} · ` : ''}
      {status === 'Expired' ? 'Expired on' : 'Valid until'} {coverageDate(record.expiryDate)}</Text>}
  </View>;
}
export function CoverageDocumentImage({ uri, full = false }: { uri: string | null; full?: boolean }) {
  const themed_styles = useThemedStyles(styles);
  const [failed, setFailed] = useState(false);
  return uri && !failed ? <Image source={{ uri }} contentFit="contain" style={full ? { flex: 1 } : themed_styles.thumbnail}
    accessibilityLabel="Attached document photo" onError={() => setFailed(true)} />
    : <View style={themed_styles.card}><Text style={themed_styles.body}>Document image unavailable</Text></View>;
}
export function CoverageDocumentViewer({ uri, close }: { uri: string | null; close: () => void }) {
  const themed_styles = useThemedStyles(styles);
  return <Modal visible={uri != null} onRequestClose={close} animationType="fade">
    <SafeAreaView style={themed_styles.viewer}>
      <ServiceAction label="Close document" onPress={close} />
      {uri && <CoverageDocumentImage key={uri} uri={uri} full />}
    </SafeAreaView>
  </Modal>;
}
