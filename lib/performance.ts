import { useCallback, useEffect, useRef, useState } from 'react';

export function useStableCallback<TCallback extends (...args: any[]) => unknown>(callback: TCallback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args: Parameters<TCallback>) => callbackRef.current(...args)) as TCallback,
    [],
  );
}

export function useDebouncedValue<TValue>(value: TValue, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function useThrottledCallback<TCallback extends (...args: any[]) => unknown>(
  callback: TCallback,
  intervalMs: number,
) {
  const stableCallback = useStableCallback(callback);
  const lastRunAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArgsRef = useRef<Parameters<TCallback> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return useCallback(
    ((...args: Parameters<TCallback>) => {
      const now = Date.now();
      const elapsed = now - lastRunAtRef.current;

      if (elapsed >= intervalMs) {
        lastRunAtRef.current = now;
        stableCallback(...args);
        return;
      }

      lastArgsRef.current = args;

      if (timerRef.current) {
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastRunAtRef.current = Date.now();

        if (lastArgsRef.current) {
          stableCallback(...lastArgsRef.current);
          lastArgsRef.current = null;
        }
      }, intervalMs - elapsed);
    }) as TCallback,
    [intervalMs, stableCallback],
  );
}
