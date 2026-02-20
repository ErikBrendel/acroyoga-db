import { useState } from 'react';
import { Pose } from '../types/data';
import { TransitionForm } from './TransitionForm';

interface AddTransitionFormProps {
  currentPoseId: string;
  allPoses: Pose[];
  onSuccess: () => void;
}

export function AddTransitionForm({ currentPoseId, allPoses, onSuccess }: AddTransitionFormProps) {
  const [isOpen, setIsOpen] = useState(false);

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
      <TransitionForm
        fromPoseId={currentPoseId}
        allPoses={allPoses}
        onSuccess={() => { setIsOpen(false); onSuccess(); }}
        onCancel={() => setIsOpen(false)}
        onDataChange={onSuccess}
      />
    </div>
  );
}
