import { NodeProps, Handle, Position } from '@xyflow/react';

export function PoseNode({ data }: NodeProps) {
  return (
    <div className="pose-node">
      <Handle
        type="source"
        position={Position.Top}
        isConnectable={false}
        style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ opacity: 0, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      {String(data.label)}
    </div>
  );
}
