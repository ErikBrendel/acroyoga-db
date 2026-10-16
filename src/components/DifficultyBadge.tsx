import { PoseDifficulty } from '../types/data';
import { getPoseColor } from '../utils/difficultyColors';

export function DifficultyBadge({ difficulty }: { difficulty: PoseDifficulty }) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs font-semibold text-white rounded"
      style={{ backgroundColor: getPoseColor(difficulty) }}
    >
      {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
    </span>
  );
}
