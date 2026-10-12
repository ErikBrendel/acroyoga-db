import * as THREE from 'three';
import { z } from 'zod';
import { createBones } from './Bone';
import { HumanPose } from './humanPose';
import { ALL_BONES, BONES, BoneKey, CONTACT_NORMALS, CONTACT_POINTS, JOINTS, boneKey } from './skeleton';

export const EFFECTORS = ['left-wrist', 'right-wrist', 'left-ankle', 'right-ankle'] as const satisfies readonly BoneKey[];
export type Effector = (typeof EFFECTORS)[number];

export const isEffector = (key: BoneKey): key is Effector => (EFFECTORS as readonly BoneKey[]).includes(key);

// World-space position and orientation the contact point of a hand / foot is pinned to
export const IkTargetSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  quaternion: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});
export const PinsSchema = z.partialRecord(z.enum(EFFECTORS), IkTargetSchema);

export type IkTarget = z.infer<typeof IkTargetSchema>;
export type Pins = z.infer<typeof PinsSchema>;

// Radians of orientation error that weigh as much as one metre of position error.
// Small, so that reaching the position wins when both cannot be satisfied.
const ORIENTATION_WEIGHT = 0.15;
const DAMPING = 0.05;
// Share of the distance back to the starting angles recovered per iteration, within the null space of the task
const STAY_CLOSE = 0.5;
const PROJECTOR_DAMPING = 1e-3;
// Counts as reached when within this many metres and radians
const REACHED_POSITION = 1e-3;
const REACHED_ORIENTATION = THREE.MathUtils.degToRad(1);
const MAX_ITERATIONS = 200;
const MAX_STEP = 0.3;
const JACOBIAN_DELTA = 1e-4;
// Radians; iterating stops once the reach and stay-close corrections have both settled below this
const CONVERGED_STEP = 1e-6;

const bones = createBones();

function parentOf(key: BoneKey): BoneKey | null {
  const { joint, side } = BONES[key];
  const parent = JOINTS[joint].parent;
  return parent ? boneKey(parent, JOINTS[parent].paired ? side : null) : null;
}

// The bones of an arm / leg from the shoulder / hip down to `key`; empty for the torso and head
export function limbChain(key: BoneKey): BoneKey[] {
  const chain: BoneKey[] = [];
  for (let k: BoneKey | null = key; k && BONES[k].side; k = parentOf(k)) chain.unshift(k);
  return chain;
}

// The hand / foot at the end of the limb `key` belongs to
export const limbEffector = (key: BoneKey): Effector | undefined => EFFECTORS.find(e => limbChain(e).includes(key));

export const parentAngles = (angles: HumanPose['angles'], key: BoneKey) => {
  const parent = bones[key].parent;
  return parent ? angles[parent.key] : undefined;
};

function localMatrix(pose: HumanPose, key: BoneKey): THREE.Matrix4 {
  return key === 'root'
    ? bones.root.localMatrix(pose.angles.root, undefined, new THREE.Vector3(...pose.position))
    : bones[key].localMatrix(pose.angles[key], parentAngles(pose.angles, key));
}

export function worldMatrix(pose: HumanPose, key: BoneKey): THREE.Matrix4 {
  const parent = parentOf(key);
  const local = localMatrix(pose, key);
  return parent ? worldMatrix(pose, parent).multiply(local) : local;
}

export function toTarget(matrix: THREE.Matrix4): IkTarget {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  matrix.decompose(position, quaternion, new THREE.Vector3());
  return { position: position.toArray(), quaternion: quaternion.toArray() as IkTarget['quaternion'] };
}

function contactOffset(effector: Effector): THREE.Matrix4 {
  const { joint, side } = BONES[effector];
  const [x, y, z] = CONTACT_POINTS[joint as keyof typeof CONTACT_POINTS];
  return new THREE.Matrix4().makeTranslation(side === 'right' ? -x : x, y, z);
}

export function readTarget(pose: HumanPose, effector: Effector): IkTarget {
  return toTarget(worldMatrix(pose, effector).multiply(contactOffset(effector)));
}

// The hand / foot moved straight onto the floor (y = 0), turned as little as possible to lie flat on it
export function floorTarget(pose: HumanPose, effector: Effector): IkTarget {
  const { position, quaternion } = readTarget(pose, effector);
  const { joint, side } = BONES[effector];
  const [x, y, z] = CONTACT_NORMALS[joint as keyof typeof CONTACT_NORMALS];
  const current = new THREE.Quaternion(...quaternion);
  const normal = new THREE.Vector3(side === 'right' ? -x : x, y, z).applyQuaternion(current);
  const flat = new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, -1, 0)).multiply(current);
  return { position: [position[0], 0, position[2]], quaternion: flat.toArray() as IkTarget['quaternion'] };
}

// The target the opposite effector needs for a pose that is mirror-symmetric relative to the body
export function mirrorTarget(pose: HumanPose, target: IkTarget): IkTarget {
  const root = worldMatrix(pose, 'root');
  const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
  const world = new THREE.Matrix4().compose(
    new THREE.Vector3(...target.position), new THREE.Quaternion(...target.quaternion), new THREE.Vector3(1, 1, 1),
  );
  const local = root.clone().invert().multiply(world);
  return toTarget(root.multiply(mirror).multiply(local).multiply(mirror));
}

export interface FixedAngle {
  key: BoneKey;
  name: string;
}

export const FixedAngleSchema = z.object({ key: z.string() as z.ZodType<BoneKey>, name: z.string() });

export const changedAngles = (previous: HumanPose, next: HumanPose): FixedAngle[] => ALL_BONES.flatMap(({ key }) =>
  Object.keys(next.angles[key]).filter(name => previous.angles[key][name] !== next.angles[key][name]).map(name => ({ key, name })));

function reaches(pose: HumanPose, effector: Effector, target: IkTarget): boolean {
  const reached = readTarget(pose, effector);
  return new THREE.Vector3(...reached.position).distanceTo(new THREE.Vector3(...target.position)) < REACHED_POSITION
    && new THREE.Quaternion(...reached.quaternion).angleTo(new THREE.Quaternion(...target.quaternion)) < REACHED_ORIENTATION;
}

// Pulls pinned limbs back onto their pins after `next` changed the pose; pins themselves never move.
// Angles the edit changed within a pinned limb are kept if the rest of the limb can still reach the pin
// (e.g. rotating the upper arm of a pinned hand swivels the elbow). Otherwise, e.g. for a preset, the whole
// limb is solved, as close to the edited pose as the pin allows.
// `locked` angles never change.
export function withPins(previous: HumanPose, next: HumanPose, pins: Pins, locked: FixedAngle[] = []): HumanPose {
  let pose = next;
  for (const effector of EFFECTORS) {
    const target = pins[effector];
    if (!target) continue;
    const chain = limbChain(effector);
    const edited = changedAngles(previous, next).filter(f => chain.includes(f.key));
    const keepingEdit = solveIk(pose, effector, target, { fixed: [...edited, ...locked] });
    pose = reaches(keepingEdit, effector, target) ? keepingEdit : solveIk(pose, effector, target, { fixed: locked });
  }
  return pose;
}

function averageQuaternion(quaternions: THREE.Quaternion[]): THREE.Quaternion {
  const [first] = quaternions;
  const sum = quaternions.reduce((acc, q) => {
    const sign = q.dot(first) < 0 ? -1 : 1;
    return acc.set(acc.x + sign * q.x, acc.y + sign * q.y, acc.z + sign * q.z, acc.w + sign * q.w);
  }, new THREE.Quaternion(0, 0, 0, 0));
  return sum.normalize();
}

function rotationVector(q: THREE.Quaternion): THREE.Vector3 {
  const shortest = q.w < 0 ? new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w) : q;
  const sinHalf = Math.hypot(shortest.x, shortest.y, shortest.z);
  const angle = 2 * Math.atan2(sinHalf, shortest.w);
  const scale = sinHalf < 1e-9 ? 2 : angle / sinHalf;
  return new THREE.Vector3(shortest.x, shortest.y, shortest.z).multiplyScalar(scale);
}

interface IkOptions {
  positionOnly?: boolean;
  orientationOnly?: boolean;
  fixed?: FixedAngle[];
}

export function solveIk(pose: HumanPose, effector: Effector, target: IkTarget, options: IkOptions = {}): HumanPose {
  return solveChain(pose, limbChain(effector), contactOffset(effector), target, options);
}

// Moves the whole person so that the frames `from` come as close to their `to` as possible together:
// exactly for a single pair, otherwise by the average rotation, matching the centroids of the frames.
// Without `rotate`, only the centroids are matched.
export function movedRigidly(pose: HumanPose, moves: { from: THREE.Matrix4; to: THREE.Matrix4 }[], rotate = true): HumanPose {
  const rotation = rotate
    ? averageQuaternion(moves.map(({ from, to }) => new THREE.Quaternion().setFromRotationMatrix(to.clone().multiply(from.clone().invert()))))
    : new THREE.Quaternion();
  const centroid = (frames: THREE.Matrix4[]) => frames
    .reduce((sum, m) => sum.add(new THREE.Vector3().setFromMatrixPosition(m)), new THREE.Vector3())
    .divideScalar(frames.length);
  const translation = centroid(moves.map(m => m.to)).sub(centroid(moves.map(m => m.from)).applyQuaternion(rotation));
  const moved = new THREE.Matrix4().compose(translation, rotation, new THREE.Vector3(1, 1, 1)).multiply(worldMatrix(pose, 'root'));
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  moved.decompose(position, quaternion, new THREE.Vector3());
  const root = rotate ? bones.root.anglesFromQuaternion(quaternion, pose.angles.root) : pose.angles.root;
  return { position: position.toArray(), angles: { ...pose.angles, root } };
}

// Damped least squares over the chain's semantic angles, clamped to the joint limits, bringing the frame
// `offset` (relative to the last bone of the chain) onto the target. Redundant degrees of freedom
// (e.g. elbow swivel) are pulled back towards the starting angles, so the limb changes no more than needed.
// With `positionOnly` / `orientationOnly`, the orientation / position is free. `fixed` angles keep their values.
export function solveChain(
  pose: HumanPose,
  chain: BoneKey[],
  offset: THREE.Matrix4,
  target: IkTarget,
  { positionOnly = false, orientationOnly = false, fixed = [] }: IkOptions = {},
): HumanPose {
  const base = worldMatrix(pose, parentOf(chain[0])!);
  const params = chain.flatMap(key => bones[key].angles
    .filter(angle => !fixed.some(f => f.key === key && f.name === angle.name))
    .map(angle => ({
      key,
      name: angle.name,
      min: THREE.MathUtils.degToRad(angle.min),
      max: THREE.MathUtils.degToRad(angle.max),
    })));
  const targetPosition = new THREE.Vector3(...target.position);
  const targetQuaternion = new THREE.Quaternion(...target.quaternion);

  const anglesOf = (values: number[]) => {
    const angles = Object.fromEntries(chain.map(key => [key, { ...pose.angles[key] }])) as Record<BoneKey, Record<string, number>>;
    params.forEach((p, i) => { angles[p.key][p.name] = THREE.MathUtils.radToDeg(values[i]); });
    return angles;
  };
  const effectorFrame = (values: number[]) => {
    const angles = anglesOf(values);
    const all = { ...pose.angles, ...angles };
    const matrix = chain.reduce((m, key) => m.multiply(bones[key].localMatrix(all[key], parentAngles(all, key))), base.clone()).multiply(offset);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    matrix.decompose(position, quaternion, new THREE.Vector3());
    return { position, quaternion };
  };
  const frameDelta = (from: ReturnType<typeof effectorFrame>, to: { position: THREE.Vector3; quaternion: THREE.Quaternion }) => {
    const rotation = rotationVector(to.quaternion.clone().multiply(from.quaternion.clone().invert()));
    const positionDelta = to.position.clone().sub(from.position).toArray();
    if (orientationOnly) return rotation.toArray();
    return positionOnly ? positionDelta : [...positionDelta, ...rotation.multiplyScalar(ORIENTATION_WEIGHT).toArray()];
  };

  const initial = params.map(p => THREE.MathUtils.degToRad(pose.angles[p.key][p.name]));
  let values = [...initial];
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const frame = effectorFrame(values);
    const error = frameDelta(frame, { position: targetPosition, quaternion: targetQuaternion });

    const jacobian = values.map((_, i) => {
      const nudged = [...values];
      nudged[i] += JACOBIAN_DELTA;
      return frameDelta(frame, effectorFrame(nudged)).map(d => d / JACOBIAN_DELTA);
    });

    // Joints at a limit that the step would push further out are excluded and the step recomputed
    const locked = new Set<number>();
    let step: number[] = [];
    for (let attempt = 0; attempt <= params.length; attempt++) {
      const towardsInitial = values.map((v, i) => STAY_CLOSE * (initial[i] - v));
      step = nullSpaceStep(jacobian, error, towardsInitial, locked);
      const newlyLocked = params.filter((p, i) =>
        !locked.has(i) && ((values[i] <= p.min + 1e-9 && step[i] < 0) || (values[i] >= p.max - 1e-9 && step[i] > 0)),
      );
      if (newlyLocked.length === 0) break;
      newlyLocked.forEach(p => locked.add(params.indexOf(p)));
    }

    const stepSize = Math.max(...step.map(Math.abs));
    if (stepSize < CONVERGED_STEP) break;
    const scale = Math.min(1, MAX_STEP / stepSize);
    values = values.map((v, i) => THREE.MathUtils.clamp(v + step[i] * scale, params[i].min, params[i].max));
  }

  return { ...pose, angles: { ...pose.angles, ...anglesOf(values) } };
}

// Damped least squares step (G + λ²I)⁻¹Jᵀe plus the secondary motion s projected into the null space of J,
// with G = JᵀJ. The projector μ²(G + μ²I)⁻¹ uses its own, much smaller damping μ: it is ≈ 1 in null-space
// directions and ≈ 0 elsewhere, so s barely interferes with reaching the target.
// J is given as one column per parameter; locked parameters do not move.
function nullSpaceStep(columns: number[][], error: number[], secondary: number[], locked: Set<number>): number[] {
  const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const free = (i: number) => !locked.has(i);
  const g = columns.map((ci, r) => columns.map((cj, c) => (free(r) && free(c) ? dot(ci, cj) : 0)));
  const damped = (damping: number) => g.map((row, r) => row.map((v, c) => (r === c ? (free(r) ? v + damping ** 2 : 1) : v)));
  const primary = solveLinearSystem(damped(DAMPING), columns.map((col, i) => (free(i) ? dot(col, error) : 0)));
  const nullMotion = solveLinearSystem(damped(PROJECTOR_DAMPING), secondary.map((v, i) => (free(i) ? v : 0)));
  return primary.map((v, i) => v + PROJECTOR_DAMPING ** 2 * nullMotion[i]);
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = col + 1; r < n; r++) {
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    x[r] = (m[r][n] - m[r].slice(r + 1, n).reduce((sum, v, i) => sum + v * x[r + 1 + i], 0)) / m[r][r];
  }
  return x;
}
