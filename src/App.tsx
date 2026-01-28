import {useMemo, useState} from 'react';
import {usePoseData} from './hooks/usePoseData';
import {PoseGraph} from './components/PoseGraph';
import {PoseDetailSidebar} from './components/PoseDetailSidebar';
import {FlowsList} from './components/FlowsList';
import {AddPoseDialog} from './components/AddPoseDialog';
import {AddFlowDialog} from './components/AddFlowDialog';
import {transformToGraph, PosePosition} from './utils/graphTransform';
import {isLocalEditMode} from './utils/editMode';
import {updatePosePositions} from './api/layout';

function App() {
  const { poses, transitions, flows, loading, error, refetch } = usePoseData();
  const [selectedPoseId, setSelectedPoseId] = useState<string | null>(null);
  const [activeFlowName, setActiveFlowName] = useState<string | null>(null);
  const [isAddPoseDialogOpen, setIsAddPoseDialogOpen] = useState(false);
  const [isAddFlowDialogOpen, setIsAddFlowDialogOpen] = useState(false);
  const [pendingPositions, setPendingPositions] = useState<Record<string, PosePosition | null>>({});
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = Object.keys(pendingPositions).length > 0;

  const { nodes, edges } = useMemo(
    () => transformToGraph(poses, transitions),
    [poses, transitions]
  );

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

  const activeFlow = flows.find(f => f.name === activeFlowName) || null;

  const handleFlowClick = (flowName: string) => {
    setActiveFlowName(prev => prev === flowName ? null : flowName);
  };

  return (
    <div className="w-screen h-screen relative bg-gray-50">
      <div className="absolute top-0 left-0 p-4 z-10 bg-white shadow-md rounded-br-lg max-w-4xl">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Acroyoga Pose Graph</h1>
            <p className="text-sm text-gray-600">{poses.length} poses, {transitions.length} transitions</p>
          </div>
          {isLocalEditMode() && (
            <>
              <div className="px-3 py-1 bg-green-100 border border-green-300 rounded-full">
                <span className="text-xs font-semibold text-green-700">Local Edit Mode</span>
              </div>
              <button
                onClick={() => setIsAddPoseDialogOpen(true)}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs font-semibold"
              >
                + New Pose
              </button>
              <button
                onClick={() => setIsAddFlowDialogOpen(true)}
                className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-xs font-semibold"
              >
                + New Flow
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              {isDirty ? (
                <>
                  <button
                    onClick={handleSavePositions}
                    disabled={isSaving}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 transition-colors text-xs font-semibold"
                  >
                    💾 Save Positions ({Object.keys(pendingPositions).length})
                  </button>
                  <button
                    onClick={handleDiscardChanges}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs font-semibold"
                  >
                    ✕ Discard
                  </button>
                </>
              ) : (
                <button
                  onClick={handleRegenerateLayout}
                  disabled={isSaving}
                  className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 transition-colors text-xs font-semibold"
                >
                  ↻ Regenerate Layout
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <FlowsList
        flows={flows}
        activeFlowName={activeFlowName}
        onFlowClick={handleFlowClick}
      />
      <PoseGraph
        nodes={nodes}
        edges={edges}
        selectedPoseId={selectedPoseId}
        activeFlow={activeFlow}
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
        existingPoses={poses}
      />
      <AddFlowDialog
        isOpen={isAddFlowDialogOpen}
        onClose={() => setIsAddFlowDialogOpen(false)}
        onSuccess={refetch}
        poses={poses}
        transitions={transitions}
      />
    </div>
  );
}

export default App;
