import { Pose, Transition, Flow } from '../types/data';
import { PoseButton } from './PoseButton';

interface PoseDetailSidebarProps {
  selectedPoseId: string | null;
  poses: Pose[];
  transitions: Transition[];
  flows: Flow[];
  activeFlowName: string | null;
  onSelectPose: (poseId: string | null) => void;
  onFlowClick: (flowName: string) => void;
}

export function PoseDetailSidebar({
  selectedPoseId,
  poses,
  transitions,
  flows,
  activeFlowName,
  onSelectPose,
  onFlowClick,
}: PoseDetailSidebarProps) {
  if (!selectedPoseId) {
    return null;
  }

  const pose = poses.find((p) => p.id === selectedPoseId);
  if (!pose) {
    return null;
  }

  const reversibleTransitions = transitions.filter(
    (t) => !t.nonReversible && (t.fromPoseId === selectedPoseId || t.toPoseId === selectedPoseId)
  );
  const nonReversibleFrom = transitions.filter(
    (t) => t.nonReversible && t.fromPoseId === selectedPoseId
  );
  const nonReversibleTo = transitions.filter(
    (t) => t.nonReversible && t.toPoseId === selectedPoseId
  );
  const mirroredPose = pose.mirroredPoseId ? poses.find((p) => p.id === pose.mirroredPoseId) : null;
  const containingFlows = flows.filter((f) => f.poseIds.includes(selectedPoseId));

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-white shadow-2xl border-l border-gray-200 overflow-y-auto z-10">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-bold text-gray-900">
            {pose.name || pose.id}
          </h2>
          <button
            onClick={() => onSelectPose(null)}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {pose.mirroredPoseId && (
          <div className="mb-4 px-3 py-2 bg-blue-100 text-blue-800 rounded text-sm font-medium">
            Handed pose
          </div>
        )}

        {pose.description && (
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

        {containingFlows.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Part of Flows
            </h3>
            <div className="space-y-2">
              {containingFlows.map((flow) => (
                <button
                  key={flow.name}
                  onClick={() => onFlowClick(flow.name)}
                  className={`block w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors ${
                    activeFlowName === flow.name
                      ? 'bg-yellow-100 text-yellow-900 border border-yellow-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {flow.name}
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
              {reversibleTransitions.map((transition) => {
                const connectedPoseId = transition.fromPoseId === selectedPoseId
                  ? transition.toPoseId
                  : transition.fromPoseId;
                const connectedPose = poses.find((p) => p.id === connectedPoseId);
                return (
                  <PoseButton
                    key={connectedPoseId}
                    poseId={connectedPoseId}
                    poseName={connectedPose?.name}
                    direction="bidirectional"
                    onSelectPose={onSelectPose}
                  />
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
              {nonReversibleFrom.map((transition) => {
                const targetPose = poses.find((p) => p.id === transition.toPoseId);
                return (
                  <PoseButton
                    key={transition.toPoseId}
                    poseId={transition.toPoseId}
                    poseName={targetPose?.name}
                    direction="to"
                    onSelectPose={onSelectPose}
                  />
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
              {nonReversibleTo.map((transition) => {
                const sourcePose = poses.find((p) => p.id === transition.fromPoseId);
                return (
                  <PoseButton
                    key={transition.fromPoseId}
                    poseId={transition.fromPoseId}
                    poseName={sourcePose?.name}
                    direction="from"
                    onSelectPose={onSelectPose}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
