interface PoseButtonProps {
  poseId: string;
  poseName: string | undefined;
  direction: 'bidirectional' | 'to' | 'from';
  onSelectPose: (poseId: string) => void;
}

export function PoseButton({ poseId, poseName, direction, onSelectPose }: PoseButtonProps) {
  const symbols = {
    bidirectional: '↔',
    to: '→',
    from: '←',
  };

  const colors = {
    bidirectional: 'text-green-600 hover:text-green-800',
    to: 'text-blue-600 hover:text-blue-800',
    from: 'text-blue-600 hover:text-blue-800',
  };

  const borderColors = {
    bidirectional: 'border-green-500',
    to: 'border-blue-500',
    from: 'border-blue-500',
  };

  return (
    <div className={`border-l-4 ${borderColors[direction]} pl-3 py-2`}>
      <button
        onClick={() => onSelectPose(poseId)}
        className={`${colors[direction]} hover:underline font-medium text-left`}
      >
        {symbols[direction]} {poseName || poseId}
      </button>
    </div>
  );
}