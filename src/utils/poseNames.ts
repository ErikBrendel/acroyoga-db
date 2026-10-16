import { Pose } from '../types/data';

export const poseName = (pose: Pose) => pose.name || pose.id;

const namesOf = (pose: Pose) => [poseName(pose), ...(pose.aliases ?? [])];

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function searchPoses(poses: Pose[], query: string): Pose[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return poses.filter(pose => {
    const text = [pose.id, ...namesOf(pose), pose.description ?? ''].join(' ').toLowerCase();
    return words.every(word => text.includes(word));
  });
}

/** The pose's own alias that matches the query, to show why it was found */
export function matchedAlias(pose: Pose, query: string): string | undefined {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.every(word => poseName(pose).toLowerCase().includes(word))) return undefined;
  return pose.aliases?.find(alias => words.every(word => alias.toLowerCase().includes(word)));
}

/** Names of this pose that other poses use too, e.g. "bird" as an alias of front plank and the name of bird */
export function sharedNames(pose: Pose, poses: Pose[]): { name: string; others: Pose[] }[] {
  const others = poses.filter(p => p.id !== pose.id && p.id !== pose.mirroredPoseId);
  return namesOf(pose)
    .map(name => ({ name, others: others.filter(other => namesOf(other).some(n => sameName(n, name))) }))
    .filter(({ others }) => others.length > 0);
}
