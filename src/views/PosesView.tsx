import { Pose, PoseDifficulty } from '../types/data';
import { useUrlState } from '../hooks/useUrlState';
import { SearchInput } from '../components/SearchInput';
import { DifficultyBadge } from '../components/DifficultyBadge';
import { DifficultyGuide } from '../components/DifficultyGuide';
import { matchedAlias, poseName, searchPoses } from '../utils/poseNames';

const DIFFICULTIES: PoseDifficulty[] = ['easy', 'intermediate', 'hard'];

interface PosesViewProps {
  poses: Pose[];
  selectedPoseId: string | null;
  onSelectPose: (poseId: string) => void;
}

export function PosesView({ poses, selectedPoseId, onSelectPose }: PosesViewProps) {
  const [search, setSearch] = useUrlState<string>('search', '');
  const [difficulty, setDifficulty] = useUrlState<string | null>('difficulty', null);

  const found = searchPoses(poses, search)
    .filter(pose => !difficulty || pose.difficulty === difficulty)
    .sort((a, b) => poseName(a).localeCompare(poseName(b)));

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <SearchInput value={search} onChange={setSearch} placeholder="Search names, other names and descriptions" />
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {[null, ...DIFFICULTIES].map(d => (
          <button
            key={d ?? 'all'}
            onClick={() => setDifficulty(d)}
            className={`px-3 py-1 rounded-full text-sm border ${
              difficulty === d ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {d ? d.charAt(0).toUpperCase() + d.slice(1) : 'All'}
          </button>
        ))}
        <DifficultyGuide compact />
      </div>
      <p className="mt-3 text-sm text-gray-500">{found.length} of {poses.length} poses</p>
      <ul className="mt-2 divide-y divide-gray-100 bg-white border border-gray-200 rounded-lg">
        {found.map(pose => {
          const alias = matchedAlias(pose, search);
          return (
            <li key={pose.id}>
              <button
                onClick={() => onSelectPose(pose.id)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${
                  selectedPoseId === pose.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{poseName(pose)}</div>
                  {alias ? (
                    <div className="text-sm text-gray-600">found as "{alias}"</div>
                  ) : pose.aliases && (
                    <div className="text-sm text-gray-500 truncate">also {pose.aliases.join(', ')}</div>
                  )}
                </div>
                <DifficultyBadge difficulty={pose.difficulty} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
