import { StoredJoints } from './humanPose';
import { Effector } from './ik';
import { JOINT_IDS, JOINTS } from './skeleton';

export interface PresetGroup {
  name: string;
  // Body presets change the orientation, so the root is moved to stand/lie on the floor afterwards
  grounded: boolean;
  // Hands / feet planted flat on the floor via IK, after the rest of the body was grounded
  presets: { name: string; joints: StoredJoints; planted?: Effector[] }[];
}

const HANDS: Effector[] = ['left-wrist', 'right-wrist'];

// Every angle not given is reset to 0
function wholeBody(joints: StoredJoints): StoredJoints {
  return Object.fromEntries(JOINT_IDS.map(joint => [
    joint,
    { ...Object.fromEntries(JOINTS[joint].angles.map(a => [a.name, 0])), ...joints[joint] },
  ]));
}

export const PRESET_GROUPS: PresetGroup[] = [
  {
    name: 'Whole',
    grounded: true,
    presets: [
      { name: 'Neutral', joints: wholeBody({}) },
      {
        name: 'L-base',
        joints: wholeBody({
          root: { pitch: -90 }, hip: { pike: 90 }, ankle: { point: -15 },
          shoulder: { forward: 90 }, elbow: { rotate: -27.2 }, wrist: { flex: -54.8 },
        }),
      },
      {
        name: '2-high prep',
        joints: wholeBody({
          hip: { pike: 60, straddle: 20, rotate: 20 }, knee: { bend: 95 }, ankle: { point: -35 },
          waist: { bend: 15 }, shoulder: { forward: 150, raise: 15 }, elbow: { bend: 10 },
        }),
      },
      {
        name: 'Deep squat',
        joints: wholeBody({
          hip: { pike: 115, straddle: 20, rotate: 25 }, knee: { bend: 150 }, ankle: { point: -40 },
          waist: { bend: 25 }, shoulder: { forward: 80 }, elbow: { bend: 20 },
        }),
      },
      {
        name: 'Cat',
        joints: wholeBody({
          root: { pitch: 52 }, hip: { pike: 52 }, knee: { bend: 90 }, ankle: { point: 85 },
          waist: { bend: 20 }, chest: { bend: 20 }, neck: { nod: 40 },
          shoulder: { forward: 92 }, elbow: { rotate: -90 }, wrist: { flex: -80 },
        }),
        planted: HANDS,
      },
      {
        name: 'Cow',
        joints: wholeBody({
          root: { pitch: 100 }, hip: { pike: 100 }, knee: { bend: 90 }, ankle: { point: 85 },
          waist: { bend: -15 }, chest: { bend: -15 }, neck: { nod: -40 },
          shoulder: { forward: 70 }, elbow: { rotate: -90 }, wrist: { flex: -80 },
        }),
        planted: HANDS,
      },
      {
        name: 'Cobra',
        joints: wholeBody({
          root: { pitch: 90 }, ankle: { point: 85 },
          waist: { bend: -40 }, chest: { bend: -40 }, neck: { nod: -20 },
          shoulder: { forward: 30 }, elbow: { rotate: -90 }, wrist: { flex: -80 },
        }),
        planted: HANDS,
      },
      {
        name: 'Down dog',
        joints: wholeBody({
          root: { pitch: 130 }, hip: { pike: 92 }, ankle: { point: -40 },
          shoulder: { forward: 175 }, elbow: { rotate: -90 }, wrist: { flex: -45 },
        }),
        planted: HANDS,
      },
    ],
  },
  {
    name: 'Orient',
    grounded: true,
    presets: [
      { name: 'Upright', joints: { root: { turn: 0, pitch: 0, roll: 0 } } },
      { name: 'On back', joints: { root: { turn: 0, pitch: -90, roll: 0 } } },
      { name: 'On belly', joints: { root: { turn: 0, pitch: 90, roll: 0 } } },
      { name: 'Upside down', joints: { root: { turn: 0, pitch: 180, roll: 0 } } },
    ],
  },
  {
    name: 'Legs',
    grounded: false,
    presets: [
      { name: 'Straight', joints: { hip: { pike: 0, straddle: 0, rotate: 0 }, knee: { bend: 0 } } },
      { name: 'Straddle', joints: { hip: { pike: 0, straddle: 60 }, knee: { bend: 0 } } },
      { name: 'Pike', joints: { hip: { pike: 90, straddle: 0 }, knee: { bend: 0 } } },
      { name: 'Straddle pike', joints: { hip: { pike: 80, straddle: 50 }, knee: { bend: 0 } } },
      { name: 'Tuck', joints: { hip: { pike: 110, straddle: 0 }, knee: { bend: 130 } } },
      { name: 'Base legs up', joints: { hip: { pike: 90, straddle: 0 }, knee: { bend: 0 }, ankle: { point: -10 } } },
    ],
  },
  {
    name: 'Feet',
    grounded: false,
    presets: [
      { name: 'Neutral', joints: { ankle: { point: 0, tilt: 0 } } },
      { name: 'Pointed', joints: { ankle: { point: 70, tilt: 0 } } },
      { name: 'Flexed', joints: { ankle: { point: -25, tilt: 0 } } },
    ],
  },
  {
    name: 'Arms',
    grounded: false,
    presets: [
      { name: 'Hanging', joints: { shoulder: { forward: 0, raise: 0, rotate: 0 }, elbow: { bend: 0, rotate: 0 }, wrist: { flex: 0, tilt: 0 } } },
      { name: 'Relaxed', joints: { shoulder: { forward: 10, raise: 10, rotate: 0 }, elbow: { bend: 25, rotate: 0 }, wrist: { flex: 10, tilt: 0 } } },
      { name: 'T', joints: { shoulder: { forward: 0, raise: 90, rotate: 0 }, elbow: { bend: 0, rotate: 0 } } },
      { name: 'Forward', joints: { shoulder: { forward: 90, raise: 0, rotate: 0 }, elbow: { bend: 0, rotate: 0 } } },
      { name: 'Overhead', joints: { shoulder: { forward: 180, raise: 0, rotate: 0 }, elbow: { bend: 0, rotate: 0 } } },
      // Solved with IK: palms together in front of the chest, fingers up and slightly forward
      { name: 'Namaste', joints: { shoulder: { forward: 12, raise: 15.4, rotate: -79.6 }, elbow: { bend: 104.6, rotate: -9.5 }, wrist: { flex: -80, tilt: 30 } } },
      { name: 'Hands on hips', joints: { shoulder: { forward: -9.8, raise: 42.3, rotate: -74.5 }, elbow: { bend: 87.1, rotate: -20.2 }, wrist: { flex: -34.3, tilt: 0.4 } } },
    ],
  },
];

export const findPreset = (name: string): PresetGroup['presets'][number] => {
  const preset = PRESET_GROUPS.flatMap(g => g.presets).find(p => p.name === name);
  if (!preset) throw new Error(`Unknown preset "${name}", known: ${PRESET_GROUPS.flatMap(g => g.presets.map(p => p.name)).join(', ')}`);
  return preset;
};
