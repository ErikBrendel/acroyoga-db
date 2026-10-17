import {useEffect, useMemo, useState} from 'react';
import {usePoseData} from './hooks/usePoseData';
import {setUrlParams, useUrlState} from './hooks/useUrlState';
import {useOwnFlows} from './hooks/useOwnFlows';
import {PoseDetailSidebar} from './components/PoseDetailSidebar';
import {AddPoseDialog} from './components/AddPoseDialog';
import {AddFlowDialog} from './components/AddFlowDialog';
import {PoseEditor3D} from './components/PoseEditor3D';
import {NavBar} from './components/NavBar';
import {BottomSheet, SHEET_HEIGHT} from './components/BottomSheet';
import {useMediaQuery} from './hooks/useMediaQuery';
import {HomeView} from './views/HomeView';
import {PosesView} from './views/PosesView';
import {FlowsView} from './views/FlowsView';
import {MapView} from './views/MapView';
import {AboutView} from './views/AboutView';
import {PosePosition} from './utils/graphTransform';
import {isLocalEditMode} from './utils/editMode';
import {getFlowVariants, getFlowVariantKey} from './utils/flowMirror';
import {importName, OWN_FLOW_PREFIX, parseSharedFlow, resolveFlow} from './utils/flows';
import {goTo, useView} from './utils/navigation';
import {Flow} from './types/data';

function App() {
  const { poses, transitions, flows, loading, error, refetch } = usePoseData();
  const view = useView();
  const [selectedPoseId, setSelectedPoseId] = useUrlState<string | null>('pose', null, true);
  const [activeFlowKey] = useUrlState<string | null>('flow', null);
  const [sharedName] = useUrlState<string | null>('shared', null);
  const [sharedSteps] = useUrlState<string | null>('steps', null);
  const { ownFlows, saveOwnFlow, deleteOwnFlow } = useOwnFlows();
  const [isImportDismissed, setIsImportDismissed] = useState(false);
  const isPhone = useMediaQuery('(max-width: 767px)');
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);

  useEffect(() => setIsSheetExpanded(false), [selectedPoseId]);
  const [isAddPoseDialogOpen, setIsAddPoseDialogOpen] = useState(false);
  const [isAddFlowDialogOpen, setIsAddFlowDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null);
  const [is3DEditorOpen, setIs3DEditorOpen] = useState(false);
  const [editorPoseId, setEditorPoseId] = useState<string | null>(null);
  const [pendingPositions, setPendingPositions] = useState<Record<string, PosePosition | null>>({});

  const sharedFlow = useMemo(
    () => parseSharedFlow(new URLSearchParams({ shared: sharedName ?? '', steps: sharedSteps ?? '' }), poses),
    [sharedName, sharedSteps, poses]
  );
  const sharedImportName = sharedFlow && importName(sharedFlow, ownFlows);

  const activeFlow = useMemo(
    () => activeFlowKey ? resolveFlow(activeFlowKey, flows, ownFlows, sharedFlow, poses) : null,
    [activeFlowKey, flows, ownFlows, sharedFlow, poses]
  );

  const flowChoices = useMemo(
    () => [
      ...ownFlows.map(flow => ({ key: OWN_FLOW_PREFIX + flow.name, name: `My flow: ${flow.name}` })),
      ...flows.slice().sort((a, b) => a.name.localeCompare(b.name)).flatMap(flow =>
        getFlowVariants(flow, poses).map(variant => ({
          key: getFlowVariantKey(flow.name, variant.isMirrored),
          name: variant.isMirrored ? `${flow.name} (mirrored)` : flow.name,
        }))
      ),
    ],
    [flows, ownFlows, poses]
  );

  const importSharedFlow = () => {
    if (!sharedFlow || !sharedImportName) return;
    saveOwnFlow({ name: sharedImportName, poseIds: sharedFlow.poseIds });
    setUrlParams({ shared: null, steps: null, flow: OWN_FLOW_PREFIX + sharedImportName });
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

  const handleFlowClick = (flowKey: string) =>
    view === 'map' ? goTo('map', { flow: flowKey }) : goTo('flows', { flow: flowKey, pose: null });

  const showsPanel = poses.some(p => p.id === selectedPoseId) && view !== 'home' && view !== 'about';
  const inSheet = isPhone && view === 'map';

  const poseDetail = (
    <PoseDetailSidebar
      selectedPoseId={selectedPoseId}
      poses={poses}
      transitions={transitions}
      flows={flows}
      ownFlows={ownFlows}
      activeFlowName={activeFlowKey}
      onSelectPose={setSelectedPoseId}
      onFlowClick={handleFlowClick}
      onDataChange={isLocalEditMode() ? refetch : undefined}
      onUnpinNode={isLocalEditMode() ? (nodeId) => setPendingPositions({ ...pendingPositions, [nodeId]: null }) : undefined}
      onOpenIn3DEditor={isLocalEditMode() ? (poseId) => { setEditorPoseId(poseId); setIs3DEditorOpen(true); } : undefined}
      onShowOnMap={view !== 'map' ? (poseId) => goTo('map', { pose: poseId }) : undefined}
      pendingPositions={pendingPositions}
    />
  );

  return (
    <div className="w-screen h-dvh flex flex-col bg-gray-50">
      <NavBar view={view} />
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <main className={`flex-1 min-h-0 relative overflow-y-auto ${showsPanel && view !== 'map' ? 'max-md:hidden' : ''}`}>
          {view === 'home' && <HomeView poseCount={poses.length} transitionCount={transitions.length} flowCount={flows.length} />}
          {view === 'poses' && <PosesView poses={poses} selectedPoseId={selectedPoseId} onSelectPose={setSelectedPoseId} />}
          {view === 'flows' && (
            <FlowsView
              flows={flows}
              ownFlows={ownFlows}
              poses={poses}
              transitions={transitions}
              activeFlow={activeFlow}
              onSelectPose={setSelectedPoseId}
              onSaveOwnFlow={saveOwnFlow}
              onDeleteOwnFlow={deleteOwnFlow}
              onImportShared={importSharedFlow}
              onEditFlow={isLocalEditMode() ? setEditingFlow : undefined}
            />
          )}
          {view === 'map' && (
            <MapView
              poses={poses}
              transitions={transitions}
              flowChoices={flowChoices}
              activeFlow={activeFlow}
              selectedPoseId={selectedPoseId}
              bottomInset={inSheet ? (showsPanel ? (isSheetExpanded ? SHEET_HEIGHT.full : SHEET_HEIGHT.peek) : 0) : undefined}
              onSelectPose={setSelectedPoseId}
              editMode={isLocalEditMode() ? {
                pendingPositions,
                setPendingPositions,
                refetch,
                onNewPose: () => setIsAddPoseDialogOpen(true),
                onNewFlow: () => setIsAddFlowDialogOpen(true),
                onOpen3DEditor: () => { setEditorPoseId(null); setIs3DEditorOpen(true); },
              } : undefined}
            />
          )}
          {view === 'about' && <AboutView />}
          {showsPanel && inSheet && (
            <BottomSheet expanded={isSheetExpanded} onExpandedChange={setIsSheetExpanded}>{poseDetail}</BottomSheet>
          )}
        </main>
        {showsPanel && !inSheet && poseDetail}
      </div>
      {sharedFlow && sharedImportName && !isImportDismissed && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900">Save "{sharedFlow.name}"?</h2>
            <p className="mt-1 text-sm text-gray-600">
              Someone shared a flow of {sharedFlow.poseIds.length} poses with you. Save it to your flows in this browser
              {sharedImportName !== sharedFlow.name && ` as "${sharedImportName}"`}?
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={importSharedFlow} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium">Save</button>
              <button onClick={() => setIsImportDismissed(true)} className="flex-1 px-4 py-2 bg-gray-100 rounded font-medium">Just look</button>
            </div>
          </div>
        </div>
      )}
      <AddPoseDialog
        isOpen={isAddPoseDialogOpen}
        onClose={() => setIsAddPoseDialogOpen(false)}
        onSuccess={refetch}
      />
      <AddFlowDialog
        isOpen={isAddFlowDialogOpen || editingFlow !== null}
        onClose={() => { setIsAddFlowDialogOpen(false); setEditingFlow(null); }}
        onSuccess={refetch}
        onDataChange={refetch}
        poses={poses}
        transitions={transitions}
        initialFlow={editingFlow ?? undefined}
      />
      <PoseEditor3D
        isOpen={is3DEditorOpen}
        onClose={() => setIs3DEditorOpen(false)}
        poses={poses}
        openPoseId={editorPoseId}
      />
    </div>
  );
}

export default App;
