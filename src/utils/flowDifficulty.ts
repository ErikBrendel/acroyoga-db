import { Flow, Pose, Transition, PoseDifficulty, TransitionDifficulty } from '../types/data';

interface DifficultyValue {
  value: number;
  weight: number;
}

const POSE_DIFFICULTY_VALUES: Record<PoseDifficulty, DifficultyValue> = {
  easy: { value: 1, weight: 1 },
  intermediate: { value: 2, weight: 2 },
  hard: { value: 3, weight: 4 },
};

const TRANSITION_DIFFICULTY_VALUES: Record<TransitionDifficulty, DifficultyValue | null> = {
  trivial: null, // Ignore trivial
  easy: { value: 1, weight: 2 },      // 2x pose weight
  intermediate: { value: 2, weight: 4 }, // 2x pose weight
  hard: { value: 3, weight: 8 },      // 2x pose weight
};

function calculateWeightedAverage(items: DifficultyValue[]): number {
  if (items.length === 0) {
    return 0;
  }

  const weightedSum = items.reduce((sum, item) => sum + item.value * item.weight, 0);
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);

  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}

export function calculateFlowDifficulty(
  flow: Flow,
  poses: Pose[],
  transitions: Transition[]
): number {
  const difficultyItems: DifficultyValue[] = [];

  // Add difficulty for each pose in the flow
  for (const poseId of flow.poseIds) {
    const pose = poses.find(p => p.id === poseId);
    if (pose) {
      difficultyItems.push(POSE_DIFFICULTY_VALUES[pose.difficulty]);
    }
  }

  // Add difficulty for each transition between consecutive poses
  for (let i = 0; i < flow.poseIds.length - 1; i++) {
    const fromPoseId = flow.poseIds[i];
    const toPoseId = flow.poseIds[i + 1];

    // Find transition in either direction
    const transition = transitions.find(
      t =>
        (t.fromPoseId === fromPoseId && t.toPoseId === toPoseId) ||
        (t.fromPoseId === toPoseId && t.toPoseId === fromPoseId && !t.nonReversible)
    );

    if (transition) {
      const diffValue = TRANSITION_DIFFICULTY_VALUES[transition.difficulty];
      if (diffValue !== null) {
        difficultyItems.push(diffValue);
      }
    }
  }

  return calculateWeightedAverage(difficultyItems);
}
