import { fetchPoses3d } from '../api/poses3d';
import { Pose } from '../types/data';
import { AcroPose, mirrorAcroPose, parseAcroPose } from './acroPose';

export interface Pose3d {
  pose: AcroPose;
  isDraft: boolean;
}

async function fetchSaved(poseId: string): Promise<unknown> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/poses3d/${poseId}.json`);
  return response.ok ? response.json() : undefined;
}

// The pose's own data, or its mirror image's mirrored; AI drafts only in dev mode, where the edit API serves them
export async function loadPose3d(pose: Pose): Promise<Pose3d | null> {
  const ids = [pose.id, pose.mirroredPoseId].filter((id): id is string => !!id);
  const sources: { saved: Record<string, unknown>; drafts: Record<string, unknown> } = import.meta.env.DEV
    ? await fetchPoses3d()
    : { saved: Object.fromEntries(await Promise.all(ids.map(async id => [id, await fetchSaved(id)]))), drafts: {} };
  for (const isDraft of [false, true]) {
    const stored = isDraft ? sources.drafts : sources.saved;
    const id = ids.find(i => stored[i] !== undefined);
    if (!id) continue;
    const parsed = parseAcroPose(stored[id]);
    return { pose: id === pose.id ? parsed : mirrorAcroPose(parsed), isDraft };
  }
  return null;
}
