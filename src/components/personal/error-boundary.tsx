import { useEffect } from 'react';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { personalDiagnostic } from '@/features/personal/diagnostics';
import { Action, styles } from './ui';

export function PersonalErrorBoundary({ retry }: ErrorBoundaryProps) {
  useEffect(() => { personalDiagnostic('render-failed'); }, []);
  return <SafeAreaView style={styles.screen}><View style={styles.content}>
    <Text style={styles.heading}>Could not display personal transactions</Text>
    <Text style={styles.body}>A screen error occurred. A transaction you just saved may already be stored. Check history before adding it again.</Text>
    <Action label="Try again" onPress={() => { void retry().catch(() => personalDiagnostic('render-failed')); }} />
    <Action label="Home" onPress={() => router.replace('/')} />
  </View></SafeAreaView>;
}
