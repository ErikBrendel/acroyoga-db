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
  useViewport,
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
  matchingPoseIds: Set<string> | undefined;
  onSelectPose: (poseId: string | null) => void;
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;
  isEditMode?: boolean;
}

function SelectionRings({ selectedPoseId, nodes }: { selectedPoseId: string | null; nodes: Node[] }) {
  const { x, y, zoom } = useViewport();
  const selectedNode = selectedPoseId ? nodes.find(n => n.id === selectedPoseId) : null;

  if (!selectedNode) return null;

  const centerX = selectedNode.position.x + 60;
  const centerY = selectedNode.position.y + 60;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 100,
      }}
    >
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        <circle cx={centerX} cy={centerY} r="70" fill="none" stroke="#3b82f6" strokeWidth={4} opacity="0.6" />
        <circle cx={centerX} cy={centerY} r="80" fill="none" stroke="#3b82f6" strokeWidth={4} opacity="0.4" />
        <circle cx={centerX} cy={centerY} r="90" fill="none" stroke="#3b82f6" strokeWidth={4} opacity="0.2" />
      </g>
    </svg>
  );
}

export function PoseGraph({ nodes, edges, selectedPoseId, activeFlow, matchingPoseIds, onSelectPose, onNodeDragStop, isEditMode = false }: PoseGraphProps) {
  const [localNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [localEdges, setEdges, onEdgesChange] = useEdgesState(edges);

  // Update local state when props change (e.g., when activeFlow changes)
  useEffect(() => {
    setNodes(nodes);
  }, [nodes, setNodes]);

  useEffect(() => {
    setEdges(edges);
  }, [edges, setEdges]);

  // Keep edge data.nodes in sync with current node positions (needed for SmartEdge path calculation)
  useEffect(() => {
    setEdges(edges => edges.map(edge => ({
      ...edge,
      data: { ...edge.data, nodes: localNodes },
    })));
  }, [localNodes, setEdges]);

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

  const MAX_MIRROR_DISTANCE = 400;

  const handleNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const mirroredPoseId = node.data?.mirroredPoseId;
      if (!mirroredPoseId) return;

      const mirrorNode = localNodes.find(n => n.id === mirroredPoseId);
      if (!mirrorNode) return;

      const dx = node.position.x - mirrorNode.position.x;
      const dy = node.position.y - mirrorNode.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > MAX_MIRROR_DISTANCE) {
        const angle = Math.atan2(dy, dx);
        const newMirrorX = node.position.x - Math.cos(angle) * MAX_MIRROR_DISTANCE;
        const newMirrorY = node.position.y - Math.sin(angle) * MAX_MIRROR_DISTANCE;

        setNodes(nodes =>
          nodes.map(n =>
            n.id === mirroredPoseId
              ? { ...n, position: { x: newMirrorX, y: newMirrorY } }
              : n
          )
        );
      }
    },
    [localNodes, setNodes]
  );

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onNodeDragStop) {
        onNodeDragStop(node.id, node.position);

        const mirroredPoseId = node.data?.mirroredPoseId;
        if (mirroredPoseId) {
          const mirrorNode = localNodes.find(n => n.id === mirroredPoseId);
          if (mirrorNode) {
            onNodeDragStop(mirrorNode.id, mirrorNode.position);
          }
        }
      }
    },
    [onNodeDragStop, localNodes]
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
    const isSearchMatch = matchingPoseIds ? matchingPoseIds.has(node.id) : false;
    const baseStyle = node.style || {};

    // Build combined filter with glows (no selected glow - using SVG circles instead)
    const filters: string[] = [];

    if (isSearchMatch) {
      // Green glow for search match
      filters.push('drop-shadow(0 0 30px #10b981) drop-shadow(0 0 50px #059669)');
    }

    if (isInFlow) {
      // Amber glow for flow
      filters.push('drop-shadow(0 0 8px #fbbf24) drop-shadow(0 0 12px #f59e0b)');
    }

    return {
      ...node,
      style: {
        ...baseStyle,
        filter: filters.length > 0 ? filters.join(' ') : undefined,
      },
    };
  });

  const highlightedEdges = localEdges.map((edge) => {
    const isInFlow = flowEdges.has(edge.id);
    const isMirrorEdge = edge.id.startsWith('mirror-');
    const baseStyle = edge.style || {};

    let opacity = 1;
    if (selectedPoseId && !isMirrorEdge) {
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
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={isEditMode}
        nodesConnectable={false}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => (node.style?.background as string) ?? '#9ca3af'}
          nodeComponent={({ x, y, width, height, color }) => (
            <circle cx={x + width / 2} cy={y + height / 2} r={Math.min(width, height) / 2} fill={color} />
          )}
        />
        <SelectionRings selectedPoseId={selectedPoseId} nodes={localNodes} />
      </ReactFlow>
    </div>
  );
}
