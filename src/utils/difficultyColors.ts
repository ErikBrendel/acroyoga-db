import { PoseDifficulty, TransitionDifficulty } from '../types/data';

export function getTransitionColor(difficulty: TransitionDifficulty): string {
  switch (difficulty) {
    case 'trivial':
      return '#5ae4d9';
    case 'easy':
      return '#10b981';
    case 'intermediate':
      return '#f59e0b';
    case 'hard':
      return '#ef4444';
  }
}

export function getPoseColor(difficulty: PoseDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return '#93a3f3';
    case 'intermediate':
      return '#6366f1';
    case 'hard':
      return '#2e1aa6';
  }
}
