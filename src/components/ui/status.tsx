import { Text, View } from 'react-native';
import { radii, spacing, typography } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  const { colors } = useAppearance();
  const color = tone === 'neutral' ? colors.muted : colors[tone];
  return <View accessibilityLabel={`${label}, ${tone}`} style={{ alignSelf: 'flex-start', borderRadius: radii.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.surfaceSecondary }}>
    <Text style={[typography.caption, { color, fontWeight: '700' }]}>{label}</Text>
  </View>;
}
