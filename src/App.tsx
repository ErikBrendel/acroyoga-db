import {useMemo, useState} from 'react';
import {usePoseData} from './hooks/usePoseData';
import {PoseGraph} from './components/PoseGraph';
import {PoseDetailSidebar} from './components/PoseDetailSidebar';
import {FlowsList} from './components/FlowsList';
import {AddPoseDialog} from './components/AddPoseDialog';
import {AddFlowDialog} from './components/AddFlowDialog';
import {PoseEditor3DDemo} from './components/PoseEditor3DDemo';
import {DifficultyGuide} from './components/DifficultyGuide';
import {transformToGraph, PosePosition} from './utils/graphTransform';
import {isLocalEditMode} from './utils/editMode';
import {updatePosePositions} from './api/layout';
import {parseFlowVariantKey, getMirroredFlow} from './utils/flowMirror';

function App() {
  const { poses, transitions, flows, loading, error, refetch } = usePoseData();
  const [selectedPoseId, setSelectedPoseId] = useState<string | null>(null);
  const [activeFlowName, setActiveFlowName] = useState<string | null>(null);
  const [isAddPoseDialogOpen, setIsAddPoseDialogOpen] = useState(false);
  const [isAddFlowDialogOpen, setIsAddFlowDialogOpen] = useState(false);
  const [is3DEditorOpen, setIs3DEditorOpen] = useState(false);
  const [pendingPositions, setPendingPositions] = useState<Record<string, PosePosition | null>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const isDirty = Object.keys(pendingPositions).length > 0;

  const matchingPoseIds = useMemo(() => {
    if (!searchInput.trim()) {
      return undefined; // Show all poses with full opacity
    }

    const words = searchInput.toLowerCase().trim().split(/\s+/);

    return new Set(
      poses
        .filter(pose => {
          const searchText = [
            pose.id,
            pose.name || '',
            pose.description || ''
          ].join(' ').toLowerCase();

          return words.every(word => searchText.includes(word));
        })
        .map(p => p.id)
    );
  }, [poses, searchInput]);

  const { nodes, edges } = useMemo(
    () => transformToGraph(poses, transitions),
    [poses, transitions]
  );

  const activeFlow = useMemo(() => {
    if (!activeFlowName) return null;

    const { flowName, isMirrored } = parseFlowVariantKey(activeFlowName);
    const flow = flows.find(f => f.name === flowName);

    if (!flow) return null;

    if (isMirrored) {
      return {
        name: flow.name,
        poseIds: getMirroredFlow(flow, poses),
      };
    }

    return flow;
  }, [activeFlowName, flows, poses]);

  const handleNodeDragStop = (nodeId: string, position: PosePosition) => {
    setPendingPositions(prev => ({
      ...prev,
      [nodeId]: position,
    }));
  };

  const handleUnpinNode = (nodeId: string) => {
    setPendingPositions(prev => ({
      ...prev,
      [nodeId]: null,
    }));
  };

  const handleSavePositions = async () => {
    setIsSaving(true);
    try {
      await updatePosePositions(pendingPositions);
      setPendingPositions({});
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save positions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setPendingPositions({});
    window.location.reload();
  };

  const handleRegenerateLayout = async () => {
    if (!confirm('Regenerate layout for all nodes? This will clear all pinned positions.')) {
      return;
    }
    setIsSaving(true);
    try {
      // Clear all positions by setting them to null
      const allPositionsNull = poses.reduce((acc, pose) => {
        acc[pose.id] = null;
        return acc;
      }, {} as Record<string, null>);
      await updatePosePositions(allPositionsNull);
      setPendingPositions({});
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate layout');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading pose data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <h2 className="text-xl font-bold text-red-600 mb-3">Error Loading Data</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{error}</p>
        </div>
      </div>
    );
  }

  const handleFlowClick = (flowVariantKey: string) => {
    setActiveFlowName(prev => prev === flowVariantKey ? null : flowVariantKey);
  };

  return (
    <div className="w-screen h-screen relative bg-gray-50">
      {/* Top bar - always visible */}
      <div className="absolute top-0 left-0 p-4 z-20 bg-white shadow-md rounded-br-lg">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Acroyoga Pose Graph</h1>
            <p className="text-sm text-gray-600">{poses.length} poses, {transitions.length} transitions</p>
          </div>
          <DifficultyGuide />
          <div className="relative w-64">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search poses..."
              className="px-3 py-2 pr-8 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit mode floating toolbar - bottom left */}
      {isLocalEditMode() && (
        <div className="absolute bottom-4 left-4 z-20 bg-white shadow-lg rounded-lg border border-gray-200 p-3">
          <div className="flex flex-col gap-2">
            <div className="px-3 py-1 bg-green-100 border border-green-300 rounded text-center mb-2">
              <span className="text-xs font-semibold text-green-700">Edit Mode</span>
            </div>
            <button
              onClick={() => setIsAddPoseDialogOpen(true)}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-semibold"
            >
              + New Pose
            </button>
            <button
              onClick={() => setIsAddFlowDialogOpen(true)}
              className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm font-semibold"
            >
              + New Flow
            </button>
            <button
              onClick={() => setIs3DEditorOpen(true)}
              className="px-3 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors text-sm font-semibold"
            >
              🎭 3D Editor
            </button>
            <div className="h-px bg-gray-300 my-1"></div>
            {isDirty ? (
              <>
                <button
                  onClick={handleSavePositions}
                  disabled={isSaving}
                  className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 transition-colors text-sm font-semibold"
                >
                  💾 Save ({Object.keys(pendingPositions).length})
                </button>
                <button
                  onClick={handleDiscardChanges}
                  className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-semibold"
                >
                  ✕ Discard
                </button>
              </>
            ) : (
              <button
                onClick={handleRegenerateLayout}
                disabled={isSaving}
                className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 transition-colors text-sm font-semibold"
              >
                ↻ Regenerate
              </button>
            )}
          </div>
        </div>
      )}
      <FlowsList
        flows={flows}
        poses={poses}
        activeFlowName={activeFlowName}
        onFlowClick={handleFlowClick}
      />
      <PoseGraph
        nodes={nodes}
        edges={edges}
        selectedPoseId={selectedPoseId}
        activeFlow={activeFlow}
        matchingPoseIds={matchingPoseIds}
        onSelectPose={setSelectedPoseId}
        onNodeDragStop={isLocalEditMode() ? handleNodeDragStop : undefined}
      />
      <PoseDetailSidebar
        selectedPoseId={selectedPoseId}
        poses={poses}
        transitions={transitions}
        flows={flows}
        activeFlowName={activeFlowName}
        onSelectPose={setSelectedPoseId}
        onFlowClick={handleFlowClick}
        onDataChange={isLocalEditMode() ? refetch : undefined}
        onUnpinNode={isLocalEditMode() ? handleUnpinNode : undefined}
        pendingPositions={pendingPositions}
      />
      <AddPoseDialog
        isOpen={isAddPoseDialogOpen}
        onClose={() => setIsAddPoseDialogOpen(false)}
        onSuccess={refetch}
      />
      <AddFlowDialog
        isOpen={isAddFlowDialogOpen}
        onClose={() => setIsAddFlowDialogOpen(false)}
        onSuccess={refetch}
        poses={poses}
        transitions={transitions}
      />
      <PoseEditor3DDemo
        isOpen={is3DEditorOpen}
        onClose={() => setIs3DEditorOpen(false)}
      />
    </div>
  );
}

export default App;
