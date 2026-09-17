import { useThemedStyles } from '@/features/appearance/appearance-provider';
import { useEffect } from 'react';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { personalDiagnostic } from '@/features/personal/diagnostics';
import { Action, styles } from './ui';

export function PersonalErrorBoundary({ retry }: ErrorBoundaryProps) {
  const themed_styles = useThemedStyles(styles);
  useEffect(() => { personalDiagnostic('render-failed'); }, []);
  return <SafeAreaView style={themed_styles.screen}><View style={themed_styles.content}>
    <Text style={themed_styles.heading}>Could not display personal transactions</Text>
    <Text style={themed_styles.body}>A screen error occurred. A transaction you just saved may already be stored. Check history before adding it again.</Text>
    <Action label="Try again" onPress={() => { void retry().catch(() => personalDiagnostic('render-failed')); }} />
    <Action label="Home" onPress={() => router.replace('/')} />
  </View></SafeAreaView>;
}
