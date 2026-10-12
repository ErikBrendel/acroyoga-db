import { z } from 'zod';
import { AcroPose, Contact, ROLES, Role, StoredAcroPoseSchema, movesLimb, parseAcroPose } from '../../src/3d/acroPose';
import { HumanPose, StoredHumanPose, neutralPose, serializeHumanPose, withJoints } from '../../src/3d/humanPose';
import { FixedAngle } from '../../src/3d/ik';
import { findPreset } from '../../src/3d/presets';
import { ALL_BONES, JOINTS, JointId } from '../../src/3d/skeleton';

const PersonSchema = z.strictObject({
  presets: z.array(z.string()).optional(),
  joints: z.record(z.string(), z.unknown()).optional(),
  position: z.tuple([z.number(), z.number(), z.number()]).optional(),
  grounded: z.boolean().optional(),
});

const ContactSchema = z.object({
  // "fit": `a`'s person moves as a whole (then `b`'s limb reaches back); "reach": `a`'s limb moves by IK.
  // Default: reach if `a` is on an arm or leg, otherwise fit
  solve: z.enum(['fit', 'reach']).optional(),
}).passthrough();

export const ParamsSchema = z.strictObject({
  poseId: z.string(),
  base: PersonSchema,
  flyer: PersonSchema,
  contacts: z.array(ContactSchema),
  locks: z.partialRecord(z.enum(ROLES), z.array(z.string())).optional(),
  rounds: z.number().optional(),
  fitRotate: z.boolean().optional(),
});
export type Params = z.infer<typeof ParamsSchema>;

export interface Setup {
  pose: AcroPose;
  solveOf: Map<Contact, 'fit' | 'reach'>;
  locks: Record<Role, FixedAngle[]>;
  grounded: Record<Role, boolean>;
}

const LEGS: JointId[] = ['hip', 'knee', 'ankle'];
const ARMS: JointId[] = ['clavicle', 'shoulder', 'elbow', 'wrist'];
const LOCK_GROUPS: Record<string, JointId[]> = { legs: LEGS, leg: LEGS, arms: ARMS, arm: ARMS, spine: ['waist', 'chest', 'neck'] };

// "legs" | "arms" | "spine" | "<joint>" | "<joint>.<angle>", each optionally "left-" / "right-" for one side
// ("left-arm", "right-leg.knee" is not valid: use "right-knee")
export function parseLock(spec: string): FixedAngle[] {
  const [bonePart, angle] = spec.split('.');
  const side = /^(left|right)-/.exec(bonePart)?.[1];
  const name = side ? bonePart.slice(side.length + 1) : bonePart;
  const joints = LOCK_GROUPS[name] ?? (name in JOINTS ? [name as JointId] : null);
  if (!joints) throw new Error(`Unknown lock "${spec}": use legs, arms, spine, a joint (${Object.keys(JOINTS).join(', ')}), optionally with .<angle> and left-/right-`);
  return ALL_BONES
    .filter(b => joints.includes(b.joint) && (!side || b.side === side))
    .flatMap(b => JOINTS[b.joint].angles
      .filter(a => !angle || a.name === angle)
      .map(a => ({ key: b.key, name: a.name })));
}

function person(spec: z.infer<typeof PersonSchema>): HumanPose {
  const presets = (spec.presets ?? []).map(name => findPreset(name).joints);
  const joints = [...presets, spec.joints ?? {}].reduce((pose, j) => withJoints(pose, j as never), neutralPose());
  return spec.position ? { ...joints, position: spec.position } : joints;
}

export function setUp(params: Params): Setup {
  const stored: StoredHumanPose = serializeHumanPose(neutralPose());
  const solveOf = new Map<Contact, 'fit' | 'reach'>();
  const contacts = params.contacts.flatMap(({ solve, ...contact }) => {
    const parsed = parseAcroPose(StoredAcroPoseSchema.parse({ base: stored, flyer: stored, contacts: [contact] })).contacts;
    parsed.forEach(c => solveOf.set(c, solve ?? (movesLimb(c.a.site) || c.a.role === c.b.role ? 'reach' : 'fit')));
    return parsed;
  });
  const base = person(params.base);
  const flyer = person(params.flyer);
  return {
    pose: { base, flyer, contacts },
    solveOf,
    locks: { base: (params.locks?.base ?? []).flatMap(parseLock), flyer: (params.locks?.flyer ?? []).flatMap(parseLock) },
    grounded: { base: params.base.grounded ?? true, flyer: params.flyer.grounded ?? false },
  };
}

