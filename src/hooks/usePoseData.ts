import { useState, useEffect } from 'react';
import { z } from 'zod';
import { Pose, Transition, Flow, PoseSchema, TransitionSchema, FlowSchema } from '../types/data';
import { mirrorText } from '../utils/mirrorText';

interface PoseData {
  poses: Pose[];
  transitions: Transition[];
  flows: Flow[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePoseData(): PoseData {
  const [data, setData] = useState<Omit<PoseData, 'refetch'>>({
    poses: [],
    transitions: [],
    flows: [],
    loading: true,
    error: null,
  });

  const loadData = async () => {
      try {
        const baseUrl = import.meta.env.BASE_URL;
        const [posesResponse, transitionsResponse, flowsResponse] = await Promise.all([
          fetch(`${baseUrl}data/poses.json`),
          fetch(`${baseUrl}data/transitions.json`),
          fetch(`${baseUrl}data/flows.json`),
        ]);

        if (!posesResponse.ok) {
          throw new Error(`Failed to fetch poses: ${posesResponse.statusText}`);
        }
        if (!transitionsResponse.ok) {
          throw new Error(`Failed to fetch transitions: ${transitionsResponse.statusText}`);
        }
        if (!flowsResponse.ok) {
          throw new Error(`Failed to fetch flows: ${flowsResponse.statusText}`);
        }

        const posesJson = await posesResponse.json();
        const transitionsJson = await transitionsResponse.json();
        const flowsJson = await flowsResponse.json();

        const poses = z.array(PoseSchema).parse(posesJson);
        const transitions = z.array(TransitionSchema).parse(transitionsJson);
        const flows = z.array(FlowSchema).parse(flowsJson);

        // Validate data integrity
        const validationErrors = validateData(poses, transitions, flows);
        if (validationErrors.length > 0) {
          throw new Error(`Data validation failed:\n${validationErrors.join('\n')}`);
        }

        setData({
          poses,
          transitions,
          flows,
          loading: false,
          error: null,
        });
      } catch (err) {
        setData({
          poses: [],
          transitions: [],
          flows: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error occurred',
        });
      }
  }

  useEffect(() => {
    loadData();
  }, []);

  return {
    ...data,
    refetch: loadData,
  };
}

function validateData(poses: Pose[], transitions: Transition[], flows: Flow[]): string[] {
  const errors: string[] = [];

  // Check unique pose IDs
  const poseIds = new Set<string>();
  const poseMap = new Map<string, Pose>();
  poses.forEach((pose, index) => {
    if (poseIds.has(pose.id)) {
      errors.push(`Pose ${index}: duplicate pose ID "${pose.id}"`);
    }
    poseIds.add(pose.id);
    poseMap.set(pose.id, pose);
  });

  // Check mirrored poses contain directional indicator
  poses.forEach((pose) => {
    if (pose.mirroredPoseId) {
      const hasDirection = (s: string) => s.toLowerCase().includes('left') || s.toLowerCase().includes('right');
      if (!hasDirection(pose.id)) {
        errors.push(`Pose "${pose.id}": is mirrored but id does not contain "left" or "right"`);
      }
      if (!hasDirection(pose.name || '')) {
        errors.push(`Pose "${pose.id}": is mirrored but name does not contain "left" or "right"`);
      }
      if (!hasDirection(pose.description || '')) {
        errors.push(`Pose "${pose.id}": is mirrored but description does not contain "left" or "right"`);
      }
    }
  });

  // Check mirrored poses are bidirectional and have matching mirrored content
  poses.forEach((pose) => {
    if (pose.mirroredPoseId) {
      if (!poseIds.has(pose.mirroredPoseId)) {
        errors.push(`Pose "${pose.id}": mirroredPoseId "${pose.mirroredPoseId}" does not exist`);
      } else {
        const mirroredPose = poseMap.get(pose.mirroredPoseId);
        if (mirroredPose && mirroredPose.mirroredPoseId !== pose.id) {
          errors.push(`Pose "${pose.id}": mirrored pose "${pose.mirroredPoseId}" does not mirror back (expected mirroredPoseId="${pose.id}", got "${mirroredPose.mirroredPoseId || 'none'}")`);
        }

        if (mirroredPose) {
          if (pose.id && mirroredPose.id) {
            const expectedMirroredId = mirrorText(pose.id);
            if (mirroredPose.id !== expectedMirroredId) {
              errors.push(`Pose "${pose.id}": mirrored pose ID should be "${expectedMirroredId}" but is "${mirroredPose.id}"`);
            }
          }

          if (pose.name && mirroredPose.name) {
            const expectedMirroredName = mirrorText(pose.name);
            if (mirroredPose.name !== expectedMirroredName) {
              errors.push(`Pose "${pose.id}": mirrored pose name should be "${expectedMirroredName}" but is "${mirroredPose.name}"`);
            }
          }

          if (pose.description && mirroredPose.description) {
            const expectedMirroredDesc = mirrorText(pose.description);
            if (mirroredPose.description !== expectedMirroredDesc) {
              errors.push(`Pose "${pose.id}": mirrored pose description does not match (expected mirrored version)`);
            }
          }

          // Check that mirrored poses have the same difficulty
          if (pose.difficulty !== mirroredPose.difficulty) {
            errors.push(`Pose "${pose.id}": difficulty "${pose.difficulty || 'unset'}" does not match mirrored pose "${mirroredPose.id}" difficulty "${mirroredPose.difficulty || 'unset'}"`);
          }
        }
      }
    }
  });

  // Check unique flow names
  const flowNames = new Set<string>();
  flows.forEach((flow, index) => {
    if (flowNames.has(flow.name)) {
      errors.push(`Flow ${index}: duplicate flow name "${flow.name}"`);
    }
    flowNames.add(flow.name);
  });

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

  // Check mirrored transitions exist
  transitions.forEach((transition) => {
    const fromPose = poseMap.get(transition.fromPoseId);
    const toPose = poseMap.get(transition.toPoseId);

    if (!fromPose || !toPose) return;

    const fromMirrorId = fromPose.mirroredPoseId;
    const toMirrorId = toPose.mirroredPoseId;

    // If at least one pose has a mirror, check for mirrored transition
    if (fromMirrorId || toMirrorId) {
      const expectedFromId = fromMirrorId || transition.fromPoseId;
      const expectedToId = toMirrorId || transition.toPoseId;

      // Skip if this is the same transition (both poses not mirrored, or only one mirrored to itself)
      if (expectedFromId === transition.fromPoseId && expectedToId === transition.toPoseId) {
        return;
      }

      const mirroredPairKey = `${expectedFromId}->${expectedToId}`;
      const mirroredReversePairKey = `${expectedToId}->${expectedFromId}`;

      const hasMirroredTransition = transitionPairs.has(mirroredPairKey) ||
        (!transition.nonReversible && transitionPairs.has(mirroredReversePairKey));

      if (!hasMirroredTransition) {
        errors.push(`Transition "${transition.fromPoseId}" → "${transition.toPoseId}": missing mirrored transition "${expectedFromId}" → "${expectedToId}"`);
      } else {
        // Check that mirrored transitions have the same difficulty
        const mirroredTransition = transitions.find(t =>
          (t.fromPoseId === expectedFromId && t.toPoseId === expectedToId) ||
          (!transition.nonReversible && !t.nonReversible && t.fromPoseId === expectedToId && t.toPoseId === expectedFromId)
        );

        if (mirroredTransition && transition.difficulty !== mirroredTransition.difficulty) {
          errors.push(`Transition "${transition.fromPoseId}" → "${transition.toPoseId}": difficulty "${transition.difficulty || 'unset'}" does not match mirrored transition "${expectedFromId}" → "${expectedToId}" difficulty "${mirroredTransition.difficulty || 'unset'}"`);
        }
      }
    }
  });

  // Validate flows
  flows.forEach((flow) => {
    // Check minimum length
    if (flow.poseIds.length < 3) {
      errors.push(`Flow "${flow.name}": must contain at least 3 poses`);
    }

    // Check all pose IDs exist
    flow.poseIds.forEach((poseId, poseIndex) => {
      if (!poseIds.has(poseId)) {
        errors.push(`Flow "${flow.name}" pose ${poseIndex}: pose "${poseId}" does not exist`);
      }
    });

    // Check consecutive poses have valid transitions
    for (let i = 0; i < flow.poseIds.length - 1; i++) {
      const fromPose = flow.poseIds[i];
      const toPose = flow.poseIds[i + 1];

      const hasTransition = transitions.some(t =>
        (t.fromPoseId === fromPose && t.toPoseId === toPose) ||
        (!t.nonReversible && t.fromPoseId === toPose && t.toPoseId === fromPose)
      );

      if (!hasTransition) {
        errors.push(`Flow "${flow.name}": no transition exists between "${fromPose}" and "${toPose}"`);
      }
    }
  });

  return errors;
}
