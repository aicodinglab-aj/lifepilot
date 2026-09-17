// Expo inlines this explicit public build value. Unknown release builds fail closed.
// Production overrides development mode as an additional safeguard.
export const reminderTestEnabled = process.env.EXPO_PUBLIC_APP_VARIANT !== 'production'
  && (__DEV__ || process.env.EXPO_PUBLIC_APP_VARIANT === 'preview');
