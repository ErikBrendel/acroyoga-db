import { Pose, Transition } from '../types/data';
import { getTransitionColor } from '../utils/difficultyColors';
import { transitionBetween } from '../utils/flows';
import { poseName } from '../utils/poseNames';
import { DifficultyBadge } from './DifficultyBadge';

interface FlowStepsProps {
  poseIds: string[];
  poses: Pose[];
  transitions: Transition[];
  onSelectPose: (poseId: string) => void;
  onRemoveStep?: (index: number) => void;
}

export function FlowSteps({ poseIds, poses, transitions, onSelectPose, onRemoveStep }: FlowStepsProps) {
  return (
    <ol>
      {poseIds.map((poseId, i) => {
        const pose = poses.find(p => p.id === poseId);
        const transition = i > 0 ? transitionBetween(poseIds[i - 1], poseId, transitions) : undefined;
        return (
          <li key={i}>
            {i > 0 && (
              <div className="ml-5 pl-4 border-l-2 border-gray-200 py-1 text-xs">
                {transition ? (
                  <span style={{ color: getTransitionColor(transition.difficulty) }}>
                    {transition.name ?? 'Transition'}, {transition.difficulty}
                  </span>
                ) : (
                  <span className="text-amber-700">No known transition</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectPose(poseId)}
                className="flex-1 flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-left hover:border-blue-400"
              >
                <span className="w-6 text-sm text-gray-400">{i + 1}</span>
                <span className="flex-1 font-medium text-gray-900">{pose ? poseName(pose) : poseId}</span>
                {pose && <DifficultyBadge difficulty={pose.difficulty} />}
              </button>
              {onRemoveStep && (
                <button onClick={() => onRemoveStep(i)} className="px-2 text-gray-400 hover:text-red-600 text-lg" title="Remove step">
                  ×
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
