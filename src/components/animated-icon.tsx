import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

// Mounted only after appearance preferences and SQLite initialization are ready.
// Release the native branded splash on commit; no timer or animated overlay.
export function AnimatedSplashOverlay() {
  useEffect(() => {
    SplashScreen.hide();
  }, []);
  return null;
}

// Keep the existing export available for callers, using the approved bitmap.
export function AnimatedIcon() {
  return <Image source={require('@/assets/images/lifepilot-icon.png')}
    accessibilityLabel="LifePilot" contentFit="contain" style={{ width: 128, height: 128 }} />;
}
