import { useState } from 'react';
import { Flow, Pose, Transition } from '../types/data';
import { setUrlParams, useUrlState } from '../hooks/useUrlState';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { FlowSteps } from '../components/FlowSteps';
import { FlowDraft, FlowEditor } from '../components/FlowEditor';
import { StarDifficulty } from '../components/StarDifficulty';
import { DifficultyGuide } from '../components/DifficultyGuide';
import { calculateFlowDifficulty } from '../utils/flowDifficulty';
import { getFlowVariantKey, hasFlowMirrorVariant, parseFlowVariantKey } from '../utils/flowMirror';
import { flowShareUrl, importName, OWN_FLOW_PREFIX, ResolvedFlow, SHARED_FLOW_KEY } from '../utils/flows';
import { goTo } from '../utils/navigation';

interface FlowsViewProps {
  flows: Flow[];
  ownFlows: Flow[];
  poses: Pose[];
  transitions: Transition[];
  activeFlow: ResolvedFlow | null;
  onSelectPose: (poseId: string) => void;
  onSaveOwnFlow: (flow: Flow, originalName?: string) => void;
  onDeleteOwnFlow: (name: string) => void;
  onImportShared: () => void;
  onEditFlow?: (flow: Flow) => void;
}

const openFlow = (key: string | null) => setUrlParams({ flow: key }, true);

export function FlowsView({ flows, ownFlows, poses, transitions, activeFlow, onSelectPose, onSaveOwnFlow, onDeleteOwnFlow, onImportShared, onEditFlow }: FlowsViewProps) {
  const [editing] = useUrlState<string | null>('edit', null);
  const [draft, setDraft] = useLocalStorageState<FlowDraft | null>('flowDraft', null);

  const startEditing = (newDraft: FlowDraft) => {
    setDraft(newDraft);
    setUrlParams({ edit: '1', flow: null }, true);
  };

  if (editing && draft) {
    const save = () => {
      const flow = { name: draft.name.trim(), poseIds: draft.poseIds };
      onSaveOwnFlow(flow, draft.originalName);
      setDraft(null);
      setUrlParams({ edit: null, flow: OWN_FLOW_PREFIX + flow.name });
    };
    return (
      <div className="max-w-2xl mx-auto px-4 py-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{draft.originalName ? 'Edit flow' : 'New flow'}</h2>
        <FlowEditor
          draft={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={() => { setDraft(null); window.history.back(); }}
          takenNames={ownFlows.map(f => f.name)}
          poses={poses}
          transitions={transitions}
          onSelectPose={onSelectPose}
        />
      </div>
    );
  }

  if (activeFlow) {
    return (
      <FlowDetail
        flow={activeFlow}
        builtIn={activeFlow.isOwn ? undefined : flows.find(f => f.name === parseFlowVariantKey(activeFlow.key).flowName)}
        isSaved={activeFlow.key !== SHARED_FLOW_KEY || importName(activeFlow, ownFlows) === null}
        poses={poses}
        transitions={transitions}
        onSelectPose={onSelectPose}
        onEdit={() => startEditing(activeFlow.isOwn ? { ...activeFlow, originalName: activeFlow.name } : { name: `${activeFlow.name} (copy)`, poseIds: activeFlow.poseIds })}
        onDelete={() => { onDeleteOwnFlow(activeFlow.name); openFlow(null); }}
        onImport={onImportShared}
        onEditBuiltIn={onEditFlow}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">My flows</h2>
          <button onClick={() => startEditing({ name: '', poseIds: [] })} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
            + New flow
          </button>
        </div>
        {ownFlows.length > 0 ? (
          <FlowList flows={ownFlows} keyOf={f => OWN_FLOW_PREFIX + f.name} poses={poses} transitions={transitions} />
        ) : (
          <p className="text-sm text-gray-500">
            Put together a flow from the poses you know, keep it here and share it as a link, e.g. what you did in today's session.
          </p>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Flows</h2>
        <FlowList flows={flows} keyOf={f => f.name} poses={poses} transitions={transitions} />
      </section>
    </div>
  );
}

interface FlowDetailProps {
  flow: ResolvedFlow;
  builtIn: Flow | undefined;
  isSaved: boolean;
  poses: Pose[];
  transitions: Transition[];
  onSelectPose: (poseId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onImport: () => void;
  onEditBuiltIn?: (flow: Flow) => void;
}

function FlowDetail({ flow, builtIn, isSaved, poses, transitions, onSelectPose, onEdit, onDelete, onImport, onEditBuiltIn }: FlowDetailProps) {
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { isMirrored } = parseFlowVariantKey(flow.key);
  const isShared = flow.key === SHARED_FLOW_KEY;

  const share = async () => {
    const url = flowShareUrl(flow);
    if (navigator.share) {
      await navigator.share({ title: flow.name, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setShareState('copied');
  };

  const button = 'px-3 py-1.5 bg-gray-100 rounded text-sm font-medium hover:bg-gray-200';

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <button onClick={() => openFlow(null)} className="text-sm text-blue-600 hover:underline">← All flows</button>
      <div className="flex items-center gap-3 mt-2">
        <h2 className="text-2xl font-bold text-gray-900">{flow.name}{isMirrored && ' (mirrored)'}</h2>
        <StarDifficulty rating={calculateFlowDifficulty(flow, poses, transitions)} />
        <DifficultyGuide compact />
      </div>
      {isShared && <p className="text-sm text-gray-600 mt-1">Shared with you{isSaved && ', saved in your flows'}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={() => goTo('map', { flow: flow.key })} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
          Show on map
        </button>
        {(flow.isOwn || isShared) && (
          <button onClick={share} className={button}>{shareState === 'copied' ? '✓ Link copied' : '🔗 Share'}</button>
        )}
        {builtIn && hasFlowMirrorVariant(builtIn, poses) && (
          <button onClick={() => openFlow(getFlowVariantKey(builtIn.name, !isMirrored))} className={button}>
            ⇄ {isMirrored ? 'Original' : 'Mirrored'}
          </button>
        )}
        {isShared ? (
          !isSaved && <button onClick={onImport} className={button}>＋ Save to my flows</button>
        ) : (
          <button onClick={onEdit} className={button}>{flow.isOwn ? '✏️ Edit' : '＋ Copy to my flows'}</button>
        )}
        {flow.isOwn && (
          <button onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))} className={`${button} text-red-700`}>
            {confirmDelete ? 'Really delete?' : 'Delete'}
          </button>
        )}
        {builtIn && onEditBuiltIn && (
          <button onClick={() => onEditBuiltIn(builtIn)} className={button}>✏️ Edit data</button>
        )}
      </div>
      <div className="mt-4">
        <FlowSteps poseIds={flow.poseIds} poses={poses} transitions={transitions} onSelectPose={onSelectPose} />
      </div>
    </div>
  );
}

interface FlowListProps {
  flows: Flow[];
  keyOf: (flow: Flow) => string;
  poses: Pose[];
  transitions: Transition[];
}

function FlowList({ flows, keyOf, poses, transitions }: FlowListProps) {
  return (
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
  );
}
