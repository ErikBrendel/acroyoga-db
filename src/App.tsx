import { useState } from 'react';
import { usePoseData } from './hooks/usePoseData';
import { PoseGraph } from './components/PoseGraph';
import { PoseDetailSidebar } from './components/PoseDetailSidebar';
import { transformToGraph } from './utils/graphTransform';

function App() {
  const { poses, transitions, loading, error } = usePoseData();
  const [selectedPoseId, setSelectedPoseId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading pose data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <h2 className="text-xl font-bold text-red-600 mb-3">Error Loading Data</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{error}</p>
        </div>
      </div>
    );
  }

  const { nodes, edges } = transformToGraph(poses, transitions);

  return (
    <div className="w-screen h-screen relative bg-gray-50">
      <div className="absolute top-0 left-0 p-4 z-10 bg-white shadow-md rounded-br-lg">
        <h1 className="text-xl font-bold text-gray-900">Acroyoga Pose Graph</h1>
        <p className="text-sm text-gray-600">{poses.length} poses, {transitions.length} transitions</p>
      </div>
      <PoseGraph
        nodes={nodes}
        edges={edges}
        selectedPoseId={selectedPoseId}
        onSelectPose={setSelectedPoseId}
      />
      <PoseDetailSidebar
        selectedPoseId={selectedPoseId}
        poses={poses}
        transitions={transitions}
        onSelectPose={setSelectedPoseId}
      />
    </div>
  );
}

export default App;
