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
import { SmartEdge } from './SmartEdge';
import { Flow } from '../types/data';

interface PoseGraphProps {
  nodes: Node[];
  edges: Edge[];
  selectedPoseId: string | null;
  activeFlow: Flow | null;
  onSelectPose: (poseId: string | null) => void;
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;
}

export function PoseGraph({ nodes, edges, selectedPoseId, activeFlow, onSelectPose, onNodeDragStop }: PoseGraphProps) {
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
  const edgeTypes = useMemo(() => ({ smart: SmartEdge }), []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectPose(node.id);
    },
    [onSelectPose]
  );

  const onPaneClick = useCallback(() => {
    onSelectPose(null);
  }, [onSelectPose]);

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onNodeDragStop) {
        onNodeDragStop(node.id, node.position);
      }
    },
    [onNodeDragStop]
  );

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

  const connectedNodeIds = useMemo(() => {
    if (!selectedPoseId) return new Set<string>();
    const connected = new Set<string>();
    localEdges.forEach((edge) => {
      if (edge.source === selectedPoseId) {
        connected.add(edge.target);
      }
      if (edge.target === selectedPoseId) {
        connected.add(edge.source);
      }
    });
    return connected;
  }, [selectedPoseId, localEdges]);

  const connectedEdgeIds = useMemo(() => {
    if (!selectedPoseId) return new Set<string>();
    const connected = new Set<string>();
    localEdges.forEach((edge) => {
      if (edge.source === selectedPoseId || edge.target === selectedPoseId) {
        connected.add(edge.id);
      }
    });
    return connected;
  }, [selectedPoseId, localEdges]);

  const highlightedNodes = localNodes.map((node) => {
    const isInFlow = flowPoseIds.has(node.id);
    const baseStyle = node.style || {};

    let opacity = 1;
    if (selectedPoseId && node.id !== selectedPoseId) {
      opacity = connectedNodeIds.has(node.id) ? 0.6 : 0.25;
    }

    return {
      ...node,
      style: {
        ...baseStyle,
        opacity,
        filter: isInFlow ? 'drop-shadow(0 0 8px #fbbf24) drop-shadow(0 0 12px #f59e0b)' : undefined,
      },
    };
  });

  const highlightedEdges = localEdges.map((edge) => {
    const isInFlow = flowEdges.has(edge.id);
    const baseStyle = edge.style || {};

    let opacity = 1;
    if (selectedPoseId) {
      opacity = connectedEdgeIds.has(edge.id) ? 0.6 : 0.2;
    }

    return {
      ...edge,
      style: {
        ...baseStyle,
        opacity,
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
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
