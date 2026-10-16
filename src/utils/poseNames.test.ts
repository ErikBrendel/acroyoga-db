import { describe, expect, it } from 'vitest';
import { Pose } from '../types/data';
import { matchedAlias, searchPoses, sharedNames } from './poseNames';

const poses: Pose[] = [
  { id: 'bird', name: 'Bird', difficulty: 'easy' },
  { id: 'front-plank', name: 'Front Plank', aliases: ['bird'], difficulty: 'easy' },
  { id: 'floating-paschi', name: 'Floating Paschi', aliases: ['Teardrop'], difficulty: 'intermediate' },
  { id: 'star-left', name: 'Star (Left)', aliases: ['Ninja Star'], mirroredPoseId: 'star-right', difficulty: 'easy' },
  { id: 'star-right', name: 'Star (Right)', aliases: ['Ninja Star'], mirroredPoseId: 'star-left', difficulty: 'easy' },
];

describe('searchPoses', () => {
  it('finds poses by alias', () => {
    expect(searchPoses(poses, 'tear').map(p => p.id)).toEqual(['floating-paschi']);
    expect(searchPoses(poses, 'bird').map(p => p.id)).toEqual(['bird', 'front-plank']);
  });
});

describe('matchedAlias', () => {
  it('names the alias only when the main name does not match', () => {
    expect(matchedAlias(poses[1], 'bird')).toBe('bird');
    expect(matchedAlias(poses[0], 'bird')).toBeUndefined();
  });
});

describe('sharedNames', () => {
  it('lists other poses using one of the names, ignoring the mirrored pose', () => {
    expect(sharedNames(poses[1], poses)).toEqual([{ name: 'bird', others: [poses[0]] }]);
    expect(sharedNames(poses[0], poses)).toEqual([{ name: 'Bird', others: [poses[1]] }]);
    expect(sharedNames(poses[3], poses)).toEqual([]);
  });
});
