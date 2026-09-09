import { Slot } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lifePilotColors } from '@/constants/lifepilot-theme';

export default function HomeLayout() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: lifePilotColors.background }}>
      <Slot />
    </SafeAreaView>
  );
}
