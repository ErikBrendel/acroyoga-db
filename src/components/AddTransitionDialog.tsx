import { Pose } from '../types/data';
import { TransitionForm } from './TransitionForm';

interface AddTransitionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onDataChange?: () => void;
  fromPoseId: string;
  allPoses: Pose[];
}

export function AddTransitionDialog({ isOpen, onClose, onSuccess, onDataChange, fromPoseId, allPoses }: AddTransitionDialogProps) {
  const fromPose = allPoses.find(p => p.id === fromPoseId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Add New Transition</h2>
        <p className="text-sm text-gray-600 mb-4">
          From: <span className="font-medium">{fromPose?.name || fromPoseId}</span>
        </p>
        <TransitionForm
          fromPoseId={fromPoseId}
          allPoses={allPoses}
          onSuccess={() => { onSuccess(); onClose(); }}
          onCancel={onClose}
          onDataChange={onDataChange}
        />
      </div>
    </div>
  );
}
