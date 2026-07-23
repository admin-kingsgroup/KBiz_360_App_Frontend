import { useCallback, useInsertionEffect, useRef } from 'react';

// Stable-identity event callback (the React "useEvent" pattern): the returned function NEVER
// changes identity, but always executes the latest render's body. This lets a screen hand
// callbacks to React.memo children (or long-lived timers) without breaking their bail-out,
// while the handler still reads fresh state/props when it actually fires.
// Only for event handlers / effects / timers — never call the result during render.
export function useEventCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useInsertionEffect(() => { ref.current = fn; });
  return useCallback((...args: A) => ref.current(...args), []);
}
