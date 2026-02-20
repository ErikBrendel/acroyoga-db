import { useState } from 'react';
import { Pose, TransitionDifficulty } from '../types/data';
import { createTransition } from '../api/transitions';
import { AddPoseDialog } from './AddPoseDialog';

interface TransitionFormProps {
  fromPoseId: string;
  allPoses: Pose[];
  onSuccess: () => void;
  onCancel: () => void;
  onDataChange?: () => void;
}

export function TransitionForm({ fromPoseId, allPoses, onSuccess, onCancel, onDataChange }: TransitionFormProps) {
  const [targetPoseId, setTargetPoseId] = useState('');
  const [nonReversible, setNonReversible] = useState(false);
  const [difficulty, setDifficulty] = useState<TransitionDifficulty>('easy');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addPoseOpen, setAddPoseOpen] = useState(false);

  const availablePoses = allPoses
    .filter(p => p.id !== fromPoseId)
    .sort((a, b) => (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase()));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPoseId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await createTransition({ fromPoseId, toPoseId: targetPoseId, nonReversible, difficulty });
      setTargetPoseId('');
      setNonReversible(false);
      setDifficulty('easy');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create transition');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Pose
          </label>
          <div className="flex gap-2">
            <select
              value={targetPoseId}
              onChange={(e) => setTargetPoseId(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            >
              <option value="">Select a pose...</option>
              {availablePoses.map(pose => (
                <option key={pose.id} value={pose.id}>{pose.name || pose.id}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAddPoseOpen(true)}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap"
              title="Create a new pose"
            >
              + Pose
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Difficulty <span className="text-red-500">*</span>
          </label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as TransitionDifficulty)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          >
            <option value="trivial">Trivial</option>
            <option value="easy">Easy</option>
            <option value="intermediate">Intermediate</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`non-reversible-${fromPoseId}`}
            checked={nonReversible}
            onChange={(e) => setNonReversible(e.target.checked)}
          />
          <label htmlFor={`non-reversible-${fromPoseId}`} className="text-sm text-gray-700">
            Non-reversible (one-way only)
          </label>
        </div>

        {error && (
          <div className="p-2 bg-red-100 border border-red-300 rounded text-sm text-red-700">{error}</div>
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
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors font-medium text-sm"
          >
            Cancel
          </button>
        </div>
      </form>

      <AddPoseDialog
        isOpen={addPoseOpen}
        onClose={() => setAddPoseOpen(false)}
        onSuccess={() => onDataChange?.()}
      />
    </>
  );
}
