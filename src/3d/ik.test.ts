import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HumanPose, neutralPose, withAngle, withJoints } from './humanPose';
import { EFFECTORS, Effector, IkTarget, Pins, chainOf, mirrorTarget, readTarget, solveIk, withPins } from './ik';
import { ALL_BONES, BoneKey, JOINTS, oppositeBone } from './skeleton';
import { jointPosition, randomAngles, seededRandom } from './testHelpers';

function targetError(pose: HumanPose, effector: Effector, target: IkTarget) {
  const reached = readTarget(pose, effector);
  return {
    millimetres: new THREE.Vector3(...reached.position).distanceTo(new THREE.Vector3(...target.position)) * 1000,
    degrees: THREE.MathUtils.radToDeg(new THREE.Quaternion(...reached.quaternion).angleTo(new THREE.Quaternion(...target.quaternion))),
  };
}

const withinLimits = (pose: HumanPose) => ALL_BONES.every(({ key, joint }) =>
  JOINTS[joint].angles.every(a => pose.angles[key][a.name] >= a.min - 1e-9 && pose.angles[key][a.name] <= a.max + 1e-9));

const maxAngleChange = (a: HumanPose, b: HumanPose, keys: BoneKey[]) =>
  Math.max(...keys.flatMap(key => Object.keys(a.angles[key]).map(name => Math.abs(a.angles[key][name] - b.angles[key][name]))));

describe('readTarget', () => {
  it('pins the centre of the palm surface and of the sole', () => {
    const pose = neutralPose();
    const palm = new THREE.Vector3(...readTarget(pose, 'left-wrist').position);
    const sole = new THREE.Vector3(...readTarget(pose, 'right-ankle').position);
    // Standing: the left palm faces the body (-X) and points down, the sole faces the floor
    expect(palm.sub(jointPosition(pose, 'left-wrist')).toArray().map(v => +v.toFixed(4))).toEqual([-0.0125, -0.075, 0]);
    expect(sole.sub(jointPosition(pose, 'right-ankle')).toArray().map(v => +v.toFixed(4))).toEqual([0, -0.035, 0.1]);
  });
});

describe('solveIk', () => {
  it.each(EFFECTORS)('%s: reaches targets of nearby poses exactly, within the joint limits', effector => {
    const random = seededRandom(1);
    for (let i = 0; i < 50; i++) {
      const goal = randomAngles(neutralPose(), chainOf(effector), random);
      const target = readTarget(goal, effector);
      const start = chainOf(effector).reduce((pose, key) => Object.entries(goal.angles[key])
        .reduce((p, [name, value]) => withAngle(p, key, name, value + (random() * 2 - 1) * 15), pose), goal);

      const solved = solveIk(start, effector, target);

      const error = targetError(solved, effector, target);
      expect(error.millimetres).toBeLessThan(1);
      expect(error.degrees).toBeLessThan(1);
      expect(withinLimits(solved)).toBe(true);
    }
  });

  it.each(EFFECTORS)('%s: follows a dragged target without jumping to another solution', effector => {
    const random = seededRandom(2);
    let pose = randomAngles(neutralPose(), chainOf(effector), random, 0.5);
    const step = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(0.01);
    const moved = (target: IkTarget, distance: THREE.Vector3) =>
      ({ ...target, position: new THREE.Vector3(...target.position).add(distance).toArray() });
    let target = readTarget(pose, effector);
    for (let i = 0; i < 25; i++) {
      const next = solveIk(pose, effector, moved(target, step), { positionOnly: true });
      // Near the edge of reach angles change quickly, but a jump would end up elsewhere than small steps do
      let fine = pose;
      for (let j = 1; j <= 10; j++) {
        fine = solveIk(fine, effector, moved(target, step.clone().multiplyScalar(j / 10)), { positionOnly: true });
      }
      // A (nearly) straight limb is singular: which way it starts bending again is path dependent there
      const nearlyStraight = next.angles[chainOf(effector)[1]].bend < 10;
      if (!nearlyStraight) expect(maxAngleChange(next, fine, chainOf(effector))).toBeLessThan(0.5);
      pose = next;
      target = moved(target, step);
    }
  });
});

describe('withPins', () => {
  const pinned = (pose: HumanPose, effectors: Effector[]): Pins =>
    Object.fromEntries(effectors.map(e => [e, readTarget(pose, e)]));

  const expectOnPins = (pose: HumanPose, pins: Pins) => {
    for (const [effector, target] of Object.entries(pins) as [Effector, IkTarget][]) {
      const error = targetError(pose, effector, target);
      expect(error.millimetres).toBeLessThan(1);
      expect(error.degrees).toBeLessThan(1);
    }
  };

  it('keeps pinned feet in place when the pelvis moves', () => {
    const pose = withAngle(withAngle(neutralPose(), 'left-knee', 'bend', 20), 'right-knee', 'bend', 20);
    const pins = pinned(pose, ['left-ankle', 'right-ankle']);
    const moved = withAngle({ ...pose, position: [0.05, pose.position[1] - 0.15, 0] }, 'root', 'pitch', 15);

    const result = withPins(pose, moved, pins);

    expectOnPins(result, pins);
    expect(result.position).toEqual(moved.position);
  });

  it('swivels the arm to keep a pinned hand when its upper arm is edited, keeping the edit', () => {
    const pose = withJoints(neutralPose(), { shoulder: { forward: 40, raise: 20 }, elbow: { bend: 70 } });
    const pins = pinned(pose, ['left-wrist']);
    const edited = withAngle(pose, 'left-shoulder', 'raise', 35);

    const result = withPins(pose, edited, pins);

    expectOnPins(result, pins);
    expect(result.angles['left-shoulder'].raise).toBeCloseTo(35, 6);
    expect(maxAngleChange(pose, result, ['left-elbow'])).toBeGreaterThan(1);
  });

  it('applies a preset as far as the pins allow, leaving unpinned limbs as in the preset', () => {
    const pose = neutralPose();
    const pins = pinned(pose, ['left-wrist']);
    const preset = withJoints(pose, { shoulder: { raise: 90 } });

    const result = withPins(pose, preset, pins);

    expectOnPins(result, pins);
    expect(result.angles['right-shoulder'].raise).toBe(90);
    // The pinned arm returns without twisting shoulder and forearm against each other
    expect(maxAngleChange(pose, result, ['left-shoulder', 'left-elbow'])).toBeLessThan(10);
  });

  it('mirrors pin targets relative to the body', () => {
    const symmetric = withJoints(
      withJoints({ ...neutralPose(), position: [0.3, 0.8, -0.2] }, { root: { turn: 40, pitch: 30 } }),
      { hip: { pike: 40, straddle: 20 }, knee: { bend: 50 }, shoulder: { raise: 70 }, elbow: { bend: 30 } },
    );
    for (const effector of EFFECTORS) {
      const mirrored = mirrorTarget(symmetric, readTarget(symmetric, effector));
      const error = targetError(symmetric, oppositeBone(effector) as Effector, mirrored);
      expect(error.millimetres).toBeLessThan(1e-6);
      expect(error.degrees).toBeLessThan(1e-6);
    }
  });
});
