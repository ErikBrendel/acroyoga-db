import * as THREE from 'three';
import { AngleDef, BoneKey, JOINTS, JointId, Side, boneKey, mirrorSign } from './skeleton';

const UNIT_AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
type UnitAxis = keyof typeof UNIT_AXES;

interface ResolvedAngle extends AngleDef {
  unitAxis: UnitAxis;
  sign: 1 | -1;
}

export class Bone {
  readonly key: BoneKey;
  readonly joint: JointId;
  readonly side: Side | null;
  readonly length: number;
  readonly angles: ResolvedAngle[];
  // Transform node: origin at the joint, bone extends along local +Y
  readonly node = new THREE.Group();
  private readonly baseQuaternion: THREE.Quaternion;
  private readonly eulerOrder: THREE.EulerOrder;

  constructor(joint: JointId, side: Side | null) {
    const def = JOINTS[joint];
    this.key = boneKey(joint, side);
    this.joint = joint;
    this.side = side;
    this.length = def.length;
    this.node.name = this.key;

    const isRight = side === 'right';
    this.angles = def.angles.map(angle => ({
      ...angle,
      unitAxis: angle.axis.replace('-', '') as UnitAxis,
      sign: ((angle.axis.startsWith('-') ? -1 : 1) * (isRight ? mirrorSign(angle.axis) : 1)) as 1 | -1,
    }));

    const parentLength = def.parent ? JOINTS[def.parent].length : 0;
    const [x, y, z] = def.offset ?? [0, parentLength, 0];
    this.node.position.set(isRight ? -x : x, y, z);

    this.baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(def.baseRotation ?? [0, 0, 0])));
    if (isRight) {
      this.baseQuaternion.y *= -1;
      this.baseQuaternion.z *= -1;
    }

    const usedAxes = this.angles.map(a => a.unitAxis);
    const unusedAxes = (['x', 'y', 'z'] as const).filter(a => !usedAxes.includes(a));
    this.eulerOrder = [...usedAxes, ...unusedAxes].join('').toUpperCase() as THREE.EulerOrder;
  }

  applyAngles(values: Record<string, number>): void {
    const q = this.baseQuaternion.clone();
    const step = new THREE.Quaternion();
    for (const angle of this.angles) {
      step.setFromAxisAngle(UNIT_AXES[angle.unitAxis], angle.sign * THREE.MathUtils.degToRad(values[angle.name]));
      q.multiply(step);
    }
    this.node.quaternion.copy(q);
  }

  // Inverse of applyAngles, e.g. for a rotation set by a gizmo. Of the two Euler solutions,
  // the one closest to `current` is used so that dragging stays continuous past ±90°.
  // Rotation around an axis the joint does not have is dropped.
  anglesFromQuaternion(quaternion: THREE.Quaternion, current: Record<string, number>): Record<string, number> {
    const relative = this.baseQuaternion.clone().invert().multiply(quaternion);
    const euler = new THREE.Euler().setFromQuaternion(relative, this.eulerOrder);
    const sequence = [...this.eulerOrder.toLowerCase()].map(axis => euler[axis as UnitAxis]);
    const [a, b, c] = sequence;
    const alternative = [a + Math.PI, Math.PI - b, c + Math.PI];

    const toAngles = (solution: number[]) =>
      this.angles.map((angle, i) => {
        const degrees = angle.sign * THREE.MathUtils.radToDeg(solution[i]);
        return nearestEquivalentDegrees(degrees, current[angle.name]);
      });
    const distance = (values: number[]) => values.reduce((sum, v, i) => sum + Math.abs(v - current[this.angles[i].name]), 0);

    const candidates = [toAngles(sequence), toAngles(alternative)];
    const best = distance(candidates[0]) <= distance(candidates[1]) ? candidates[0] : candidates[1];
    return Object.fromEntries(
      this.angles.map((angle, i) => [angle.name, THREE.MathUtils.clamp(best[i], angle.min, angle.max)]),
    );
  }

  hasAxis(axis: UnitAxis): boolean {
    return this.angles.some(a => a.unitAxis === axis);
  }
}

function nearestEquivalentDegrees(degrees: number, reference: number): number {
  return degrees + 360 * Math.round((reference - degrees) / 360);
}
