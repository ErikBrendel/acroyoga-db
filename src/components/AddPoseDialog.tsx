import { useState } from 'react';
import { Pose } from '../types/data';
import { createPose } from '../api/poses';

interface AddPoseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingPoses: Pose[];
}

export function AddPoseDialog({ isOpen, onClose, onSuccess, existingPoses }: AddPoseDialogProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mirroredPoseId, setMirroredPoseId] = useState('');
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
      await createPose({
        id,
        ...(name && { name }),
        ...(description && { description }),
        ...(mirroredPoseId && { mirroredPoseId }),
      });

      setId('');
      setName('');
      setDescription('');
      setMirroredPoseId('');
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
    setMirroredPoseId('');
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
              Mirrored Pose ID (optional)
            </label>
            <select
              value={mirroredPoseId}
              onChange={(e) => setMirroredPoseId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {existingPoses
                .filter(pose => !pose.mirroredPoseId)
                .slice()
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
