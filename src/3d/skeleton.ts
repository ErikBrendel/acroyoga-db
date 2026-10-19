// Coordinate system: Y up, the human faces +Z, their left side is +X.
// Paired joints are defined once for the LEFT side; the right side is the mirror image (x ↦ -x).
// All angles are 0 in the anatomical standing pose (arms hanging, palms facing the thighs, feet flat).
// Every angle is defined so that the same value means the same movement on both sides,
// e.g. positive `straddle` moves either leg outward. Equal left/right values therefore mean a symmetric pose.

export type Side = 'left' | 'right';
export type Axis = 'x' | '-x' | 'y' | '-y' | 'z' | '-z';

export interface AngleDef {
  name: string;
  axis: Axis;
  min: number;
  max: number;
  // Bends the mesh only and does not turn the bone, so it leaves the solver, sites and contacts alone
  meshOnly?: true;
}

interface JointDef {
  label: string;
  parent: JointId | null;
  paired: boolean;
  // Defaults to the end of the parent bone
  offset?: [number, number, number];
  length: number;
  baseRotation?: [number, number, number];
  // The parent's angles move this joint but do not turn the bone, e.g. the shoulder girdle shifts the
  // shoulder joint while the arm keeps hanging
  keepsOrientation?: boolean;
  // Applied in this order as intrinsic rotations, so every joint needs distinct axes
  angles: AngleDef[];
}

export const JOINT_IDS = ['root', 'waist', 'chest', 'neck', 'hip', 'knee', 'ankle', 'clavicle', 'shoulder', 'elbow', 'wrist'] as const;
export type JointId = (typeof JOINT_IDS)[number];

const LIMB_POINTING_DOWN: [number, number, number] = [0, 0, Math.PI];

export const JOINTS: Record<JointId, JointDef> = {
  root: {
    label: 'Pelvis',
    parent: null,
    paired: false,
    length: 0,
    angles: [
      { name: 'turn', axis: 'y', min: -180, max: 180 },
      { name: 'pitch', axis: 'x', min: -180, max: 180 },
      { name: 'roll', axis: '-z', min: -180, max: 180 },
    ],
  },
  waist: {
    label: 'Lower back',
    parent: 'root',
    paired: false,
    offset: [0, 0, 0],
    length: 0.22,
    angles: [
      { name: 'bend', axis: 'x', min: -40, max: 90 },
      { name: 'side', axis: '-z', min: -40, max: 40 },
      { name: 'twist', axis: 'y', min: -45, max: 45 },
    ],
  },
  chest: {
    label: 'Upper back',
    parent: 'waist',
    paired: false,
    length: 0.26,
    angles: [
      { name: 'bend', axis: 'x', min: -40, max: 60 },
      { name: 'side', axis: '-z', min: -30, max: 30 },
      { name: 'twist', axis: 'y', min: -40, max: 40 },
    ],
  },
  neck: {
    label: 'Head',
    parent: 'chest',
    paired: false,
    length: 0.25,
    angles: [
      { name: 'turn', axis: 'y', min: -80, max: 80 },
      { name: 'nod', axis: 'x', min: -60, max: 70 },
      { name: 'tilt', axis: '-z', min: -40, max: 40 },
    ],
  },
  hip: {
    label: 'Upper leg',
    parent: 'root',
    paired: true,
    offset: [0.1, -0.06, 0],
    length: 0.43,
    baseRotation: LIMB_POINTING_DOWN,
    angles: [
      { name: 'pike', axis: 'x', min: -30, max: 140 },
      { name: 'straddle', axis: 'z', min: -30, max: 110 },
      { name: 'rotate', axis: '-y', min: -60, max: 60 },
    ],
  },
  knee: {
    label: 'Lower leg',
    parent: 'hip',
    paired: true,
    length: 0.43,
    angles: [{ name: 'bend', axis: '-x', min: 0, max: 160 }],
  },
  ankle: {
    label: 'Foot',
    parent: 'knee',
    paired: true,
    length: 0.2,
    baseRotation: [Math.PI / 2, 0, 0],
    angles: [
      // Turning the toes outward about the shin axis. Anatomically mostly a twist of the shin at the knee;
      // the body mesh twists the shin along with it.
      { name: 'turn', axis: 'z', min: -20, max: 30 },
      { name: 'point', axis: '-x', min: -40, max: 90 },
      { name: 'tilt', axis: '-y', min: -30, max: 40 },
    ],
  },
  // Shoulder girdle (collarbone and shoulder blade), pivoting at the top of the breastbone. Simplified to a
  // bone straight out to the shoulder joint, so the joint moves on a sphere around that pivot.
  clavicle: {
    label: 'Shoulder',
    parent: 'chest',
    paired: true,
    offset: [0.02, 0.22, 0],
    length: 0.17,
    baseRotation: [0, 0, -Math.PI / 2],
    angles: [
      // Shoulder forward (towards where the person looks) / back, e.g. pushing up and settling in an L-base
      { name: 'protract', axis: 'x', min: -25, max: 20 },
      // Shrugging up / pulling down
      { name: 'elevate', axis: 'z', min: -10, max: 40 },
    ],
  },
  shoulder: {
    label: 'Upper arm',
    parent: 'clavicle',
    paired: true,
    keepsOrientation: true,
    length: 0.3,
    // Pointing down, relative to the collarbone pointing outward
    baseRotation: [0, 0, -Math.PI / 2],
    angles: [
      { name: 'forward', axis: 'x', min: -60, max: 180 },
      { name: 'raise', axis: 'z', min: -30, max: 180 },
      { name: 'rotate', axis: '-y', min: -90, max: 90 },
    ],
  },
  elbow: {
    label: 'Lower arm',
    parent: 'shoulder',
    paired: true,
    length: 0.26,
    angles: [
      { name: 'bend', axis: 'x', min: 0, max: 150 },
      { name: 'rotate', axis: '-y', min: -90, max: 90 },
    ],
  },
  wrist: {
    label: 'Hand',
    parent: 'elbow',
    paired: true,
    length: 0.18,
    angles: [
      { name: 'flex', axis: '-z', min: -80, max: 80 },
      { name: 'tilt', axis: 'x', min: -20, max: 30 },
      // Curling the four fingers towards the palm, the same angle at the knuckles and the middle finger joints
      { name: 'fingers', axis: '-z', min: -10, max: 90, meshOnly: true },
    ],
  },
};

// Height of the ankle joint above the sole, so feet stand on the floor in the neutral pose
export const SOLE_DEPTH = 0.05;

// Where a hand / foot touches what it is pinned to, in its (left side) bone frame:
// the centre of the palm surface and the centre of the sole. The hand mesh in Human.ts is built around it.
export const CONTACT_POINTS = {
  wrist: [0.0125, 0.075, 0],
  ankle: [0, JOINTS.ankle.length / 2, -SOLE_DEPTH],
} satisfies Partial<Record<JointId, [number, number, number]>>;

// Outward normal of the palm / sole at the contact point, in the same frame
export const CONTACT_NORMALS = {
  wrist: [1, 0, 0],
  ankle: [0, 0, -1],
} satisfies Record<keyof typeof CONTACT_POINTS, [number, number, number]>;

export const DEFAULT_ROOT_POSITION: [number, number, number] = [0, 0.97, 0];

// A concrete bone instance: unpaired joints exist once, paired joints once per side
export type BoneKey = JointId | `${Side}-${JointId}`;

export function boneKey(joint: JointId, side: Side | null): BoneKey {
  return side ? `${side}-${joint}` : joint;
}

export function boneLabel(joint: JointId, side: Side | null): string {
  const label = JOINTS[joint].label;
  return side ? `${side === 'left' ? 'Left' : 'Right'} ${label.toLowerCase()}` : label;
}

export interface BoneInfo {
  key: BoneKey;
  joint: JointId;
  side: Side | null;
}

export const ALL_BONES: BoneInfo[] = JOINT_IDS.flatMap((joint): BoneInfo[] =>
  JOINTS[joint].paired
    ? (['left', 'right'] as const).map(side => ({ key: boneKey(joint, side), joint, side }))
    : [{ key: boneKey(joint, null), joint, side: null }],
);

export const BONES = Object.fromEntries(ALL_BONES.map(bone => [bone.key, bone])) as Record<BoneKey, BoneInfo>;

export function oppositeBone(key: BoneKey): BoneKey | null {
  const { joint, side } = BONES[key];
  return side ? boneKey(joint, side === 'left' ? 'right' : 'left') : null;
}

// Mirroring across the x=0 plane keeps rotations about X and negates those about Y and Z
export function mirrorSign(axis: Axis): 1 | -1 {
  return axis.endsWith('x') ? 1 : -1;
}
