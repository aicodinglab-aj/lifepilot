import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Text, View } from 'react-native';
import { getReminderPreferences, getVehicleMileageTarget } from '@/database/reminders';
import { odometerStatus } from '@/features/reminders/reminder';
import { CoverageAction, coverageStyles as styles } from './coverage-ui';

export function VehicleMileageReminder({ vehicleId, odometer }: { vehicleId: number; odometer: number }) {
  const db = useSQLiteContext();
  const [status, setStatus] = useState<ReturnType<typeof odometerStatus>>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([getVehicleMileageTarget(db, vehicleId), getReminderPreferences(db)]).then(([target, preferences]) => {
      if (active) setStatus(odometerStatus(odometer, target?.dueOdometer ?? null, preferences.mileageThreshold));
    }).catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, [db, vehicleId, odometer]));
  if (!status || status.state === 'Upcoming') return null;
  return <View style={styles.card}>
    <Text style={styles.sectionTitle}>Service mileage · {status.state}</Text>
    <Text style={styles.accent}>{status.message}</Text>
    <Text style={styles.body}>Based on the {odometer.toLocaleString()} km entered in Vehicle Details.</Text>
    <CoverageAction label="View reminders" onPress={() => router.push('/reminders')} />
  </View>;
}
