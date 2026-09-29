import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

// A stable loader reruns on focus; stale reads cannot replace another vehicle's data.
export function useFuelResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useFocusEffect(useCallback(() => {
    const token = ++generation.current;
    setLoading(true); setError(null);
    void load().then(value => { if (generation.current === token) setData(value); })
      .catch(() => { if (generation.current === token) { setData(null); setError('Could not load these records. Please try again.'); } })
      .finally(() => { if (generation.current === token) setLoading(false); });
    return () => { generation.current++; };
  // The retry token intentionally reloads while focused.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, retry]));
  return { data, loading, error, generation, reload: () => setRetry(n => n + 1) };
}
