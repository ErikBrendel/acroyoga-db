import { z } from 'zod';
import * as THREE from 'three';
import { ALL_BONES, AngleDef, BONES, BoneKey, DEFAULT_ROOT_POSITION, JOINT_IDS, JOINTS, JointId, Side, boneKey, mirrorSign, oppositeBone } from './skeleton';

// Stored format: angles that are 0 are omitted, and a paired joint's angle is a plain number
// when left and right agree, `{ left, right }` otherwise.
// { "position": [0, 0.97, 0], "joints": { "hip": { "pike": 90, "straddle": { "left": 10, "right": 30 } } } }
const AngleValueSchema = z.union([z.number(), z.object({ left: z.number(), right: z.number() })]);
const StoredJointsSchema = z.partialRecord(z.enum(JOINT_IDS), z.record(z.string(), AngleValueSchema));

export const StoredHumanPoseSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  joints: StoredJointsSchema,
});

export type StoredJoints = z.infer<typeof StoredJointsSchema>;
export type StoredHumanPose = z.infer<typeof StoredHumanPoseSchema>;

export interface HumanPose {
  position: [number, number, number];
  angles: Record<BoneKey, Record<string, number>>;
}

export function neutralPose(): HumanPose {
  const angles = Object.fromEntries(
    ALL_BONES.map(({ key, joint }) => [key, Object.fromEntries(JOINTS[joint].angles.map(a => [a.name, 0]))]),
  ) as HumanPose['angles'];
  return { position: [...DEFAULT_ROOT_POSITION], angles };
}

export function withAngle(pose: HumanPose, key: BoneKey, angleName: string, value: number): HumanPose {
  const def = JOINTS[BONES[key].joint].angles.find(a => a.name === angleName)!;
  const clamped = THREE.MathUtils.clamp(value, def.min, def.max);
  return { ...pose, angles: { ...pose.angles, [key]: { ...pose.angles[key], [angleName]: clamped } } };
}

export function withJoints(pose: HumanPose, joints: StoredJoints): HumanPose {
  let result = pose;
  for (const [joint, values] of Object.entries(joints) as [JointId, Record<string, z.infer<typeof AngleValueSchema>>][]) {
    const def = JOINTS[joint];
    for (const [angleName, value] of Object.entries(values)) {
      if (!def.angles.some(a => a.name === angleName)) {
        throw new Error(`Unknown angle "${angleName}" on joint "${joint}"`);
      }
      if (typeof value === 'number') {
        const keys = def.paired ? [boneKey(joint, 'left'), boneKey(joint, 'right')] : [boneKey(joint, null)];
        keys.forEach(key => { result = withAngle(result, key, angleName, value); });
        continue;
      }
      if (!def.paired) {
        throw new Error(`Joint "${joint}" is not paired, but "${angleName}" has left/right values`);
      }
      result = withAngle(result, boneKey(joint, 'left'), angleName, value.left);
      result = withAngle(result, boneKey(joint, 'right'), angleName, value.right);
    }
  }
  return result;
}

export function parseHumanPose(json: unknown): HumanPose {
  const stored = StoredHumanPoseSchema.parse(json);
  return { ...withJoints(neutralPose(), stored.joints), position: stored.position };
}

const round = (value: number, decimals: number) => Number(value.toFixed(decimals)) || 0;

export function serializeHumanPose(pose: HumanPose): StoredHumanPose {
  const joints: StoredJoints = {};
  for (const joint of JOINT_IDS) {
    const def = JOINTS[joint];
    const values: Record<string, z.infer<typeof AngleValueSchema>> = {};
    for (const { name } of def.angles) {
      if (!def.paired) {
        const value = round(pose.angles[boneKey(joint, null)][name], 1);
        if (value !== 0) values[name] = value;
        continue;
      }
      const left = round(pose.angles[boneKey(joint, 'left')][name], 1);
      const right = round(pose.angles[boneKey(joint, 'right')][name], 1);
      if (left === right && left === 0) continue;
      values[name] = left === right ? left : { left, right };
    }
    if (Object.keys(values).length > 0) joints[joint] = values;
  }
  const [x, y, z] = pose.position;
  return { position: [round(x, 3), round(y, 3), round(z, 3)], joints };
}

export function mirrorHumanPose(pose: HumanPose): HumanPose {
  const angles = { ...pose.angles };
  for (const { key, joint } of ALL_BONES) {
    const opposite = oppositeBone(key);
    if (opposite) {
      angles[key] = { ...pose.angles[opposite] };
      continue;
    }
    angles[key] = Object.fromEntries(
      JOINTS[joint].angles.map(a => [a.name, mirrorSign(a.axis) * pose.angles[key][a.name]]),
    );
  }
  const [x, y, z] = pose.position;
  return { position: [-x, y, z], angles };
}

// Sideways angles of spine and neck, which a body that is symmetric in itself cannot have
export const breaksSymmetry = (joint: JointId, angle: AngleDef) => !JOINTS[joint].paired && joint !== 'root' && mirrorSign(angle.axis) === -1;

// The body made mirror-symmetric in itself: paired joints take the values of the `source` side, spine and
// neck lose their sideways angles. Position and root orientation stay.
export function symmetrized(pose: HumanPose, source: Side): HumanPose {
  const angles = { ...pose.angles };
  for (const { key, joint, side } of ALL_BONES) {
    if (side && side !== source) angles[key] = { ...pose.angles[oppositeBone(key)!] };
    if (!side) {
      angles[key] = Object.fromEntries(JOINTS[joint].angles.map(a => [a.name, breaksSymmetry(joint, a) ? 0 : pose.angles[key][a.name]]));
    }
  }
  return { ...pose, angles };
}

// The side an edit changed, the left one if both or neither
export function editedSide(previous: HumanPose, next: HumanPose): Side {
  const changed = (side: Side) => ALL_BONES.some(b => b.side === side
    && Object.keys(next.angles[b.key]).some(name => next.angles[b.key][name] !== previous.angles[b.key][name]));
  return changed('right') && !changed('left') ? 'right' : 'left';
}
