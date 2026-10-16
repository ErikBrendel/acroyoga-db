import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach(listener => listener()));

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Sets several URL parameters at once; `push` makes it a step the browser's back button returns from */
export function setUrlParams(changes: Record<string, string | null>, push = false) {
  const params = new URLSearchParams(window.location.search);
  for (const [name, value] of Object.entries(changes)) {
    if (value) params.set(name, value);
    else params.delete(name);
  }
  const search = params.toString();
  const url = search ? `?${search}` : window.location.pathname;
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
  listeners.forEach(listener => listener());
}

export function useUrlState<T extends string | null>(paramName: string, defaultValue: T, push = false): [T, (value: T) => void] {
  const value = useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get(paramName));
  return [(value ?? defaultValue) as T, (newValue: T) => setUrlParams({ [paramName]: newValue }, push)];
}
