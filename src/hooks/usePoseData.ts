import { useState, useEffect } from 'react';
import { z } from 'zod';
import { Pose, Transition, PoseSchema, TransitionSchema } from '../types/data';

interface PoseData {
  poses: Pose[];
  transitions: Transition[];
  loading: boolean;
  error: string | null;
}

export function usePoseData(): PoseData {
  const [data, setData] = useState<PoseData>({
    poses: [],
    transitions: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function loadData() {
      try {
        const baseUrl = import.meta.env.BASE_URL;
        const [posesResponse, transitionsResponse] = await Promise.all([
          fetch(`${baseUrl}data/poses.json`),
          fetch(`${baseUrl}data/transitions.json`),
        ]);

        if (!posesResponse.ok) {
          throw new Error(`Failed to fetch poses: ${posesResponse.statusText}`);
        }
        if (!transitionsResponse.ok) {
          throw new Error(`Failed to fetch transitions: ${transitionsResponse.statusText}`);
        }

        const posesJson = await posesResponse.json();
        const transitionsJson = await transitionsResponse.json();

        const poses = z.array(PoseSchema).parse(posesJson);
        const transitions = z.array(TransitionSchema).parse(transitionsJson);

        // Validate data integrity
        const validationErrors = validateData(poses, transitions);
        if (validationErrors.length > 0) {
          throw new Error(`Data validation failed:\n${validationErrors.join('\n')}`);
        }

        setData({
          poses,
          transitions,
          loading: false,
          error: null,
        });
      } catch (err) {
        setData({
          poses: [],
          transitions: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error occurred',
        });
      }
    }

    loadData();
  }, []);

  return data;
}

function validateData(poses: Pose[], transitions: Transition[]): string[] {
  const errors: string[] = [];
  const poseIds = new Set(poses.map(p => p.id));

  // Check all transition references exist and forbid reflexive transitions
  transitions.forEach((transition, index) => {
    if (!poseIds.has(transition.fromPoseId)) {
      errors.push(`Transition ${index}: fromPoseId "${transition.fromPoseId}" does not exist`);
    }
    if (!poseIds.has(transition.toPoseId)) {
      errors.push(`Transition ${index}: toPoseId "${transition.toPoseId}" does not exist`);
    }
    if (transition.fromPoseId === transition.toPoseId) {
      errors.push(`Transition ${index}: reflexive transition not allowed (from "${transition.fromPoseId}" to itself)`);
    }
  });

  // Check for duplicate transitions and bidirectional conflicts
  const transitionPairs = new Set<string>();
  const reversiblePairs = new Set<string>();

  transitions.forEach((transition, index) => {
    const pairKey = `${transition.fromPoseId}->${transition.toPoseId}`;
    const reversePairKey = `${transition.toPoseId}->${transition.fromPoseId}`;
    const sortedPair = [transition.fromPoseId, transition.toPoseId].sort().join('<->');

    // Check for exact duplicates
    if (transitionPairs.has(pairKey)) {
      errors.push(`Transition ${index}: duplicate transition from "${transition.fromPoseId}" to "${transition.toPoseId}"`);
    }
    transitionPairs.add(pairKey);

    // Check for bidirectional conflicts (reversible transitions defined in both directions)
    if (!transition.nonReversible) {
      if (reversiblePairs.has(sortedPair)) {
        errors.push(`Transition ${index}: reversible transition between "${transition.fromPoseId}" and "${transition.toPoseId}" is defined in both directions`);
      }
      reversiblePairs.add(sortedPair);
    }

    // Check if a reversible transition conflicts with a reverse transition
    if (!transition.nonReversible && transitionPairs.has(reversePairKey)) {
      errors.push(`Transition ${index}: reversible transition from "${transition.fromPoseId}" to "${transition.toPoseId}" conflicts with reverse direction`);
    }
  });

  return errors;
}
