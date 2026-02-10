import { Flow, Pose } from '../types/data';

export interface FlowVariant {
  originalFlow: Flow;
  poseIds: string[];
  isMirrored: boolean;
}

export function hasFlowMirrorVariant(flow: Flow, poses: Pose[]): boolean {
  const poseMap = new Map(poses.map(p => [p.id, p]));
  return flow.poseIds.some(poseId => {
    const pose = poseMap.get(poseId);
    return pose?.mirroredPoseId !== undefined;
  });
}

export function getMirroredFlow(flow: Flow, poses: Pose[]): string[] {
  const poseMap = new Map(poses.map(p => [p.id, p]));
  return flow.poseIds.map(poseId => {
    const pose = poseMap.get(poseId);
    return pose?.mirroredPoseId || poseId;
  });
}

export function getFlowVariants(flow: Flow, poses: Pose[]): FlowVariant[] {
  const hasMirror = hasFlowMirrorVariant(flow, poses);

  const variants: FlowVariant[] = [
    {
      originalFlow: flow,
      poseIds: flow.poseIds,
      isMirrored: false,
    }
  ];

  if (hasMirror) {
    variants.push({
      originalFlow: flow,
      poseIds: getMirroredFlow(flow, poses),
      isMirrored: true,
    });
  }

  return variants;
}

export function getFlowVariantKey(flowName: string, isMirrored: boolean): string {
  return isMirrored ? `${flowName}:::mirrored` : flowName;
}

export function parseFlowVariantKey(key: string): { flowName: string; isMirrored: boolean } {
  if (key.endsWith(':::mirrored')) {
    return {
      flowName: key.slice(0, -11), // Remove ':::mirrored'
      isMirrored: true,
    };
  }
  return {
    flowName: key,
    isMirrored: false,
  };
}
