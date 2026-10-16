import { Flow, Pose, Transition } from '../types/data';
import { getMirroredFlow, parseFlowVariantKey } from './flowMirror';

export const OWN_FLOW_PREFIX = 'my:';
export const SHARED_FLOW_KEY = 'shared';

export interface ResolvedFlow extends Flow {
  key: string;
  isOwn: boolean;
}

/** Transitions leaving a pose, in either direction where reversible */
export function nextPoses(poseId: string, transitions: Transition[]): { poseId: string; transition: Transition }[] {
  return transitions.flatMap(transition => {
    if (transition.fromPoseId === poseId) return [{ poseId: transition.toPoseId, transition }];
    if (transition.toPoseId === poseId && !transition.nonReversible) return [{ poseId: transition.fromPoseId, transition }];
    return [];
  });
}

export function transitionBetween(fromPoseId: string, toPoseId: string, transitions: Transition[]): Transition | undefined {
  return nextPoses(fromPoseId, transitions).find(next => next.poseId === toPoseId)?.transition;
}

export function resolveFlow(key: string, flows: Flow[], ownFlows: Flow[], sharedFlow: Flow | null, poses: Pose[]): ResolvedFlow | null {
  if (key === SHARED_FLOW_KEY) return sharedFlow && { ...sharedFlow, key, isOwn: false };
  if (key.startsWith(OWN_FLOW_PREFIX)) {
    const own = ownFlows.find(f => f.name === key.slice(OWN_FLOW_PREFIX.length));
    return own ? { ...own, key, isOwn: true } : null;
  }
  const { flowName, isMirrored } = parseFlowVariantKey(key);
  const flow = flows.find(f => f.name === flowName);
  if (!flow) return null;
  return { name: flow.name, poseIds: isMirrored ? getMirroredFlow(flow, poses) : flow.poseIds, key, isOwn: false };
}

export function flowShareUrl(flow: Flow): string {
  const params = new URLSearchParams({ view: 'flows', shared: flow.name, steps: flow.poseIds.join(','), flow: SHARED_FLOW_KEY });
  return `${window.location.origin}${window.location.pathname}?${params}`;
}

export function parseSharedFlow(params: URLSearchParams, poses: Pose[]): Flow | null {
  const name = params.get('shared')?.trim();
  const poseIds = params.get('steps')?.split(',') ?? [];
  if (!name || poseIds.length < 2 || !poseIds.every(id => poses.some(p => p.id === id))) return null;
  return { name, poseIds };
}

/** The name to import a shared flow under, or null if the same flow is already among the own flows */
export function importName(flow: Flow, ownFlows: Flow[]): string | null {
  const sameSteps = (other: Flow) => other.poseIds.join(',') === flow.poseIds.join(',');
  if (ownFlows.some(other => other.name === flow.name && sameSteps(other))) return null;
  let name = flow.name;
  for (let i = 2; ownFlows.some(other => other.name === name); i++) name = `${flow.name} (${i})`;
  return name;
}
