import { useState } from 'react';
import { Pose, Transition } from '../types/data';
import { createFlow } from '../api/flows';

interface AddFlowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  poses: Pose[];
  transitions: Transition[];
}

export function AddFlowDialog({ isOpen, onClose, onSuccess, poses, transitions }: AddFlowDialogProps) {
  const [name, setName] = useState('');
  const [poseIds, setPoseIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedPoses = poses.slice().sort((a, b) => {
    const nameA = (a.name || a.id).toLowerCase();
    const nameB = (b.name || b.id).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const getConnectedPoses = (fromPoseId: string): string[] => {
    const connected = new Set<string>();
    transitions.forEach(t => {
      if (t.fromPoseId === fromPoseId) {
        connected.add(t.toPoseId);
      }
      if (!t.nonReversible && t.toPoseId === fromPoseId) {
        connected.add(t.fromPoseId);
      }
    });
    return Array.from(connected);
  };

  const handleAddPose = (poseId: string) => {
    if (poseId) {
      setPoseIds([...poseIds, poseId]);
    }
  };

  const handleRemovePose = (index: number) => {
    setPoseIds(poseIds.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || poseIds.length < 3) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await createFlow({ name, poseIds });
      setName('');
      setPoseIds([]);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flow');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setName('');
    setPoseIds([]);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const lastPoseId = poseIds.length > 0 ? poseIds[poseIds.length - 1] : null;
  const availablePoses = lastPoseId
    ? getConnectedPoses(lastPoseId).map(id => poses.find(p => p.id === id)!).filter(Boolean)
    : sortedPoses;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Flow</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Flow Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., My Flow"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Poses (minimum 3) <span className="text-red-500">*</span>
            </label>

            {poseIds.length > 0 && (
              <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  Selected Sequence ({poseIds.length} poses)
                </div>
                <div className="space-y-1">
                  {poseIds.map((poseId, index) => {
                    const pose = poses.find(p => p.id === poseId);
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-6">{index + 1}.</span>
                        <span className="flex-1 text-sm font-medium text-gray-900">
                          {pose?.name || poseId}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePose(index)}
                          className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-100 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <select
                onChange={(e) => {
                  handleAddPose(e.target.value);
                  e.target.value = '';
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSubmitting}
              >
                <option value="">
                  {poseIds.length === 0
                    ? 'Select starting pose...'
                    : `Add next pose (${availablePoses.length} available)...`}
                </option>
                {availablePoses
                  .sort((a, b) => {
                    const nameA = (a.name || a.id).toLowerCase();
                    const nameB = (b.name || b.id).toLowerCase();
                    return nameA.localeCompare(nameB);
                  })
                  .map(pose => (
                    <option key={pose.id} value={pose.id}>
                      {pose.name || pose.id}
                    </option>
                  ))}
              </select>
            </div>

            {poseIds.length > 0 && poseIds.length < 3 && (
              <p className="text-xs text-orange-600 mt-1">
                Add at least {3 - poseIds.length} more pose(s)
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-100 border border-red-300 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !name || poseIds.length < 3}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isSubmitting ? 'Creating...' : 'Create Flow'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
