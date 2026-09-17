import { useAppearance } from '@/features/appearance/appearance-provider';
import { Slot } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';


export default function HomeLayout() {
  const appearance = useAppearance();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: appearance.colors.background }}>
      <Slot />
    </SafeAreaView>
  );
}
