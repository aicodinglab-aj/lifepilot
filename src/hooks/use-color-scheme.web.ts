import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  // React Native's color scheme hook already subscribes to client changes.
  // A light fallback also keeps static rendering deterministic when no scheme exists.
  return useRNColorScheme() ?? 'light';
}
