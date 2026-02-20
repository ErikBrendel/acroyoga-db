import { useState } from 'react';

export function useUrlState<T extends string | null>(paramName: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const param = new URLSearchParams(window.location.search).get(paramName);
    return (param !== null ? param : defaultValue) as T;
  });

  const setValueAndUrl = (newValue: T) => {
    setValue(newValue);
    const params = new URLSearchParams(window.location.search);
    if (newValue) {
      params.set(paramName, newValue);
    } else {
      params.delete(paramName);
    }
    const search = params.toString();
    window.history.replaceState(null, '', search ? `?${search}` : window.location.pathname);
  };

  return [value, setValueAndUrl];
}