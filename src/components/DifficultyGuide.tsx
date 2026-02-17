import { useState } from 'react';
import { getPoseColor, getTransitionColor } from '../utils/difficultyColors';

export function DifficultyGuide() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`text-sm font-medium flex items-center gap-1 px-3 py-1.5 rounded-full transition-all ${
          isOpen
            ? 'text-blue-600 bg-blue-50 shadow-md'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
        }`}
        title="Difficulty Guidelines"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        Difficulties
      </button>

      {isOpen && (
        <div className="fixed top-20 left-2 w-96 max-w-[calc(100vw-1rem)] bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-[100] text-xs">
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
          </div>
        </div>
      )}
    </div>
  );
}
