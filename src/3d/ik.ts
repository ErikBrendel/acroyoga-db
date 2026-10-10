import * as THREE from 'three';
import { z } from 'zod';
import { createBones } from './Bone';
import { HumanPose } from './humanPose';
import { BONES, BoneKey, CONTACT_POINTS, JOINTS, boneKey } from './skeleton';

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

// Upper limb, lower limb and the effector itself
export function chainOf(effector: Effector): BoneKey[] {
  const lower = parentOf(effector)!;
  return [parentOf(lower)!, lower, effector];
}

function localMatrix(pose: HumanPose, key: BoneKey): THREE.Matrix4 {
  return key === 'root'
    ? bones.root.localMatrix(pose.angles.root, new THREE.Vector3(...pose.position))
    : bones[key].localMatrix(pose.angles[key]);
}

export function worldMatrix(pose: HumanPose, key: BoneKey): THREE.Matrix4 {
  const parent = parentOf(key);
  const local = localMatrix(pose, key);
  return parent ? worldMatrix(pose, parent).multiply(local) : local;
}

function toTarget(matrix: THREE.Matrix4): IkTarget {
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

const changedAngles = (previous: HumanPose, next: HumanPose, key: BoneKey) =>
  Object.keys(next.angles[key]).filter(name => previous.angles[key][name] !== next.angles[key][name]);

function reaches(pose: HumanPose, effector: Effector, target: IkTarget): boolean {
  const reached = readTarget(pose, effector);
  return new THREE.Vector3(...reached.position).distanceTo(new THREE.Vector3(...target.position)) < REACHED_POSITION
    && new THREE.Quaternion(...reached.quaternion).angleTo(new THREE.Quaternion(...target.quaternion)) < REACHED_ORIENTATION;
}

// Pulls pinned limbs back onto their pins after `next` changed the pose; pins themselves never move.
// Angles the edit changed within a pinned limb are kept if the rest of the limb can still reach the pin
// (e.g. rotating the upper arm of a pinned hand swivels the elbow). Otherwise, e.g. for a preset, the whole
// limb is solved, as close to the edited pose as the pin allows.
export function withPins(previous: HumanPose, next: HumanPose, pins: Pins): HumanPose {
  let pose = next;
  for (const effector of EFFECTORS) {
    const target = pins[effector];
    if (!target) continue;
    const edited = chainOf(effector).flatMap(key => changedAngles(previous, next, key).map(name => ({ key, name })));
    const keepingEdit = solveIk(pose, effector, target, { fixed: edited });
    pose = reaches(keepingEdit, effector, target) ? keepingEdit : solveIk(pose, effector, target);
  }
  return pose;
}

function rotationVector(q: THREE.Quaternion): THREE.Vector3 {
  const shortest = q.w < 0 ? new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w) : q;
  const sinHalf = Math.hypot(shortest.x, shortest.y, shortest.z);
  const angle = 2 * Math.atan2(sinHalf, shortest.w);
  const scale = sinHalf < 1e-9 ? 2 : angle / sinHalf;
  return new THREE.Vector3(shortest.x, shortest.y, shortest.z).multiplyScalar(scale);
}

// Damped least squares over the chain's semantic angles, clamped to the joint limits. Redundant degrees
// of freedom (e.g. elbow swivel) are pulled back towards the starting angles, so the limb changes no more
// than needed. With `positionOnly`, the hand / foot orientation is free.
// `fixed` angles keep their values.
export function solveIk(
  pose: HumanPose,
  effector: Effector,
  target: IkTarget,
  { positionOnly = false, fixed = [] }: { positionOnly?: boolean; fixed?: { key: BoneKey; name: string }[] } = {},
): HumanPose {
  const chain = chainOf(effector);
  const base = worldMatrix(pose, parentOf(chain[0])!);
  const params = chain.flatMap(key => bones[key].angles
    .filter(angle => !fixed.some(f => f.key === key && f.name === angle.name))
    .map(angle => ({
      key,
      name: angle.name,
      min: THREE.MathUtils.degToRad(angle.min),
      max: THREE.MathUtils.degToRad(angle.max),
    })));
  const contact = contactOffset(effector);
  const targetPosition = new THREE.Vector3(...target.position);
  const targetQuaternion = new THREE.Quaternion(...target.quaternion);

  const anglesOf = (values: number[]) => {
    const angles = Object.fromEntries(chain.map(key => [key, { ...pose.angles[key] }])) as Record<BoneKey, Record<string, number>>;
    params.forEach((p, i) => { angles[p.key][p.name] = THREE.MathUtils.radToDeg(values[i]); });
    return angles;
  };
  const effectorFrame = (values: number[]) => {
    const angles = anglesOf(values);
    const matrix = chain.reduce((m, key) => m.multiply(bones[key].localMatrix(angles[key])), base.clone()).multiply(contact);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    matrix.decompose(position, quaternion, new THREE.Vector3());
    return { position, quaternion };
  };
  const frameDelta = (from: ReturnType<typeof effectorFrame>, to: { position: THREE.Vector3; quaternion: THREE.Quaternion }) => {
    const rotation = rotationVector(to.quaternion.clone().multiply(from.quaternion.clone().invert()));
    const positionDelta = to.position.clone().sub(from.position).toArray();
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
