import { useState } from 'react';
import { Flow } from '../types/data';

interface FlowsListProps {
  flows: Flow[];
  activeFlowName: string | null;
  onFlowClick: (flowName: string) => void;
}

export function FlowsList({ flows, activeFlowName, onFlowClick }: FlowsListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (flows.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-20 z-10 bg-white shadow-lg rounded-lg border border-gray-200 w-64">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left font-semibold text-gray-900 hover:bg-gray-50"
      >
        <span>Flows ({flows.length})</span>
        <span className="text-gray-500">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200">
          {flows.slice().sort((a, b) => a.name.localeCompare(b.name)).map((flow) => (
            <button
              key={flow.name}
              onClick={() => onFlowClick(flow.name)}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                activeFlowName === flow.name
                  ? 'bg-yellow-50 text-yellow-900 font-medium border-l-4 border-yellow-500'
                  : 'text-gray-700'
              }`}
            >
              {flow.name}
              <span className="text-xs text-gray-500 ml-2">({flow.poseIds.length} poses)</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
