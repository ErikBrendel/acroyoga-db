import { Node, Edge } from '@xyflow/react';
import { Pose, Transition } from '../types/data';

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

export function transformToGraph(poses: Pose[], transitions: Transition[]): GraphData {
  const nodes: Node[] = poses.map((pose, index) => {
    const angle = (index / poses.length) * 2 * Math.PI;
    const radius = 300;

    return {
      id: pose.id,
      type: 'pose',
      position: {
        x: Math.cos(angle) * radius + 400,
        y: Math.sin(angle) * radius + 300,
      },
      data: {
        label: pose.name || pose.id,
        isHanded: !!pose.mirroredPoseId,
      },
      style: {
        background: pose.mirroredPoseId ? '#93c5fd' : '#6366f1',
        color: 'white',
        border: '2px solid #1e40af',
        borderRadius: '50%',
        padding: '20px',
        fontSize: '14px',
        fontWeight: '500',
        width: '120px',
        height: '120px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      },
    };
  });

  const transitionEdges: Edge[] = transitions.map((transition) => {
    const isReversible = !transition.nonReversible;
    const color = isReversible ? '#10b981' : '#3b82f6';

    return {
      id: transition.id,
      source: transition.fromPoseId,
      target: transition.toPoseId,
      type: 'simplebezier',
      animated: false,
      style: {
        stroke: color,
        strokeWidth: 2,
      },
    };
  });

  const mirrorPairs = new Set<string>();
  const mirrorEdges: Edge[] = poses
    .filter((pose) => {
      if (!pose.mirroredPoseId) return false;

      const pairKey = [pose.id, pose.mirroredPoseId].sort().join('-');
      if (mirrorPairs.has(pairKey)) return false;

      mirrorPairs.add(pairKey);
      return true;
    })
    .map((pose) => ({
      id: `mirror-${pose.id}`,
      source: pose.id,
      target: pose.mirroredPoseId!,
      type: 'straight',
      animated: false,
      style: {
        stroke: '#94a3b8',
        strokeWidth: 2,
        strokeDasharray: '5,5',
      },
    }));

  const edges = [...transitionEdges, ...mirrorEdges];

  return { nodes, edges };
}
