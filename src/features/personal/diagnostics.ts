// Only fixed stage labels are logged: never amounts, descriptions, IDs, SQL, or raw errors.
export function personalDiagnostic(stage: 'save-start' | 'save-success' | 'save-failed' | 'navigation-start' | 'navigation-success' | 'navigation-failed' | 'query-start' | 'query-success' | 'query-failed' | 'render-failed') {
  if (stage.endsWith('failed')) console.warn(`[PersonalExpense] ${stage}`);
  else if (__DEV__ || process.env.EXPO_PUBLIC_APP_VARIANT === 'preview') console.info(`[PersonalExpense] ${stage}`);
}
