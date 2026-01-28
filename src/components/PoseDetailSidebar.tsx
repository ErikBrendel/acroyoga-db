import { Pose, Transition } from '../types/data';

interface PoseDetailSidebarProps {
  selectedPoseId: string | null;
  poses: Pose[];
  transitions: Transition[];
  onSelectPose: (poseId: string | null) => void;
}

export function PoseDetailSidebar({
  selectedPoseId,
  poses,
  transitions,
  onSelectPose,
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
                  <div key={transition.id} className="border-l-4 border-green-500 pl-3 py-2">
                    <button
                      onClick={() => onSelectPose(connectedPoseId)}
                      className="text-green-600 hover:text-green-800 hover:underline font-medium text-left"
                    >
                      ↔ {connectedPose?.name || connectedPoseId}
                    </button>
                    {transition.name && (
                      <p className="text-sm text-gray-600 mt-1">{transition.name}</p>
                    )}
                    {transition.description && (
                      <p className="text-sm text-gray-500 mt-1">{transition.description}</p>
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
              {nonReversibleFrom.map((transition) => {
                const targetPose = poses.find((p) => p.id === transition.toPoseId);
                return (
                  <div key={transition.id} className="border-l-4 border-blue-500 pl-3 py-2">
                    <button
                      onClick={() => onSelectPose(transition.toPoseId)}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
                    >
                      → {targetPose?.name || transition.toPoseId}
                    </button>
                    {transition.name && (
                      <p className="text-sm text-gray-600 mt-1">{transition.name}</p>
                    )}
                    {transition.description && (
                      <p className="text-sm text-gray-500 mt-1">{transition.description}</p>
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
              {nonReversibleTo.map((transition) => {
                const sourcePose = poses.find((p) => p.id === transition.fromPoseId);
                return (
                  <div key={transition.id} className="border-l-4 border-blue-500 pl-3 py-2">
                    <button
                      onClick={() => onSelectPose(transition.fromPoseId)}
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
                    >
                      ← {sourcePose?.name || transition.fromPoseId}
                    </button>
                    {transition.name && (
                      <p className="text-sm text-gray-600 mt-1">{transition.name}</p>
                    )}
                    {transition.description && (
                      <p className="text-sm text-gray-500 mt-1">{transition.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
