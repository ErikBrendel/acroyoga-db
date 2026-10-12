import { describe, expect, it } from 'vitest';
import { createBones } from './Bone';
import { HumanPose, neutralPose, withAngle } from './humanPose';
import { BoneKey, Side, boneKey } from './skeleton';
import { boneEnd, jointPosition, randomPose, seededRandom, worldDirection } from './testHelpers';
import { parentAngles } from './ik';

// The person faces +Z, their left is +X. `outward` is +1 for the left side and -1 for the right side.
const limbCases: [string, string, string, number, (pose: HumanPose, side: Side, outward: number) => boolean][] = [
  ['pike moves the leg forward', 'hip', 'pike', 90, (p, s) => jointPosition(p, boneKey('ankle', s)).z > 0.5],
  ['straddle moves the leg outward', 'hip', 'straddle', 45, (p, s, o) => o * jointPosition(p, boneKey('knee', s)).x > 0.3],
  ['knee bend moves the shin backward', 'knee', 'bend', 90, (p, s) => jointPosition(p, boneKey('ankle', s)).z < -0.3],
  ['turn points the toes outward', 'ankle', 'turn', 25, (p, s, o) => o * (boneEnd(p, boneKey('ankle', s)).x - jointPosition(p, boneKey('ankle', s)).x) > 0.05],
  ['point moves the toes down', 'ankle', 'point', 45, (p, s) => boneEnd(p, boneKey('ankle', s)).y < jointPosition(p, boneKey('ankle', s)).y - 0.1],
  ['protract moves the shoulder forward', 'clavicle', 'protract', 20, (p, s) => jointPosition(p, boneKey('shoulder', s)).z > 0.05],
  // The arm keeps hanging
  ['elevate keeps the arm orientation', 'clavicle', 'elevate', 30, (p, s) => worldDirection(p, boneKey('shoulder', s), [0, 1, 0]).y < -0.999],
  ['elevate moves the shoulder up', 'clavicle', 'elevate', 30, (p, s) => jointPosition(p, boneKey('shoulder', s)).y > jointPosition(neutralPose(), boneKey('shoulder', s)).y + 0.07],
  ['forward moves the arm forward', 'shoulder', 'forward', 90, (p, s) => jointPosition(p, boneKey('elbow', s)).z > 0.25],
  ['raise moves the arm outward', 'shoulder', 'raise', 90, (p, s, o) => o * jointPosition(p, boneKey('elbow', s)).x > 0.45],
  ['elbow bend moves the forearm forward', 'elbow', 'bend', 90, (p, s) => jointPosition(p, boneKey('wrist', s)).z > 0.2],
  // The palm faces the body in the standing pose: local +X on the left, mirrored to -X on the right
  ['elbow rotate turns the palm forward', 'elbow', 'rotate', 90, (p, s, o) => worldDirection(p, boneKey('wrist', s), [o, 0, 0]).z > 0.9],
  ['wrist flex bends towards the palm', 'wrist', 'flex', 45, (p, s, o) => o * (boneEnd(p, boneKey('wrist', s)).x - jointPosition(p, boneKey('wrist', s)).x) < -0.1],
];

const centerCases: [string, BoneKey, string, number, (pose: HumanPose) => boolean][] = [
  ['root pitch leans forward', 'root', 'pitch', 45, p => boneEnd(p, 'chest').z > 0.2],
  ['root roll leans left', 'root', 'roll', 30, p => boneEnd(p, 'chest').x > 0.1],
  ['waist bend bends forward', 'waist', 'bend', 45, p => boneEnd(p, 'chest').z > 0.2],
  ['chest twist turns left', 'chest', 'twist', 40, p => worldDirection(p, 'chest', [0, 0, 1]).x > 0.5],
  ['neck turn looks left', 'neck', 'turn', 45, p => worldDirection(p, 'neck', [0, 0, 1]).x > 0.5],
  ['neck nod looks down', 'neck', 'nod', 45, p => worldDirection(p, 'neck', [0, 0, 1]).y < -0.5],
];

describe('angle conventions', () => {
  it('stands upright on the floor in the neutral pose', () => {
    const pose = neutralPose();
    expect(jointPosition(pose, 'left-ankle').y).toBeCloseTo(0.05, 2);
    expect(boneEnd(pose, 'neck').y).toBeCloseTo(1.7, 1);
    expect(boneEnd(pose, 'left-ankle').z).toBeGreaterThan(0.15);
  });

  for (const side of ['left', 'right'] as const) {
    it.each(limbCases)(`${side}: %s`, (_, joint, angle, value, check) => {
      const pose = withAngle(neutralPose(), boneKey(joint as never, side), angle, value);
      expect(check(pose, side, side === 'left' ? 1 : -1)).toBe(true);
    });
  }

  it.each(centerCases)('%s', (_, key, angle, value, check) => {
    expect(check(withAngle(neutralPose(), key, angle, value))).toBe(true);
  });
});

describe('Bone.anglesFromQuaternion', () => {
  it('recovers the angles of a rotation, also when the current angles are a bit off', () => {
    const bones = createBones();
    const random = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      const pose = randomPose(random);
      for (const bone of Object.values(bones).filter(b => b.angles.length === 3)) {
        const angles = pose.angles[bone.key];
        const current = Object.fromEntries(Object.entries(angles).map(([name, v]) => [name, v + (random() - 0.5) * 10]));
        const parent = parentAngles(pose.angles, bone.key);
        const recovered = bone.anglesFromQuaternion(bone.quaternionFor(angles, parent), current, parent);
        // Near ±90° in the middle axis the outer angles become interchangeable; only the rotation is unique then
        const nearGimbalLock = Math.abs(Math.abs(angles[bone.angles[1].name]) - 90) < 5;
        if (nearGimbalLock) {
          expect(bone.quaternionFor(recovered, parent).angleTo(bone.quaternionFor(angles, parent))).toBeLessThan(1e-3);
          continue;
        }
        for (const { name } of bone.angles) expect(recovered[name]).toBeCloseTo(angles[name], 6);
      }
    }
  });
});
