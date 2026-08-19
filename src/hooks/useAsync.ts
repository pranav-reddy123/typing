import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A discriminated union of the four states every async surface must handle.
 * The type makes it impossible to render a list without also handling loading,
 * empty and error — the compiler enforces the rule the design system states.
 */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string; retry: () => void }
  | { status: 'empty'; retry: () => void }
  | { status: 'ready'; data: T; retry: () => void };

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  isEmpty: (value: T) => boolean = (v) => Array.isArray(v) && v.length === 0,
): AsyncState<T> {
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'empty' | 'ready'; data?: T; error?: string }>({
    status: 'loading',
  });
  const generation = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    const mine = ++generation.current;
    setState({ status: 'loading' });
    fnRef
      .current()
      .then((value) => {
        if (mine !== generation.current) return;
        setState(isEmpty(value) ? { status: 'empty' } : { status: 'ready', data: value });
      })
      .catch((error: unknown) => {
        if (mine !== generation.current) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Something went wrong.',
        });
      });
    // isEmpty is intentionally not a dependency — callers pass inline predicates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  if (state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error', error: state.error ?? 'Something went wrong.', retry: run };
  if (state.status === 'empty') return { status: 'empty', retry: run };
  return { status: 'ready', data: state.data as T, retry: run };
}
