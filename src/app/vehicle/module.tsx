import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { VehiclePage, vehiclePageStyles as styles } from '@/components/vehicles/vehicle-page';
import { useVehicle } from '@/features/vehicles/use-vehicle';
import { vehicleModules } from '@/features/vehicles/vehicle-modules';

export default function VehicleModuleScreen() {
  const { module } = useLocalSearchParams<{ module: string }>();
  const state = useVehicle();
  const item = module === 'service' || module === 'insurance' || module === 'fuel' ? vehicleModules[module] : null;
  return <VehiclePage title={item?.title ?? 'Vehicle module'} {...state} error={state.error ?? (!item ? 'This module could not be found.' : null)}>
    {item && <View style={styles.card}>
      <Text style={styles.eyebrow}>COMING LATER</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.message}</Text>
      <Text style={styles.body}>No records have been added for this module.</Text>
    </View>}
  </VehiclePage>;
}
