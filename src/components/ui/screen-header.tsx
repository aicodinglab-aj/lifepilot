import type { ReactNode } from 'react';
import { router, Stack, type Href } from 'expo-router';
import { Text } from 'react-native';
import { iconSizes } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { IconButton } from './button';

export function ScreenHeader({ title, fallbackHref = '/', rightAction }: {
  title: string; fallbackHref?: Href; rightAction?: { accessibilityLabel: string; icon: ReactNode; onPress: () => void };
}) {
  const { colors } = useAppearance();
  return <Stack.Screen options={{ title, headerBackVisible: false,
    headerLeft: () => <IconButton accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace(fallbackHref)}
      icon={<Text accessible={false} style={{ color: colors.primary, fontSize: iconSizes.navigation + 3 }}>←</Text>} />,
    headerRight: () => rightAction ? <IconButton accessibilityLabel={rightAction.accessibilityLabel}
      onPress={rightAction.onPress} icon={rightAction.icon} /> : null,
  }} />;
}
