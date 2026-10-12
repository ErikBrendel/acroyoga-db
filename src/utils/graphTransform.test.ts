import { describe, expect, it } from 'vitest';
import { Pose, Transition } from '../types/data';
import { collapseMirroredPoses, transformToGraph } from './graphTransform';

const poses: Pose[] = [
  { id: 'star-left', name: 'Star (Left)', mirroredPoseId: 'star-right', difficulty: 'easy', position: { x: 0, y: 0 } },
  { id: 'star-right', name: 'Star (Right)', mirroredPoseId: 'star-left', difficulty: 'easy', position: { x: 100, y: 40 } },
  { id: 'bird', difficulty: 'easy', position: { x: 50, y: 300 } },
];
const transitions: Transition[] = [
  { fromPoseId: 'bird', toPoseId: 'star-left', difficulty: 'easy' },
  { fromPoseId: 'star-right', toPoseId: 'bird', difficulty: 'easy' },
  { fromPoseId: 'star-left', toPoseId: 'star-right', difficulty: 'easy' },
];

describe('collapseMirroredPoses', () => {
  const { nodes, edges, nodeIdOf } = collapseMirroredPoses(transformToGraph(poses, transitions), poses);

  it('merges a mirrored pair into one node between both', () => {
    expect(nodes.map(n => n.id)).toEqual(['star-left', 'bird']);
    expect(nodes[0].position).toEqual({ x: 50, y: 20 });
    expect(nodes[0].data.label).toBe('Star (Left/Right)');
    expect(nodeIdOf('star-right')).toBe('star-left');
  });

  it('keeps one edge per merged transition and drops the ones within a pair', () => {
    expect(edges.map(e => e.id)).toEqual(['bird-to-star-left']);
  });
});
