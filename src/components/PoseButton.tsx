import {useState} from 'react';
import {isLocalEditMode} from '../utils/editMode';
import {TransitionDifficulty} from '../types/data';
import {getTransitionColor} from '../utils/difficultyColors';

interface PoseButtonProps {
  poseId: string;
  poseName: string | undefined;
  direction: 'bidirectional' | 'to' | 'from';
  difficulty: TransitionDifficulty;
  transitionName?: string;
  onSelectPose: (poseId: string) => void;
  onDelete?: () => void;
  onDifficultyChange?: (difficulty: TransitionDifficulty) => void;
  onNameChange?: (name: string) => void;
}

export function PoseButton({ poseId, poseName, direction, difficulty, transitionName, onSelectPose, onDelete, onDifficultyChange, onNameChange }: PoseButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const symbols = {
    bidirectional: '↔',
    to: '→',
    from: '←',
  };

  const difficultyColor = getTransitionColor(difficulty);

  const handleDelete = () => {
    if (showConfirm && onDelete) {
      onDelete();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
    }
  };

  return (
    <div className={`border-l-4 pl-3 py-2 ${showConfirm ? 'bg-red-50' : ''}`} style={{ borderColor: difficultyColor }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <button
            onClick={() => onSelectPose(poseId)}
            className="hover:underline font-medium text-left block"
            style={{ color: difficultyColor }}
          >
            {symbols[direction]} {poseName || poseId}
          </button>
          {transitionName && (
            <div className="text-xs text-gray-600 italic ml-4">
              {transitionName}
            </div>
          )}
          {isLocalEditMode() && onNameChange && (
            <input
              type="text"
              value={transitionName || ''}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Transition name (optional)"
              className="w-full mt-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
        {isLocalEditMode() && onDifficultyChange && (
          <select
            value={difficulty}
            onChange={(e) => onDifficultyChange(e.target.value as TransitionDifficulty)}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="trivial">Trivial</option>
            <option value="easy">Easy</option>
            <option value="intermediate">Intermediate</option>
            <option value="hard">Hard</option>
          </select>
        )}
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