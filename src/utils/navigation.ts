import { setUrlParams, useUrlState } from '../hooks/useUrlState';

export const VIEWS = ['home', 'poses', 'flows', 'map', 'about'] as const;
export type View = typeof VIEWS[number];

export function useView(): View {
  const [view] = useUrlState<string | null>('view', null);
  const [poseId] = useUrlState<string | null>('pose', null);
  const [flowKey] = useUrlState<string | null>('flow', null);
  if (VIEWS.includes(view as View)) return view as View;
  // Links shared before there were views name only a flow or a pose
  if (flowKey) return 'flows';
  if (poseId) return 'poses';
  return 'home';
}

export const goTo = (view: View, params: Record<string, string | null> = {}) =>
  setUrlParams({ view: view === 'home' ? null : view, ...params }, true);
