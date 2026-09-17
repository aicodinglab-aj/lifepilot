import { Image } from 'expo-image';

export function AnimatedSplashOverlay() {
  return null;
}

export function AnimatedIcon() {
  return <Image source={require('@/assets/images/lifepilot-icon.png')}
    accessibilityLabel="LifePilot" contentFit="contain" style={{ width: 128, height: 128 }} />;
}
