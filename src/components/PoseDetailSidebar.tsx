import { useState, useMemo, lazy, Suspense } from 'react';
import { Pose, Transition, Flow, PoseDifficulty, TransitionDifficulty } from '../types/data';
import { PoseButton } from './PoseButton';
import { AddTransitionForm } from './AddTransitionForm';
import { isLocalEditMode } from '../utils/editMode';
import { deleteTransition, updateTransition } from '../api/transitions';
import { updatePose } from '../api/poses';
import { PosePosition } from '../utils/graphTransform';
import { mirrorText } from '../utils/mirrorText';
import { getFlowVariants, getFlowVariantKey } from '../utils/flowMirror';
import { DifficultyBadge } from './DifficultyBadge';
import { DifficultyGuide } from './DifficultyGuide';
import { poseName, sharedNames } from '../utils/poseNames';
import { nextPoses, OWN_FLOW_PREFIX } from '../utils/flows';

// three.js is only loaded once a pose is opened
const PosePreview3D = lazy(() => import('./PosePreview3D').then(m => ({ default: m.PosePreview3D })));

interface PoseDetailSidebarProps {
  selectedPoseId: string | null;
  poses: Pose[];
  transitions: Transition[];
  flows: Flow[];
  ownFlows: Flow[];
  activeFlowName: string | null;
  onSelectPose: (poseId: string | null) => void;
  onFlowClick: (flowName: string) => void;
  onDataChange?: () => void;
  onUnpinNode?: (nodeId: string) => void;
  onOpenIn3DEditor?: (poseId: string) => void;
  onShowOnMap?: (poseId: string) => void;
  pendingPositions?: Record<string, PosePosition | null>;
}

export function PoseDetailSidebar({
  selectedPoseId,
  poses,
  transitions,
  flows,
  ownFlows,
  activeFlowName,
  onSelectPose,
  onFlowClick,
  onDataChange,
  onUnpinNode,
  onOpenIn3DEditor,
  onShowOnMap,
  pendingPositions,
}: PoseDetailSidebarProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAliases, setEditAliases] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDifficulty, setEditDifficulty] = useState<PoseDifficulty>('easy');
  const [isSaving, setIsSaving] = useState(false);

  const containingFlowVariants = useMemo(() => {
    if (!selectedPoseId) return [];

    const flowMap = new Map<string, { hasOriginal: boolean; hasMirrored: boolean }>();

    flows.forEach(flow => {
      const flowVariants = getFlowVariants(flow, poses);

      let hasOriginal = false;
      let hasMirrored = false;

      flowVariants.forEach(variant => {
        if (variant.poseIds.includes(selectedPoseId)) {
          if (variant.isMirrored) {
            hasMirrored = true;
          } else {
            hasOriginal = true;
          }
        }
      });

      if (hasOriginal || hasMirrored) {
        flowMap.set(flow.name, { hasOriginal, hasMirrored });
      }
    });

    return Array.from(flowMap.entries()).map(([flowName, variants]) => ({
      flowName,
      hasOriginal: variants.hasOriginal,
      hasMirrored: variants.hasMirrored,
    }));
  }, [flows, poses, selectedPoseId]);

  if (!selectedPoseId) {
    return null;
  }

  const pose = poses.find((p) => p.id === selectedPoseId);
  if (!pose) {
    return null;
  }

  const difficultyOrder: Record<string, number> = {
    trivial: 0,
    easy: 1,
    intermediate: 2,
    hard: 3,
  };

  const sortTransitions = (transitions: Transition[], getTargetPoseId: (t: Transition) => string) => {
    return [...transitions].sort((a, b) => {
      // Sort by difficulty first
      const diffA = a.difficulty ? difficultyOrder[a.difficulty] : 999;
      const diffB = b.difficulty ? difficultyOrder[b.difficulty] : 999;
      if (diffA !== diffB) {
        return diffA - diffB;
      }

      // Then sort alphabetically by target pose name
      const targetPoseA = poses.find(p => p.id === getTargetPoseId(a));
      const targetPoseB = poses.find(p => p.id === getTargetPoseId(b));
      const nameA = targetPoseA?.name || getTargetPoseId(a);
      const nameB = targetPoseB?.name || getTargetPoseId(b);
      return nameA.localeCompare(nameB);
    });
  };

  const groupMirroredTransitions = (transitions: Transition[], getTargetPoseId: (t: Transition) => string) => {
    const grouped: Array<{ transitions: Transition[], targetPoseIds: string[] }> = [];
    const processed = new Set<string>();

    transitions.forEach(transition => {
      const targetPoseId = getTargetPoseId(transition);
      if (processed.has(targetPoseId)) return;

      const targetPose = poses.find(p => p.id === targetPoseId);
      const mirroredTargetId = targetPose?.mirroredPoseId;

      // Find if there's a mirrored transition
      const mirroredTransition = mirroredTargetId
        ? transitions.find(t => getTargetPoseId(t) === mirroredTargetId)
        : null;

      if (mirroredTransition) {
        grouped.push({
          transitions: [transition, mirroredTransition],
          targetPoseIds: [targetPoseId, mirroredTargetId!]
        });
        processed.add(targetPoseId);
        processed.add(mirroredTargetId!);
      } else {
        grouped.push({
          transitions: [transition],
          targetPoseIds: [targetPoseId]
        });
        processed.add(targetPoseId);
      }
    });

    return grouped;
  };

  const reversibleTransitions = groupMirroredTransitions(
    sortTransitions(
      transitions.filter((t) => !t.nonReversible && (t.fromPoseId === selectedPoseId || t.toPoseId === selectedPoseId)),
      (t) => t.fromPoseId === selectedPoseId ? t.toPoseId : t.fromPoseId
    ),
    (t) => t.fromPoseId === selectedPoseId ? t.toPoseId : t.fromPoseId
  );
  const nonReversibleFrom = groupMirroredTransitions(
    sortTransitions(
      transitions.filter((t) => t.nonReversible && t.fromPoseId === selectedPoseId),
      (t) => t.toPoseId
    ),
    (t) => t.toPoseId
  );
  const nonReversibleTo = groupMirroredTransitions(
    sortTransitions(
      transitions.filter((t) => t.nonReversible && t.toPoseId === selectedPoseId),
      (t) => t.fromPoseId
    ),
    (t) => t.fromPoseId
  );
  const mirroredPose = pose.mirroredPoseId ? poses.find((p) => p.id === pose.mirroredPoseId) : null;
  const ownFlowsWithPose = ownFlows.filter(flow => flow.poseIds.includes(pose.id));
  const poseDifficultyRank = (p: Pose) => difficultyOrder[p.difficulty];
  const stepUps = nextPoses(pose.id, transitions)
    .flatMap(next => poses.filter(p => p.id === next.poseId).map(p => ({ ...next, pose: p })))
    .filter(next => poseDifficultyRank(next.pose) > poseDifficultyRank(pose))
    .sort((a, b) => poseDifficultyRank(a.pose) - poseDifficultyRank(b.pose) || poseName(a.pose).localeCompare(poseName(b.pose)));

  const pendingPosition = pendingPositions?.[selectedPoseId];
  const hasPosition = pendingPosition !== undefined ? pendingPosition !== null : !!pose.position;
  const isPendingUnpin = pendingPosition === null;

  const handleDeleteTransition = async (fromPoseId: string, toPoseId: string) => {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      await deleteTransition({ fromPoseId, toPoseId });
      if (onDataChange) {
        onDataChange();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete transition');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddTransitionSuccess = () => {
    if (onDataChange) {
      onDataChange();
    }
  };

  const handleTransitionDifficultyChange = async (fromPoseId: string, toPoseId: string, difficulty: TransitionDifficulty) => {
    try {
      const transition = transitions.find(t => t.fromPoseId === fromPoseId && t.toPoseId === toPoseId);
      await updateTransition({
        fromPoseId,
        toPoseId,
        nonReversible: transition?.nonReversible,
        difficulty,
      });
      if (onDataChange) {
        onDataChange();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update transition difficulty');
    }
  };

  const handleTransitionNameChange = async (fromPoseId: string, toPoseId: string, name: string) => {
    try {
      const transition = transitions.find(t => t.fromPoseId === fromPoseId && t.toPoseId === toPoseId)!;
      await updateTransition({
        fromPoseId,
        toPoseId,
        nonReversible: transition.nonReversible,
        difficulty: transition.difficulty,
        name,
      });
      if (onDataChange) {
        onDataChange();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update transition name');
    }
  };

  const handleEditClick = () => {
    setEditName(pose.name || '');
    setEditAliases((pose.aliases ?? []).join(', '));
    setEditDescription(pose.description || '');
    setEditDifficulty(pose.difficulty);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName('');
    setEditDescription('');
    setEditDifficulty('easy');
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    const aliases = editAliases.split(',').map(a => a.trim()).filter(Boolean);
    try {
      await updatePose({
        id: pose.id,
        name: editName,
        aliases,
        description: editDescription,
        difficulty: editDifficulty,
        mirroredPoseId: pose.mirroredPoseId,
      });

      if (pose.mirroredPoseId && mirroredPose) {
        await updatePose({
          id: mirroredPose.id,
          name: editName ? mirrorText(editName) : '',
          aliases: aliases.map(mirrorText),
          description: editDescription ? mirrorText(editDescription) : '',
          difficulty: editDifficulty,
          mirroredPoseId: pose.id,
        });
      }

      setIsEditing(false);
      if (onDataChange) {
        onDataChange();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update pose');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 md:flex-none min-h-0 w-full md:w-96 bg-white shadow-2xl border-t md:border-t-0 md:border-l border-gray-200 overflow-y-auto z-10">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          {isEditing ? (
            <div className="flex-1 mr-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl font-bold"
                placeholder="Pose name"
              />
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {poseName(pose)}
              </h2>
              {pose.aliases && (
                <p className="text-sm text-gray-600">Also called {pose.aliases.join(', ')}</p>
              )}
              <div className="mt-1 flex items-center gap-1">
                <DifficultyBadge difficulty={pose.difficulty} />
                <DifficultyGuide compact />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            {isLocalEditMode() && !isEditing && (
              <button
                onClick={handleEditClick}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Edit
              </button>
            )}
            <button
              onClick={() => onSelectPose(null)}
              className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {isEditing && (
          <div className="mb-4">
            <input
              type="text"
              value={editAliases}
              onChange={(e) => setEditAliases(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              placeholder="Other names, comma-separated"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              placeholder="Description"
              rows={4}
            />
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty
              </label>
              <select
                value={editDifficulty}
                onChange={(e) => setEditDifficulty(e.target.value as PoseDifficulty)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="easy">Easy</option>
                <option value="intermediate">Intermediate</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 transition-colors text-sm font-medium"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {onShowOnMap && (
          <button
            onClick={() => onShowOnMap(pose.id)}
            className="mb-4 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm font-medium"
          >
            Show on map
          </button>
        )}

        <Suspense fallback={null}>
          <PosePreview3D pose={pose} />
        </Suspense>

        {onOpenIn3DEditor && (
          <button
            onClick={() => onOpenIn3DEditor(pose.id)}
            className="mb-4 w-full px-3 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors text-sm font-semibold"
          >
            🎭 Open in 3D editor
          </button>
        )}

        {pose.mirroredPoseId && (
          <div className="mb-4 px-3 py-2 bg-blue-100 text-blue-800 rounded text-sm font-medium">
            Handed pose
          </div>
        )}

        {isLocalEditMode() && onUnpinNode && (
          <div className="mb-4">
            {hasPosition ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-purple-50 border border-purple-200 rounded text-sm">
                  <span className="text-purple-700 font-medium">📌 Pinned position{isPendingUnpin ? ' (pending unpin)' : ''}</span>
                </div>
                {!isPendingUnpin && (
                  <button
                    onClick={() => onUnpinNode(selectedPoseId)}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm font-medium"
                  >
                    Unpin
                  </button>
                )}
              </div>
            ) : (
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
                💫 Auto-positioned. Drag to pin this node.
              </div>
            )}
          </div>
        )}

        {sharedNames(pose, poses).map(({ name, others }) => (
          <p key={name} className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
            "{name}" can also mean{' '}
            {others.map((other, i) => (
              <span key={other.id}>
                {i > 0 && ', '}
                <button onClick={() => onSelectPose(other.id)} className="font-medium underline">{poseName(other)}</button>
              </span>
            ))}
          </p>
        ))}

        {!isEditing && pose.description && (
          <div className="mb-6">
            <p className="text-gray-700 leading-relaxed">{pose.description}</p>
          </div>
        )}

        {mirroredPose && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Mirrored Version
            </h3>
            <button
              onClick={() => onSelectPose(mirroredPose.id)}
              className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
            >
              {mirroredPose.name || mirroredPose.id}
            </button>
          </div>
        )}

        {containingFlowVariants.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Part of Flows
            </h3>
            <div className="space-y-2">
              {containingFlowVariants.map((flowVariant) => {
                const originalKey = getFlowVariantKey(flowVariant.flowName, false);
                const mirroredKey = getFlowVariantKey(flowVariant.flowName, true);
                const isOriginalActive = activeFlowName === originalKey;
                const isMirroredActive = activeFlowName === mirroredKey;

                return (
                  <div key={flowVariant.flowName} className="flex items-stretch">
                    {flowVariant.hasOriginal && (
                      <button
                        onClick={() => onFlowClick(originalKey)}
                        className={`flex-1 px-3 py-2 text-left text-sm rounded-l transition-colors font-medium border ${
                          isOriginalActive
                            ? 'bg-yellow-100 text-yellow-900 border-yellow-300'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-transparent'
                        } ${!flowVariant.hasMirrored ? 'rounded-r' : ''}`}
                      >
                        {flowVariant.flowName}
                      </button>
                    )}
                    {flowVariant.hasMirrored && (
                      <button
                        onClick={() => onFlowClick(mirroredKey)}
                        className={`px-3 py-2 font-medium transition-colors border ${
                          flowVariant.hasOriginal ? 'text-xs border-l border-gray-300 rounded-r' : 'text-sm flex-1 text-left rounded'
                        } ${
                          isMirroredActive
                            ? 'bg-yellow-100 text-yellow-900 border-yellow-300'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-transparent'
                        }`}
                        title="Mirrored variant"
                      >
                        {flowVariant.hasOriginal ? '⇄' : `${flowVariant.flowName} (mirrored)`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {ownFlowsWithPose.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              In My Flows
            </h3>
            <div className="space-y-2">
              {ownFlowsWithPose.map(flow => (
                <button
                  key={flow.name}
                  onClick={() => onFlowClick(OWN_FLOW_PREFIX + flow.name)}
                  className="w-full px-3 py-2 text-left text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                >
                  {flow.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {stepUps.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
              What's Next
            </h3>
            <p className="text-xs text-gray-500 mb-2">Harder poses reachable from here</p>
            <div className="space-y-2">
              {stepUps.map(({ pose: next, transition }) => (
                <button
                  key={next.id}
                  onClick={() => onSelectPose(next.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded border border-gray-200 hover:border-blue-400"
                >
                  <span className="flex-1 font-medium text-gray-800">{poseName(next)}</span>
                  <span className="text-xs text-gray-500">{transition.difficulty} transition</span>
                  <DifficultyBadge difficulty={next.difficulty} />
                </button>
              ))}
            </div>
          </div>
        )}

        {reversibleTransitions.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Transitions
            </h3>
            <div className="space-y-2">
              {reversibleTransitions.map((group) => {
                const primaryTransition = group.transitions[0];
                const primaryTargetId = group.targetPoseIds[0];
                const primaryTargetPose = poses.find((p) => p.id === primaryTargetId);
                const hasMirrored = group.transitions.length > 1;

                return (
                  <div key={primaryTargetId}>
                    <PoseButton
                      poseId={primaryTargetId}
                      poseName={primaryTargetPose?.name}
                      direction="bidirectional"
                      difficulty={primaryTransition.difficulty}
                      transitionName={primaryTransition.name}
                      onSelectPose={onSelectPose}
                      onDelete={() => handleDeleteTransition(primaryTransition.fromPoseId, primaryTransition.toPoseId)}
                      onDifficultyChange={(difficulty) => handleTransitionDifficultyChange(primaryTransition.fromPoseId, primaryTransition.toPoseId, difficulty)}
                      onNameChange={(name) => handleTransitionNameChange(primaryTransition.fromPoseId, primaryTransition.toPoseId, name)}
                    />
                    {hasMirrored && (
                      <button
                        onClick={() => onSelectPose(group.targetPoseIds[1])}
                        className="ml-8 mt-1 text-xs text-gray-500 hover:text-gray-700 italic hover:underline"
                      >
                        ⇄ Mirrored variant also available
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {nonReversibleFrom.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Transitions From This Pose
            </h3>
            <div className="space-y-2">
              {nonReversibleFrom.map((group) => {
                const primaryTransition = group.transitions[0];
                const primaryTargetId = group.targetPoseIds[0];
                const primaryTargetPose = poses.find((p) => p.id === primaryTargetId);
                const hasMirrored = group.transitions.length > 1;

                return (
                  <div key={primaryTargetId}>
                    <PoseButton
                      poseId={primaryTargetId}
                      poseName={primaryTargetPose?.name}
                      direction="to"
                      difficulty={primaryTransition.difficulty}
                      transitionName={primaryTransition.name}
                      onSelectPose={onSelectPose}
                      onDelete={() => handleDeleteTransition(primaryTransition.fromPoseId, primaryTransition.toPoseId)}
                      onDifficultyChange={(difficulty) => handleTransitionDifficultyChange(primaryTransition.fromPoseId, primaryTransition.toPoseId, difficulty)}
                      onNameChange={(name) => handleTransitionNameChange(primaryTransition.fromPoseId, primaryTransition.toPoseId, name)}
                    />
                    {hasMirrored && (
                      <button
                        onClick={() => onSelectPose(group.targetPoseIds[1])}
                        className="ml-8 mt-1 text-xs text-gray-500 hover:text-gray-700 italic hover:underline"
                      >
                        ⇄ Mirrored variant also available
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {nonReversibleTo.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Transitions To This Pose
            </h3>
            <div className="space-y-2">
              {nonReversibleTo.map((group) => {
                const primaryTransition = group.transitions[0];
                const primaryTargetId = group.targetPoseIds[0];
                const primaryTargetPose = poses.find((p) => p.id === primaryTargetId);
                const hasMirrored = group.transitions.length > 1;

                return (
                  <div key={primaryTargetId}>
                    <PoseButton
                      poseId={primaryTargetId}
                      poseName={primaryTargetPose?.name}
                      direction="from"
                      difficulty={primaryTransition.difficulty}
                      transitionName={primaryTransition.name}
                      onSelectPose={onSelectPose}
                      onDelete={() => handleDeleteTransition(primaryTransition.fromPoseId, primaryTransition.toPoseId)}
                      onDifficultyChange={(difficulty) => handleTransitionDifficultyChange(primaryTransition.fromPoseId, primaryTransition.toPoseId, difficulty)}
                      onNameChange={(name) => handleTransitionNameChange(primaryTransition.fromPoseId, primaryTransition.toPoseId, name)}
                    />
                    {hasMirrored && (
                      <button
                        onClick={() => onSelectPose(group.targetPoseIds[1])}
                        className="ml-8 mt-1 text-xs text-gray-500 hover:text-gray-700 italic hover:underline"
                      >
                        ⇄ Mirrored variant also available
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isLocalEditMode() && (
          <div className="mb-6">
            <AddTransitionForm
              currentPoseId={selectedPoseId}
              allPoses={poses}
              onSuccess={handleAddTransitionSuccess}
            />
          </div>
        )}
      </div>
    </div>
  );
}
