import {useState} from 'react';
import {isLocalEditMode} from '../utils/editMode';

interface PoseButtonProps {
  poseId: string;
  poseName: string | undefined;
  direction: 'bidirectional' | 'to' | 'from';
  onSelectPose: (poseId: string) => void;
  onDelete?: () => void;
}

export function PoseButton({ poseId, poseName, direction, onSelectPose, onDelete }: PoseButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
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

  const handleDelete = () => {
    if (showConfirm && onDelete) {
      onDelete();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
    }
  };

  return (
    <div className={`border-l-4 ${borderColors[direction]} pl-3 py-2 ${showConfirm ? 'bg-red-50' : ''}`}>
      <div className="flex items-center justify-between">
        <button
          onClick={() => onSelectPose(poseId)}
          className={`${colors[direction]} hover:underline font-medium text-left flex-1`}
        >
          {symbols[direction]} {poseName || poseId}
        </button>
        {isLocalEditMode() && onDelete && (
          <div className="ml-2 flex items-center gap-1">
            {showConfirm ? (
              <>
                <button
                  onClick={handleDelete}
                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={handleDelete}
                className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors"
                title="Delete transition"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}