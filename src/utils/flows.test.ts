import { describe, expect, it } from 'vitest';
import { Pose, Transition } from '../types/data';
import { importName, nextPoses, parseSharedFlow } from './flows';

const poses: Pose[] = [
  { id: 'bird', difficulty: 'easy' },
  { id: 'throne', difficulty: 'easy' },
  { id: 'whale', difficulty: 'intermediate' },
];

describe('nextPoses', () => {
  it('follows reversible transitions both ways and one-way ones forwards only', () => {
    const transitions: Transition[] = [
      { fromPoseId: 'bird', toPoseId: 'throne', difficulty: 'easy' },
      { fromPoseId: 'whale', toPoseId: 'throne', difficulty: 'easy', nonReversible: true },
    ];
    expect(nextPoses('throne', transitions).map(n => n.poseId)).toEqual(['bird']);
    expect(nextPoses('whale', transitions).map(n => n.poseId)).toEqual(['throne']);
  });
});

describe('parseSharedFlow', () => {
  it('reads name and steps, rejecting unknown poses', () => {
    expect(parseSharedFlow(new URLSearchParams('shared=Sunday&steps=bird,throne'), poses))
      .toEqual({ name: 'Sunday', poseIds: ['bird', 'throne'] });
    expect(parseSharedFlow(new URLSearchParams('shared=Sunday&steps=bird,nope'), poses)).toBeNull();
  });
});

describe('importName', () => {
  const own = [{ name: 'Sunday', poseIds: ['bird', 'throne'] }];

  it('skips a flow whose steps are already there and renames one whose name is taken', () => {
    expect(importName({ name: 'From Anna', poseIds: ['bird', 'throne'] }, own)).toBeNull();
    expect(importName({ name: 'Sunday', poseIds: ['bird', 'whale'] }, own)).toBe('Sunday (2)');
    expect(importName({ name: 'Monday', poseIds: ['bird', 'whale'] }, own)).toBe('Monday');
  });
});
