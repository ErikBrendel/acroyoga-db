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
        const [posesResponse, transitionsResponse] = await Promise.all([
          fetch('/data/poses.json'),
          fetch('/data/transitions.json'),
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
