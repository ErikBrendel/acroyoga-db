import { useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PoseNode } from './PoseNode';
import { Flow } from '../types/data';

interface PoseGraphProps {
  nodes: Node[];
  edges: Edge[];
  selectedPoseId: string | null;
  activeFlow: Flow | null;
  onSelectPose: (poseId: string | null) => void;
}

export function PoseGraph({ nodes, edges, selectedPoseId, activeFlow, onSelectPose }: PoseGraphProps) {
  const [localNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [localEdges, setEdges, onEdgesChange] = useEdgesState(edges);

  // Update local state when props change (e.g., when activeFlow changes)
  useEffect(() => {
    setNodes(nodes);
  }, [nodes, setNodes]);

  useEffect(() => {
    setEdges(edges);
  }, [edges, setEdges]);

  const nodeTypes = useMemo(() => ({ pose: PoseNode }), []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectPose(node.id);
    },
    [onSelectPose]
  );

  const onPaneClick = useCallback(() => {
    onSelectPose(null);
  }, [onSelectPose]);

  const flowPoseIds = useMemo(() => new Set(activeFlow?.poseIds || []), [activeFlow]);

  const flowEdges = useMemo(() => {
    const edges = new Set<string>();
    if (activeFlow) {
      for (let i = 0; i < activeFlow.poseIds.length - 1; i++) {
        const from = activeFlow.poseIds[i];
        const to = activeFlow.poseIds[i + 1];
        edges.add(`${from}-to-${to}`);
        edges.add(`${to}-to-${from}`); // For reversible transitions
      }
    }
    return edges;
  }, [activeFlow]);

  const highlightedNodes = localNodes.map((node) => {
    const isInFlow = flowPoseIds.has(node.id);
    const baseStyle = node.style || {};

    return {
      ...node,
      style: {
        ...baseStyle,
        opacity: selectedPoseId && node.id !== selectedPoseId ? 0.5 : 1,
        filter: isInFlow ? 'drop-shadow(0 0 8px #fbbf24) drop-shadow(0 0 12px #f59e0b)' : undefined,
      },
    };
  });

  const highlightedEdges = localEdges.map((edge) => {
    const isInFlow = flowEdges.has(edge.id);
    const baseStyle = edge.style || {};

    return {
      ...edge,
      style: {
        ...baseStyle,
        filter: isInFlow ? 'drop-shadow(0 0 3px #fbbf24) drop-shadow(0 0 6px #f59e0b)' : undefined,
        strokeWidth: isInFlow ? 3 : baseStyle.strokeWidth,
      },
    };
  });

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={highlightedNodes}
        edges={highlightedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        nodesDraggable={true}
        nodesConnectable={false}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
