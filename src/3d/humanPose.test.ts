import { describe, expect, it } from 'vitest';
import { lerpHumanPose, mirrorHumanPose, neutralPose, parseHumanPose, serializeHumanPose, symmetrized, withJoints } from './humanPose';
import { ALL_BONES, oppositeBone } from './skeleton';
import { boneEnd, randomPose, seededRandom } from './testHelpers';

describe('stored pose format', () => {
  const stored = {
    position: [0, 0.97, 0],
    joints: { root: { pitch: -90 }, hip: { pike: 90, straddle: { left: 10, right: 30 } } },
  };

  it('omits zero angles and uses the shorthand only where both sides agree', () => {
    const pose = withJoints(neutralPose(), { hip: { pike: 90, straddle: { left: 10, right: 30 }, rotate: 0 }, root: { pitch: -90 } });
    expect(serializeHumanPose(pose)).toEqual(stored);
  });

  it('round-trips through parsing', () => {
    expect(serializeHumanPose(parseHumanPose(stored))).toEqual(stored);
  });

  it('rejects unknown angles', () => {
    expect(() => parseHumanPose({ position: [0, 1, 0], joints: { knee: { wobble: 3 } } })).toThrow('Unknown angle "wobble"');
  });
});

describe('mirrorHumanPose', () => {
  it('produces the mirror image of the whole body', () => {
    const random = seededRandom(3);
    for (let i = 0; i < 20; i++) {
      const pose = { ...randomPose(random), position: [0.3, 1, -0.2] as [number, number, number] };
      const mirrored = mirrorHumanPose(pose);
      for (const { key } of ALL_BONES) {
        const expected = boneEnd(pose, oppositeBone(key) ?? key);
        expected.x *= -1;
        expect(boneEnd(mirrored, key).distanceTo(expected)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('symmetrized', () => {
  it('copies the source side and straightens the spine, keeping the root', () => {
    const pose = withJoints(neutralPose(), {
      root: { turn: 30, roll: 10 }, chest: { bend: 20, twist: 15 }, hip: { pike: { left: 40, right: 10 } }, shoulder: { raise: { left: 0, right: 70 } },
    });
    expect(serializeHumanPose(symmetrized(pose, 'right')).joints).toEqual({
      root: { turn: 30, roll: 10 }, chest: { bend: 20 }, hip: { pike: 10 }, shoulder: { raise: 70 },
    });
  });
});

describe('lerpHumanPose', () => {
  it('moves angles and position in a straight line, unbounded angles the shorter way round', () => {
    const from = { ...withJoints(neutralPose(), { root: { turn: 170 }, knee: { bend: 20 } }), position: [0, 1, 0] as [number, number, number] };
    const to = { ...withJoints(neutralPose(), { root: { turn: -170 }, knee: { bend: 60 } }), position: [1, 1, 0] as [number, number, number] };
    const middle = lerpHumanPose(from, to, 0.5);
    expect(middle.angles.root.turn).toBeCloseTo(180);
    expect(middle.angles['left-knee'].bend).toBeCloseTo(40);
    expect(middle.position).toEqual([0.5, 1, 0]);
  });
});
