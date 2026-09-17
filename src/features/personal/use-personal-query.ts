import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { personalDiagnostic } from './diagnostics';

// Callers stabilize their query with useCallback for focus-based reloads.
export function usePersonalQuery<T>(query: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null), [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true, generation = 0;
    async function load() {
      const token = ++generation;
      setLoading(true); setError(null);
      personalDiagnostic('query-start');
      try { const result = await query(); if (active && generation === token) { setData(result); personalDiagnostic('query-success'); } }
      catch { if (active && generation === token) { personalDiagnostic('query-failed'); setError('Could not load personal transactions. Your stored data has not been cleared.'); } }
      finally { if (active && generation === token) setLoading(false); }
    }
    void load();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void load(); });
    return () => { active = false; subscription.remove(); };
    // An explicit retry reruns the current query while focused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, attempt]));
  return { data, loading, error, retry: () => setAttempt((value) => value + 1) };
}
