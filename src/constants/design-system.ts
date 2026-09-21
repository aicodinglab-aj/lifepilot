import type { TextStyle, ViewStyle } from 'react-native';

export const spacing = Object.freeze({ xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32 });
export const radii = Object.freeze({ sm: 10, md: 14, lg: 18, pill: 999 });
export const controlSizes = Object.freeze({ minimumTouch: 44, button: 48, input: 52 });
export const iconSizes = Object.freeze({ navigation: 24, action: 20, card: 28, status: 18 });

export const typography = Object.freeze({
  hero: { fontSize: 36, lineHeight: 43, fontWeight: '800', letterSpacing: -0.8 },
  screenTitle: { fontSize: 27, lineHeight: 34, fontWeight: '800', letterSpacing: -0.4 },
  sectionHeading: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  cardTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  secondaryBody: { fontSize: 14, lineHeight: 21, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
} satisfies Record<string, TextStyle>);

export const layout = Object.freeze({
  screen: { flex: 1 } satisfies ViewStyle,
  screenContent: { paddingHorizontal: spacing.base, paddingVertical: spacing.lg, gap: spacing.lg } satisfies ViewStyle,
  card: { borderRadius: radii.lg, padding: spacing.base, gap: spacing.md } satisfies ViewStyle,
});
