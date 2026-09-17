/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useAppearance } from '@/features/appearance/appearance-provider';

export function useTheme() {
  const { colors } = useAppearance();
  return { text: colors.white, background: colors.background, backgroundElement: colors.card,
    backgroundSelected: colors.border, textSecondary: colors.muted };
}
