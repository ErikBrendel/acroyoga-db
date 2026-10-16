import { useMemo, useState } from 'react';
import { Flow, Pose, Transition } from '../types/data';
import { useUrlState, setUrlParams } from '../hooks/useUrlState';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { PoseGraph } from '../components/PoseGraph';
import { DifficultyGuide } from '../components/DifficultyGuide';
import { SearchInput } from '../components/SearchInput';
import { transformToGraph, collapseMirroredPoses, CollapsedGraph, PosePosition } from '../utils/graphTransform';
import { updatePosePositions } from '../api/layout';
import { searchPoses } from '../utils/poseNames';
import { ResolvedFlow } from '../utils/flows';
import { goTo } from '../utils/navigation';

interface MapViewProps {
  poses: Pose[];
  transitions: Transition[];
  flowChoices: { key: string; name: string }[];
  activeFlow: ResolvedFlow | null;
  selectedPoseId: string | null;
  onSelectPose: (poseId: string | null) => void;
  editMode?: {
    pendingPositions: Record<string, PosePosition | null>;
    setPendingPositions: (positions: Record<string, PosePosition | null>) => void;
    refetch: () => void;
    onNewPose: () => void;
    onNewFlow: () => void;
    onOpen3DEditor: () => void;
  };
}

export function MapView({ poses, transitions, flowChoices, activeFlow, selectedPoseId, onSelectPose, editMode }: MapViewProps) {
  const [searchInput, setSearchInput] = useUrlState<string>('search', '');
  const [collapseMirrors, setCollapseMirrors] = useLocalStorageState('collapseMirroredPoses', false);

  const matchingPoseIds = useMemo(
    () => searchInput.trim() ? new Set(searchPoses(poses, searchInput).map(p => p.id)) : undefined,
    [poses, searchInput]
  );

  const graph = useMemo(() => transformToGraph(poses, transitions), [poses, transitions]);

  const { nodes, edges, nodeIdOf } = useMemo(
    (): CollapsedGraph => collapseMirrors ? collapseMirroredPoses(graph, poses) : { ...graph, nodeIdOf: id => id },
    [graph, poses, collapseMirrors]
  );

  const graphFlow: Flow | null = useMemo(
    () => activeFlow && { name: activeFlow.name, poseIds: activeFlow.poseIds.map(nodeIdOf) },
    [activeFlow, nodeIdOf]
  );

  const matchingNodeIds = useMemo(
    () => matchingPoseIds && new Set([...matchingPoseIds].map(nodeIdOf)),
    [matchingPoseIds, nodeIdOf]
  );

  return (
    <div className="absolute inset-0">
      <PoseGraph
        nodes={nodes}
        edges={edges}
        selectedPoseId={selectedPoseId && nodeIdOf(selectedPoseId)}
        activeFlow={graphFlow}
        matchingPoseIds={matchingNodeIds}
        onSelectPose={onSelectPose}
        onNodeDragStop={editMode && ((nodeId, position) => editMode.setPendingPositions({ ...editMode.pendingPositions, [nodeId]: position }))}
        isEditMode={!!editMode}
      />
      <div className="absolute top-2 left-2 right-2 md:right-auto z-20 flex flex-wrap items-center gap-2 p-2 bg-white/95 shadow rounded-lg md:w-[28rem]">
        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search poses..." className="w-full" />
        <select
          value={activeFlow?.key ?? ''}
          onChange={(e) => setUrlParams({ flow: e.target.value || null })}
          className="flex-1 min-w-[10rem] px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
        >
          <option value="">Show a flow…</option>
          {flowChoices.map(({ key, name }) => <option key={key} value={key}>{name}</option>)}
        </select>
        {activeFlow && (
          <button onClick={() => goTo('flows', { flow: activeFlow.key })} className="text-sm text-blue-600 hover:underline">Steps</button>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none" title="Show each left/right pair of mirrored poses as one node">
          <input type="checkbox" checked={collapseMirrors} onChange={(e) => setCollapseMirrors(e.target.checked)} />
          Merge mirrored
        </label>
        <DifficultyGuide />
      </div>
      {editMode && <EditToolbar poses={poses} {...editMode} />}
    </div>
  );
}

function EditToolbar({ poses, pendingPositions, setPendingPositions, refetch, onNewPose, onNewFlow, onOpen3DEditor }: { poses: Pose[] } & NonNullable<MapViewProps['editMode']>) {
  const [isSaving, setIsSaving] = useState(false);
  const pendingCount = Object.keys(pendingPositions).length;

  const save = async (positions: Record<string, PosePosition | null>) => {
    setIsSaving(true);
    try {
      await updatePosePositions(positions);
      setPendingPositions({});
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save positions');
    } finally {
      setIsSaving(false);
    }
  };

  const regenerate = () => {
    if (!confirm('Regenerate layout for all nodes? This will clear all pinned positions.')) return;
    save(Object.fromEntries(poses.map(pose => [pose.id, null])));
  };

  return (
    <div className="absolute bottom-[116px] left-4 z-20 bg-white shadow-lg rounded-lg border border-gray-200 p-3">
      <div className="flex flex-col gap-2">
        <div className="px-3 py-1 bg-green-100 border border-green-300 rounded text-center mb-2">
          <span className="text-xs font-semibold text-green-700">Edit Mode</span>
        </div>
        <button onClick={onNewPose} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-semibold">
          + New Pose
        </button>
        <button onClick={onNewFlow} className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm font-semibold">
          + New Flow
        </button>
        <button onClick={onOpen3DEditor} className="px-3 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors text-sm font-semibold">
          🎭 3D Editor
        </button>
        <div className="h-px bg-gray-300 my-1"></div>
        {pendingCount > 0 ? (
          <>
            <button
              onClick={() => save(pendingPositions)}
              disabled={isSaving}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 transition-colors text-sm font-semibold"
            >
              💾 Save ({pendingCount})
            </button>
            <button
              onClick={() => { setPendingPositions({}); window.location.reload(); }}
              className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-semibold"
            >
              ✕ Discard
            </button>
          </>
        ) : (
          <button
            onClick={regenerate}
            disabled={isSaving}
            className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 transition-colors text-sm font-semibold"
          >
            ↻ Regenerate
          </button>
        )}
      </div>
    </div>
  );
}
