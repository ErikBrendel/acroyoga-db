import { goTo, View } from '../utils/navigation';

const LINKS: [View, string][] = [['poses', 'Poses'], ['flows', 'Flows'], ['map', 'Map'], ['about', 'About']];

export function NavBar({ view }: { view: View }) {
  return (
    <nav className="shrink-0 flex items-center gap-0.5 px-2 py-2 bg-white border-b border-gray-200 z-30 overflow-x-auto">
      <button onClick={() => goTo('home', { pose: null, flow: null })} className="mr-1 px-1 font-bold text-gray-900 whitespace-nowrap">
        Acroyoga DB
      </button>
      {LINKS.map(([target, label]) => (
        <button
          key={target}
          onClick={() => goTo(target, { flow: null, pose: null })}
          className={`px-2.5 py-1.5 rounded text-sm font-medium whitespace-nowrap ${
            view === target ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
