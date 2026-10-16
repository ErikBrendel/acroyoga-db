import { useState } from 'react';
import { Flow, Pose, Transition } from '../types/data';
import { getTransitionColor } from '../utils/difficultyColors';
import { nextPoses } from '../utils/flows';
import { poseName, searchPoses } from '../utils/poseNames';
import { DifficultyBadge } from './DifficultyBadge';
import { FlowSteps } from './FlowSteps';
import { SearchInput } from './SearchInput';

export interface FlowDraft extends Flow {
  originalName?: string;
}

interface FlowEditorProps {
  draft: FlowDraft;
  onChange: (draft: FlowDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  takenNames: string[];
  poses: Pose[];
  transitions: Transition[];
  onSelectPose: (poseId: string) => void;
}

const TRANSITION_ORDER = ['trivial', 'easy', 'intermediate', 'hard'];

export function FlowEditor({ draft, onChange, onSave, onCancel, takenNames, poses, transitions, onSelectPose }: FlowEditorProps) {
  const [search, setSearch] = useState('');
  const lastPoseId = draft.poseIds[draft.poseIds.length - 1];
  const lastPose = poses.find(p => p.id === lastPoseId);
  const name = draft.name.trim();
  const nameTaken = takenNames.includes(name) && name !== draft.originalName;

  const neighbours = lastPoseId
    ? nextPoses(lastPoseId, transitions)
      .filter(next => poses.some(p => p.id === next.poseId))
      .sort((a, b) => TRANSITION_ORDER.indexOf(a.transition.difficulty) - TRANSITION_ORDER.indexOf(b.transition.difficulty))
    : [];
  const found = search.trim()
    ? searchPoses(poses, search).filter(pose => !neighbours.some(n => n.poseId === pose.id)).slice(0, 8)
    : [];

  const addStep = (poseId: string) => {
    onChange({ ...draft, poseIds: [...draft.poseIds, poseId] });
    setSearch('');
  };

  return (
    <div>
      <input
        type="text"
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        placeholder="Name, e.g. Sunday jam"
        className="w-full px-3 py-2 border border-gray-300 rounded text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {nameTaken && <p className="mt-1 text-sm text-red-600">You already have a flow with this name.</p>}

      <div className="mt-4">
        <FlowSteps
          poseIds={draft.poseIds}
          poses={poses}
          transitions={transitions}
          onSelectPose={onSelectPose}
          onRemoveStep={(index) => onChange({ ...draft, poseIds: draft.poseIds.filter((_, i) => i !== index) })}
        />
      </div>

      <div className="mt-4 p-3 bg-white border border-dashed border-gray-300 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          {lastPoseId ? `Next from ${lastPose ? poseName(lastPose) : lastPoseId}` : 'First pose'}
        </h3>
        {neighbours.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {neighbours.map(({ poseId, transition }) => (
              <button
                key={poseId}
                onClick={() => addStep(poseId)}
                className="px-3 py-1.5 bg-gray-50 border rounded-full text-sm hover:bg-blue-50"
                style={{ borderColor: getTransitionColor(transition.difficulty) }}
              >
                {poseName(poses.find(p => p.id === poseId)!)}
              </button>
            ))}
          </div>
        )}
        <SearchInput value={search} onChange={setSearch} placeholder={lastPoseId ? 'Any other pose…' : 'Search a pose…'} />
        <ul className="mt-2">
          {found.map(pose => (
            <li key={pose.id}>
              <button onClick={() => addStep(pose.id)} className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-gray-50 rounded">
                <span className="flex-1">{poseName(pose)}</span>
                {lastPoseId && <span className="text-xs text-amber-700">no known transition</span>}
                <DifficultyBadge difficulty={pose.difficulty} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={onSave}
          disabled={!name || nameTaken || draft.poseIds.length < 2}
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium disabled:bg-gray-300"
        >
          Save
        </button>
        <button onClick={onCancel} className="px-4 py-2 bg-gray-100 rounded font-medium">Cancel</button>
      </div>
      <p className="mt-2 text-xs text-gray-500">Saved in this browser only. Share a flow to send it to someone or to another device.</p>
    </div>
  );
}
