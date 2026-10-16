import { Flow, Pose, Transition } from '../types/data';
import { setUrlParams } from '../hooks/useUrlState';
import { FlowSteps } from '../components/FlowSteps';
import { StarDifficulty } from '../components/StarDifficulty';
import { calculateFlowDifficulty } from '../utils/flowDifficulty';
import { getFlowVariantKey, hasFlowMirrorVariant, parseFlowVariantKey } from '../utils/flowMirror';
import { ResolvedFlow } from '../utils/flows';
import { goTo } from '../utils/navigation';

interface FlowsViewProps {
  flows: Flow[];
  poses: Pose[];
  transitions: Transition[];
  activeFlow: ResolvedFlow | null;
  onSelectPose: (poseId: string) => void;
  onEditFlow?: (flow: Flow) => void;
}

const openFlow = (key: string | null) => setUrlParams({ flow: key }, true);

export function FlowsView({ flows, poses, transitions, activeFlow, onSelectPose, onEditFlow }: FlowsViewProps) {
  if (activeFlow) {
    const { flowName, isMirrored } = parseFlowVariantKey(activeFlow.key);
    const builtIn = !activeFlow.isOwn ? flows.find(f => f.name === flowName) : undefined;
    return (
      <div className="max-w-2xl mx-auto px-4 py-4">
        <button onClick={() => openFlow(null)} className="text-sm text-blue-600 hover:underline">← All flows</button>
        <div className="flex items-center gap-3 mt-2">
          <h2 className="text-2xl font-bold text-gray-900">{activeFlow.name}{isMirrored && ' (mirrored)'}</h2>
          <StarDifficulty rating={calculateFlowDifficulty(activeFlow, poses, transitions)} />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => goTo('map', { flow: activeFlow.key })} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
            Show on map
          </button>
          {builtIn && hasFlowMirrorVariant(builtIn, poses) && (
            <button onClick={() => openFlow(getFlowVariantKey(builtIn.name, !isMirrored))} className="px-3 py-1.5 bg-gray-100 rounded text-sm font-medium">
              ⇄ {isMirrored ? 'Original' : 'Mirrored'}
            </button>
          )}
          {builtIn && onEditFlow && (
            <button onClick={() => onEditFlow(builtIn)} className="px-3 py-1.5 bg-gray-100 rounded text-sm font-medium">✏️ Edit</button>
          )}
        </div>
        <div className="mt-4">
          <FlowSteps poseIds={activeFlow.poseIds} poses={poses} transitions={transitions} onSelectPose={onSelectPose} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <FlowList title="Flows" flows={flows} keyOf={f => f.name} poses={poses} transitions={transitions} />
    </div>
  );
}

interface FlowListProps {
  title: string;
  flows: Flow[];
  keyOf: (flow: Flow) => string;
  poses: Pose[];
  transitions: Transition[];
}

function FlowList({ title, flows, keyOf, poses, transitions }: FlowListProps) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h2>
      <ul className="divide-y divide-gray-100 bg-white border border-gray-200 rounded-lg">
        {flows.slice().sort((a, b) => a.name.localeCompare(b.name)).map(flow => (
          <li key={flow.name}>
            <button onClick={() => openFlow(keyOf(flow))} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
              <span className="flex-1 font-medium text-gray-900">{flow.name}</span>
              <span className="text-xs text-gray-500">{flow.poseIds.length} poses</span>
              <StarDifficulty rating={calculateFlowDifficulty(flow, poses, transitions)} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
