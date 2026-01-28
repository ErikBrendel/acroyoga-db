import { z } from 'zod';

export const PoseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  mirroredPoseId: z.string().optional(),
});

export const TransitionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  fromPoseId: z.string(),
  toPoseId: z.string(),
  mirroredTransitionId: z.string().optional(),
  nonReversible: z.boolean().optional(),
});

export type Pose = z.infer<typeof PoseSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
