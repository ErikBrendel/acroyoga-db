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
}

interface JointDef {
  label: string;
  parent: JointId | null;
  paired: boolean;
  // Defaults to the end of the parent bone
  offset?: [number, number, number];
  length: number;
  radius: number;
  baseRotation?: [number, number, number];
  // Applied in this order as intrinsic rotations, so every joint needs distinct axes
  angles: AngleDef[];
}

export const JOINT_IDS = ['root', 'waist', 'chest', 'neck', 'hip', 'knee', 'ankle', 'shoulder', 'elbow', 'wrist'] as const;
export type JointId = (typeof JOINT_IDS)[number];

const LIMB_POINTING_DOWN: [number, number, number] = [0, 0, Math.PI];

export const JOINTS: Record<JointId, JointDef> = {
  root: {
    label: 'Pelvis',
    parent: null,
    paired: false,
    length: 0,
    radius: 0.07,
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
    radius: 0.065,
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
    radius: 0.075,
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
    radius: 0.04,
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
    radius: 0.055,
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
    radius: 0.045,
    angles: [{ name: 'bend', axis: '-x', min: 0, max: 160 }],
  },
  ankle: {
    label: 'Foot',
    parent: 'knee',
    paired: true,
    length: 0.2,
    radius: 0.035,
    baseRotation: [Math.PI / 2, 0, 0],
    angles: [
      { name: 'point', axis: '-x', min: -30, max: 90 },
      { name: 'tilt', axis: '-y', min: -30, max: 40 },
    ],
  },
  shoulder: {
    label: 'Upper arm',
    parent: 'chest',
    paired: true,
    offset: [0.19, 0.22, 0],
    length: 0.3,
    radius: 0.04,
    baseRotation: LIMB_POINTING_DOWN,
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
    radius: 0.035,
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
    radius: 0.03,
    angles: [
      { name: 'flex', axis: '-z', min: -80, max: 80 },
      { name: 'tilt', axis: 'x', min: -20, max: 30 },
    ],
  },
};

// Where a hand / foot touches what it is pinned to, in its (left side) bone frame:
// the centre of the palm surface and the centre of the sole. The hand mesh in Human.ts is built around it.
export const CONTACT_POINTS = {
  wrist: [0.0125, 0.075, 0],
  ankle: [0, JOINTS.ankle.length / 2, -JOINTS.ankle.radius],
} satisfies Partial<Record<JointId, [number, number, number]>>;

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
