import { useState } from 'react';
import { getPoseColor, getTransitionColor } from '../utils/difficultyColors';

const POPUP_WIDTH = 384;

/** Explains the difficulty levels; `compact` shows only an info icon, e.g. next to a difficulty badge */
export function DifficultyGuide({ compact = false }: { compact?: boolean }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const toggle = (button: HTMLElement) => {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 8)) });
  };

  return (
    <>
      <button
        onClick={(e) => toggle(e.currentTarget)}
        className={`text-sm font-medium inline-flex items-center gap-1 rounded-full transition-all ${compact ? 'p-1' : 'px-3 py-1.5'} ${
          position ? 'text-blue-600 bg-blue-50 shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
        }`}
        title="What the difficulties mean"
        aria-label="What the difficulties mean"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        {!compact && 'Difficulties'}
      </button>

      {position && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setPosition(null)} />
          <div
            className="fixed max-w-[calc(100vw-1rem)] bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-[100] text-xs"
            style={{ ...position, width: POPUP_WIDTH }}
          >
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Difficulty Guidelines</h3>

            <div className="space-y-2">
              <div>
                <span className="font-medium" style={{color: getTransitionColor('trivial')}}>Trivial</span>: Just a technicality, everybody can do it.
              </div>
              <div>
                <span className="font-medium" style={{color: getPoseColor('easy')}}>Easy</span>
                {' / '}
                <span className="font-medium" style={{color: getTransitionColor('easy')}}>Easy</span>: Could be the topic in an "introduction to acroyoga" course, even (athletic) beginners can learn this in a few hours.
              </div>
              <div>
                <span className="font-medium" style={{color: getPoseColor('intermediate')}}>Intermediate</span>
                {' / '}
                <span className="font-medium" style={{color: getTransitionColor('intermediate')}}>Intermediate</span>: Might need a few practice runs to get it, or might need tips from a tutor to get it right.
              </div>
              <div>
                <span className="font-medium" style={{color: getPoseColor('hard')}}>Hard</span>
                {' / '}
                <span className="font-medium" style={{color: getTransitionColor('hard')}}>Hard</span>: Usually takes a few years of acro experience to get it, is even a slight achievement to finally stick it.
              </div>
              <p className="text-gray-500 pt-1">Pose colours are blue shades, transition colours green to red. A flow's stars combine its poses and transitions.</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
