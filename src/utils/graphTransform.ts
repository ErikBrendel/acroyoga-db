import { Node, Edge } from '@xyflow/react';
import { Pose, Transition } from '../types/data';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force';

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

interface D3Node extends SimulationNodeDatum {
  id: string;
}

export function transformToGraph(poses: Pose[], transitions: Transition[]): GraphData {
  const d3Nodes: D3Node[] = poses.map((pose) => ({
    id: pose.id,
  }));

  const transitionLinks: SimulationLinkDatum<D3Node>[] = transitions.map((t) => ({
    source: t.fromPoseId,
    target: t.toPoseId,
  }));

  const mirrorLinks: SimulationLinkDatum<D3Node>[] = poses
    .filter((p) => p.mirroredPoseId)
    .filter((p, i, arr) => {
      const pairKey = [p.id, p.mirroredPoseId!].sort().join('-');
      return arr.findIndex((x) => {
        const key = [x.id, x.mirroredPoseId!].sort().join('-');
        return key === pairKey;
      }) === i;
    })
    .map((p) => ({
      source: p.id,
      target: p.mirroredPoseId!,
    }));

  const d3Links = [...transitionLinks, ...mirrorLinks];

  const simulation = forceSimulation(d3Nodes)
    .force(
      'link',
      forceLink(d3Links)
        .id((d: any) => d.id)
        .distance((link: any) => {
          // Mirror links: shorter distance to pull them closer
          const isMirror = mirrorLinks.some(
            ml => (ml.source === link.source.id || ml.source === link.source) &&
                  (ml.target === link.target.id || ml.target === link.target)
          );
          return isMirror ? 120 : 200;
        })
        .strength((link: any) => {
          // Mirror links: stronger force
          const isMirror = mirrorLinks.some(
            ml => (ml.source === link.source.id || ml.source === link.source) &&
                  (ml.target === link.target.id || ml.target === link.target)
          );
          return isMirror ? 0.8 : 0.5;
        })
    )
    .force('charge', forceManyBody().strength(-1000))
    .force('center', forceCenter(400, 300))
    .force('collide', forceCollide(80))
    .stop();

  for (let i = 0; i < 1000; i++) {
    simulation.tick();
  }

  const nodes: Node[] = poses.map((pose) => {
    const d3Node = d3Nodes.find((n) => n.id === pose.id)!;

    return {
      id: pose.id,
      type: 'pose',
      position: {
        x: d3Node.x || 0,
        y: d3Node.y || 0,
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
    const edgeId = `${transition.fromPoseId}-to-${transition.toPoseId}`;
    const color = isReversible ? '#10b981' : '#3b82f6';

    return {
      id: edgeId,
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
