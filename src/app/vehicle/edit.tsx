import { SafeAreaView } from 'react-native-safe-area-context';
import { VehicleHeader, VehiclePage } from '@/components/vehicles/vehicle-page';
import { VehicleDetailsEditor } from '@/components/vehicles/vehicle-details-editor';
import { lifePilotColors as colors } from '@/constants/lifepilot-theme';
import { useVehicle } from '@/features/vehicles/use-vehicle';

export default function EditVehicleDetailsScreen() {
  const state = useVehicle();
  if (state.loading || state.error || !state.vehicle) return <VehiclePage title="Edit Vehicle Details" {...state} />;
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    <VehicleHeader title="Edit Vehicle Details" />
    <VehicleDetailsEditor key={state.vehicle.id} vehicle={state.vehicle} />
  </SafeAreaView>;
}
