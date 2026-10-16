import { useState } from 'react';
import { goTo, View } from '../utils/navigation';

interface HomeViewProps {
  poseCount: number;
  transitionCount: number;
  flowCount: number;
}

export function HomeView({ poseCount, transitionCount, flowCount }: HomeViewProps) {
  const [search, setSearch] = useState('');

  const entries: [View, string, string][] = [
    ['poses', 'Poses', `All ${poseCount} poses with their names, difficulty and what follows from them`],
    ['flows', 'Flows', `${flowCount} flows to follow, and your own flows to keep and share`],
    ['map', 'Map', `How the poses connect: ${transitionCount} transitions on one map`],
    ['about', 'About', 'What this is, and other acroyoga references'],
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900">Acroyoga DB</h1>
      <p className="mt-2 text-gray-600">
        L-base acroyoga poses, the transitions between them and flows built from them. A reference for between
        sessions; learning a pose still happens with a teacher, a base and a spotter.
      </p>
      <form
        className="mt-6"
        onSubmit={(e) => { e.preventDefault(); goTo('poses', { search: search.trim() || null }); }}
      >
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a pose, e.g. throne or teardrop"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {entries.map(([view, title, text]) => (
          <button
            key={view}
            onClick={() => goTo(view)}
            className="text-left p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow transition"
          >
            <div className="font-semibold text-gray-900">{title}</div>
            <div className="text-sm text-gray-600 mt-1">{text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
