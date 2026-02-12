import { useState } from 'react';
import { PoseDifficulty } from '../types/data';
import { createPose } from '../api/poses';
import { mirrorText } from '../utils/mirrorText';

interface AddPoseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddPoseDialog({ isOpen, onClose, onSuccess }: AddPoseDialogProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<PoseDifficulty>('easy');
  const [createMirrored, setCreateMirrored] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSlug = (text: string): string => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  const handleNameBlur = () => {
    if (!id && name) {
      setId(generateSlug(name));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (createMirrored) {
        const mirroredId = mirrorText(id);
        const mirroredName = name ? mirrorText(name) : undefined;
        const mirroredDescription = description ? mirrorText(description) : undefined;

        await createPose({
          id,
          ...(name && { name }),
          ...(description && { description }),
          difficulty,
          mirroredPoseId: mirroredId,
        });

        await createPose({
          id: mirroredId,
          ...(mirroredName && { name: mirroredName }),
          ...(mirroredDescription && { description: mirroredDescription }),
          difficulty,
          mirroredPoseId: id,
        });
      } else {
        await createPose({
          id,
          ...(name && { name }),
          ...(description && { description }),
          difficulty,
        });
      }

      setId('');
      setName('');
      setDescription('');
      setDifficulty('easy');
      setCreateMirrored(false);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pose');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setId('');
    setName('');
    setDescription('');
    setDifficulty('easy');
    setCreateMirrored(false);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Pose</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., New Pose Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value.replace(/\s/g, ''))}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., new-pose-name"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Lowercase with hyphens, no spaces</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe the pose..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Difficulty <span className="text-red-500">*</span>
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as PoseDifficulty)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="easy">Easy</option>
              <option value="intermediate">Intermediate</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="createMirrored"
              checked={createMirrored}
              onChange={(e) => setCreateMirrored(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="createMirrored" className="text-sm text-gray-700">
              Create mirrored pose (swap Left/Right)
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-100 border border-red-300 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !id}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isSubmitting ? 'Adding...' : 'Add Pose'}
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
