import { z } from 'zod';

export const PoseDifficultySchema = z.enum(['easy', 'intermediate', 'hard']);
export const TransitionDifficultySchema = z.enum(['trivial', 'easy', 'intermediate', 'hard']);

export const PoseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  mirroredPoseId: z.string().optional(),
  difficulty: PoseDifficultySchema,
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
});

export const TransitionSchema = z.object({
  fromPoseId: z.string(),
  toPoseId: z.string(),
  nonReversible: z.boolean().optional(),
  difficulty: TransitionDifficultySchema,
  name: z.string().optional(),
});

export const FlowSchema = z.object({
  name: z.string(),
  poseIds: z.array(z.string()),
});

export type PoseDifficulty = z.infer<typeof PoseDifficultySchema>;
export type TransitionDifficulty = z.infer<typeof TransitionDifficultySchema>;
export type Pose = z.infer<typeof PoseSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type Flow = z.infer<typeof FlowSchema>;
