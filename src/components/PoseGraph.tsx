import { useCallback, useMemo } from 'react';
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

interface PoseGraphProps {
  nodes: Node[];
  edges: Edge[];
  selectedPoseId: string | null;
  onSelectPose: (poseId: string | null) => void;
}

export function PoseGraph({ nodes, edges, selectedPoseId, onSelectPose }: PoseGraphProps) {
  const [localNodes, , onNodesChange] = useNodesState(nodes);
  const [localEdges, , onEdgesChange] = useEdgesState(edges);

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

  const highlightedNodes = localNodes.map((node) => ({
    ...node,
    style: {
      ...node.style,
      opacity: selectedPoseId && node.id !== selectedPoseId ? 0.5 : 1,
    },
  }));

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={highlightedNodes}
        edges={localEdges}
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
