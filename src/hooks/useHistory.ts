import { useCallback, useState } from 'react';

const MAX_ENTRIES = 200;

interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

type Update<T> = T | ((previous: T) => T);

const resolve = <T,>(update: Update<T>, previous: T): T =>
  typeof update === 'function' ? (update as (previous: T) => T)(previous) : update;

// Continuous edits (drags, sliders) call `checkpoint` once when they start and then `replace` per step,
// so that a whole drag is undone at once.
export function useHistory<T>(initial: () => T) {
  const [history, setHistory] = useState<History<T>>(() => ({ past: [], present: initial(), future: [] }));

  const checkpoint = useCallback(() => setHistory(h =>
    h.past[h.past.length - 1] === h.present ? h : { past: [...h.past.slice(1 - MAX_ENTRIES), h.present], present: h.present, future: [] },
  ), []);

  const replace = useCallback((next: Update<T>) => setHistory(h => ({ ...h, present: resolve(next, h.present) })), []);

  const commit = useCallback((next: Update<T>) => setHistory(h =>
    ({ past: [...h.past.slice(1 - MAX_ENTRIES), h.present], present: resolve(next, h.present), future: [] }),
  ), []);

  const undo = useCallback(() => setHistory(h => {
    // Skip checkpoints of edits that were started but changed nothing
    const past = [...h.past];
    while (past.length > 0 && past[past.length - 1] === h.present) past.pop();
    const previous = past.pop();
    return previous === undefined ? h : { past, present: previous, future: [h.present, ...h.future] };
  }), []);

  const redo = useCallback(() => setHistory(h => {
    const [next, ...future] = h.future;
    return next === undefined ? h : { past: [...h.past, h.present], present: next, future };
  }), []);

  return {
    state: history.present,
    canUndo: history.past.some(p => p !== history.present),
    canRedo: history.future.length > 0,
    checkpoint, replace, commit, undo, redo,
  };
}
