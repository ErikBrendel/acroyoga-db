import { useState } from 'react';
import { Flow, Pose, Transition } from '../types/data';
import { getFlowVariants, getFlowVariantKey } from '../utils/flowMirror';
import { calculateFlowDifficulty } from '../utils/flowDifficulty';
import { StarDifficulty } from './StarDifficulty';

interface FlowsListProps {
  flows: Flow[];
  poses: Pose[];
  transitions: Transition[];
  activeFlowName: string | null;
  onFlowClick: (flowName: string) => void;
}

export function FlowsList({ flows, poses, transitions, activeFlowName, onFlowClick }: FlowsListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (flows.length === 0) {
    return null;
  }

  return (
    <div className="bg-white shadow-lg rounded-lg border border-gray-200 w-full md:w-64">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left font-semibold text-gray-900 hover:bg-gray-50"
      >
        <span>Flows ({flows.length})</span>
        <span className="text-gray-500">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200">
          {flows.slice().sort((a, b) => a.name.localeCompare(b.name)).map((flow) => {
            const variants = getFlowVariants(flow, poses);
            const hasMirror = variants.length > 1;
            const difficulty = calculateFlowDifficulty(flow, poses, transitions);

            return (
              <div key={flow.name} className="border-b border-gray-100 last:border-b-0">
                <div className="flex items-stretch">
                  <button
                    onClick={() => onFlowClick(getFlowVariantKey(flow.name, false))}
                    className={`flex-1 px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                      activeFlowName === getFlowVariantKey(flow.name, false)
                        ? 'bg-yellow-50 text-yellow-900 font-medium border-l-4 border-yellow-500'
                        : 'text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{flow.name}</span>
                      <span className="text-xs text-gray-500">({flow.poseIds.length})</span>
                      <StarDifficulty rating={difficulty} />
                    </div>
                  </button>
                  {hasMirror && (
                    <button
                      onClick={() => onFlowClick(getFlowVariantKey(flow.name, true))}
                      className={`px-3 py-2 text-xs font-medium border-l border-gray-200 hover:bg-gray-50 transition-colors ${
                        activeFlowName === getFlowVariantKey(flow.name, true)
                          ? 'bg-yellow-50 text-yellow-900 border-l-yellow-300'
                          : 'text-gray-500'
                      }`}
                      title="Mirrored variant"
                    >
                      ⇄
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
