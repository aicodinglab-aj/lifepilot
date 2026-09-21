import type { ReactNode } from 'react';
import { router, Stack, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';
import { iconSizes } from '@/constants/design-system';
import { useAppearance } from '@/features/appearance/appearance-provider';
import { IconButton } from './button';

export function ScreenHeader({ title, fallbackHref = '/', onBack, rightAction }: {
  title: string; fallbackHref?: Href; onBack?: () => void;
  rightAction?: { accessibilityLabel: string; icon: ReactNode; onPress: () => void };
}) {
  const { colors } = useAppearance();
  return <Stack.Screen options={{ title, headerBackVisible: false,
    headerLeft: () => <View style={{ height: '100%', justifyContent: 'center' }}>
      <IconButton accessibilityLabel="Back" onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace(fallbackHref))}
        icon={<SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          size={iconSizes.navigation} tintColor={colors.primary} />} />
    </View>,
    headerRight: () => rightAction ? <View style={{ height: '100%', justifyContent: 'center' }}>
      <IconButton accessibilityLabel={rightAction.accessibilityLabel} onPress={rightAction.onPress} icon={rightAction.icon} />
    </View> : null,
  }} />;
}
