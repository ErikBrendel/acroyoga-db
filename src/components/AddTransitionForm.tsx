import { useState } from 'react';
import { Pose } from '../types/data';
import { createTransition } from '../api/transitions';

interface AddTransitionFormProps {
  currentPoseId: string;
  allPoses: Pose[];
  onSuccess: () => void;
}

export function AddTransitionForm({ currentPoseId, allPoses, onSuccess }: AddTransitionFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [targetPoseId, setTargetPoseId] = useState('');
  const [nonReversible, setNonReversible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availablePoses = allPoses
    .filter(p => p.id !== currentPoseId)
    .sort((a, b) => {
      const nameA = (a.name || a.id).toLowerCase();
      const nameB = (b.name || b.id).toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPoseId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await createTransition({
        fromPoseId: currentPoseId,
        toPoseId: targetPoseId,
        nonReversible,
      });

      setIsOpen(false);
      setTargetPoseId('');
      setNonReversible(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create transition');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium text-sm"
      >
        + Add Transition
      </button>
    );
  }

  return (
    <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50">
      <h4 className="font-semibold text-gray-900 mb-3">Add New Transition</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Pose
          </label>
          <select
            value={targetPoseId}
            onChange={(e) => setTargetPoseId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          >
            <option value="">Select a pose...</option>
            {availablePoses.map(pose => (
              <option key={pose.id} value={pose.id}>
                {pose.name || pose.id}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="nonReversible"
            checked={nonReversible}
            onChange={(e) => setNonReversible(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="nonReversible" className="text-sm text-gray-700">
            Non-reversible (one-way only)
          </label>
        </div>

        {error && (
          <div className="p-2 bg-red-100 border border-red-300 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting || !targetPoseId}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium text-sm"
          >
            {isSubmitting ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setTargetPoseId('');
              setNonReversible(false);
              setError(null);
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors font-medium text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
