import * as THREE from 'three';
import { Bone } from './Bone';
import { BoneKey, CONTACT_POINTS, JOINTS, JointId, SOLE_DEPTH, Side, boneKey } from './skeleton';

// Low-poly, slightly caricatured body. Torso, arms and legs are one skinned mesh, built from elliptical
// cross-sections along each bone and blended across the joints, so they bend smoothly. Head, hands and
// feet do not deform and are rigid meshes on their bone. Shapes are modelled for the left side.

const SEGMENTS = 8;
// Distance over which two bones share the vertices around their joint, unless a tube sets its own
const DEFAULT_BLEND = 0.05;

export interface Palette {
  left: THREE.Color;
  right: THREE.Color;
  shirt: THREE.Color;
  shorts: THREE.Color;
}

// Left is a cool, right a warm colour for both people
export const PALETTES = {
  base: { left: new THREE.Color(0x4f8ef7), right: new THREE.Color(0xf59e42), shirt: new THREE.Color(0xb0bec5), shorts: new THREE.Color(0x607d8b) },
  flyer: { left: new THREE.Color(0x2fb8a0), right: new THREE.Color(0xe85d8f), shirt: new THREE.Color(0xe2d6f0), shorts: new THREE.Color(0x8a5fa8) },
} satisfies Record<string, Palette>;

// For viewing: neutral clothing, the two people told apart by colour instead of their sides
export const DISPLAY_PALETTES = {
  base: { left: new THREE.Color(0x4b5563), right: new THREE.Color(0x4b5563), shirt: new THREE.Color(0xcbd5e1), shorts: new THREE.Color(0x374151) },
  flyer: { left: new THREE.Color(0x0f766e), right: new THREE.Color(0x0f766e), shirt: new THREE.Color(0xf5f0e6), shorts: new THREE.Color(0x115e59) },
} satisfies Record<string, Palette>;

const COLORS = {
  skin: new THREE.Color(0xf2c29b),
  dark: new THREE.Color(0x2a1f1a),
  hair: new THREE.Color(0x5a3b26),
};

// Position along the bone as share of its length (may lie beyond the joints), radii sideways (x) and
// front-back (z), and offsets of the centre front-back and towards the body's middle
type Ring = [t: number, rx: number, rz: number, cz?: number, inward?: number];

interface Tube {
  rings: Ring[];
  // Bone sharing the vertices at the far end of this one
  child?: JointId;
  // `y` is the distance along the bone from its joint
  color: (palette: Palette, side: Side | null, y: number) => THREE.Color;
  // Wider at ball joints, so their twist spreads over more of the limb
  blend?: number;
}

// Sideways distance (m) and height (share of the chest's length) over which the chest blends into the shoulder girdle
const GIRDLE_X = [0.06, 0.13];
const GIRDLE_T = [0.55, 0.85];

// Waist ring at which the shorts end (0.12 of the lower back's length)
const SHORTS_TOP = 0.12 * JOINTS.waist.length;

const limbColor = (palette: Palette, side: Side | null) => palette[side ?? 'left'];
// Limbs are drawn this much thicker than anatomical, for the caricature look
const LIMB_SCALE = 1.2;

// Limbs point down from their joint (local +Y is downwards, +Z is forward)
const TUBES: Partial<Record<JointId, Tube>> = {
  waist: {
    child: 'chest',
    color: (palette, _, y) => (y < SHORTS_TOP ? palette.shorts : palette.shirt),
    rings: [[-0.78, 0.06, 0.05], [-0.62, 0.13, 0.095, -0.012], [-0.38, 0.155, 0.11, -0.02], [-0.1, 0.15, 0.1, -0.01], [0.12, 0.142, 0.096, -0.004], [0.3, 0.13, 0.09], [0.7, 0.125, 0.088], [1, 0.135, 0.092]],
  },
  chest: {
    child: 'neck',
    color: palette => palette.shirt,
    rings: [[0, 0.135, 0.092], [0.35, 0.155, 0.105, 0.012], [0.65, 0.165, 0.1, 0.008], [0.85, 0.15, 0.088], [1, 0.1, 0.066], [1.08, 0.05, 0.048]],
  },
  neck: {
    color: () => COLORS.skin,
    rings: [[0, 0.048, 0.048], [0.12, 0.044, 0.046, 0.005], [0.3, 0.04, 0.042, 0.01]],
  },
  hip: {
    child: 'knee',
    color: limbColor,
    blend: 0.1,
    // Glutes reach above and behind the hip joint and stretch when the leg is piked
    rings: [[-0.15, 0.055, 0.06, -0.035], [0, 0.072, 0.085, -0.03], [0.15, 0.075, 0.08, -0.012], [0.45, 0.064, 0.068, 0.004], [0.8, 0.052, 0.054], [1, 0.047, 0.05]],
  },
  knee: {
    child: 'ankle',
    color: limbColor,
    rings: [[0, 0.047, 0.05], [0.12, 0.048, 0.054, -0.008], [0.3, 0.05, 0.06, -0.016], [0.6, 0.038, 0.042, -0.006], [0.9, 0.03, 0.032], [1, 0.03, 0.032]],
  },
  shoulder: {
    child: 'elbow',
    color: limbColor,
    blend: 0.09,
    // Deltoid capping the shoulder, sloping in towards the neck
    rings: [[-0.17, 0.03, 0.04, 0, 0.035], [-0.07, 0.052, 0.056, 0, 0.015], [0.08, 0.056, 0.052], [0.25, 0.05, 0.048], [0.6, 0.042, 0.042], [1, 0.035, 0.035]],
  },
  elbow: {
    child: 'wrist',
    color: () => COLORS.skin,
    rings: [[0, 0.035, 0.035], [0.25, 0.04, 0.036], [0.7, 0.031, 0.028], [1, 0.026, 0.022]],
  },
};

// Cross-section of a tube at `t` (share of the bone's length), interpolated between its rings
export function crossSection(joint: JointId, t: number): { rx: number; rz: number; cz: number; inward: number } {
  const { rings } = TUBES[joint]!;
  const clamped = THREE.MathUtils.clamp(t, rings[0][0], rings[rings.length - 1][0]);
  const k = Math.max(0, rings.findIndex(r => r[0] >= clamped) - 1);
  const [a, b] = [rings[k], rings[k + 1] ?? rings[k]];
  const share = b[0] === a[0] ? 0 : (clamped - a[0]) / (b[0] - a[0]);
  const lerp = (i: number) => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * share;
  const scale = JOINTS[joint].paired ? LIMB_SCALE : 1;
  return { rx: lerp(1) * scale, rz: lerp(2) * scale, cz: lerp(3), inward: lerp(4) };
}

export interface SkinnedBody {
  mesh: THREE.SkinnedMesh;
  // Bone of each triangle, for picking and highlighting
  faceBones: BoneKey[];
  baseColors: Float32Array;
}

// `bones` must be in the rest pose (neutral standing) with their world matrices updated
// `twists` are extra bones at the start of a limb bone that rotate only about its axis: the limb's vertices
// follow them increasingly towards its far end, so that it twists gradually instead of at one joint.
export function buildSkinnedBody(bones: Record<BoneKey, Bone>, twists: Partial<Record<BoneKey, THREE.Bone>>, palette: Palette): SkinnedBody {
  const boneList = Object.values(bones);
  const skeletonBones = [...boneList.map(b => b.node), ...Object.values(twists)];
  const indexOf = new Map(boneList.map((b, i) => [b.key, i]));
  const positions: number[] = [];
  const skinIndices: number[] = [];
  const skinWeightValues: number[] = [];
  const colors: number[] = [];
  const faceBones: BoneKey[] = [];

  for (const bone of boneList) {
    const tube = TUBES[bone.joint];
    if (!tube) continue;
    const parent = JOINTS[bone.joint].parent!;
    const parentKey = boneKey(parent, JOINTS[parent].paired ? bone.side : null);
    const childKey = tube.child ? boneKey(tube.child, JOINTS[tube.child].paired ? bone.side : null) : null;
    const mirrored = bone.side === 'right';

    const startBlend = tube.blend ?? DEFAULT_BLEND;
    const endBlend = (tube.child && TUBES[tube.child]?.blend) ?? DEFAULT_BLEND;
    // `x` is sideways in the bone's frame, only used for the chest
    const influences = (y: number, x: number): [BoneKey, number][] => {
      const self = THREE.MathUtils.clamp(0.5 + y / (2 * startBlend), 0, 1);
      const child = childKey ? THREE.MathUtils.clamp(0.5 + (y - bone.length) / (2 * endBlend), 0, 1) : 0;
      const result: [BoneKey, number][] = [[parentKey, 1 - self], [bone.key, self - child], ...(childKey ? [[childKey, child] as [BoneKey, number]] : [])];
      if (bone.joint !== 'chest') return result;
      // The top outer chest (trapezius, shoulder blade) moves with the shoulder girdle of its side
      const girdle = THREE.MathUtils.smoothstep(Math.abs(x), GIRDLE_X[0], GIRDLE_X[1]) * THREE.MathUtils.smoothstep(y / bone.length, GIRDLE_T[0], GIRDLE_T[1]);
      const own = result.find(([key]) => key === bone.key)!;
      const moved = own[1] * girdle;
      own[1] -= moved;
      return [...result, [boneKey('clavicle', x > 0 ? 'left' : 'right'), moved]];
    };

    const twist = twists[bone.key];
    const twistIndex = twist ? skeletonBones.indexOf(twist) : -1;
    const skinWeights = (y: number, x: number): [number, number][] => influences(y, x).flatMap(([key, weight]): [number, number][] => {
      if (key !== bone.key || !twist) return [[indexOf.get(key)!, weight]];
      const twisted = THREE.MathUtils.clamp(y / bone.length, 0, 1);
      return [[indexOf.get(key)!, weight * (1 - twisted)], [twistIndex, weight * twisted]];
    });

    const ringPoints = tube.rings.map(([t]) => {
      const y = t * bone.length;
      const { rx, rz, cz, inward } = crossSection(bone.joint, t);
      return Array.from({ length: SEGMENTS }, (_, k) => {
        const angle = (2 * Math.PI * k) / SEGMENTS + Math.PI / SEGMENTS;
        // Limbs point down from their joint, so their local +x points towards the body's middle
        const x = inward + rx * Math.cos(angle);
        const local = new THREE.Vector3(mirrored ? -x : x, y, cz + rz * Math.sin(angle));
        return { world: local.applyMatrix4(bone.node.matrixWorld), y, x: local.x };
      });
    });

    const addTriangle = (corners: { world: THREE.Vector3; y: number; x: number }[]) => {
      // Mirroring flips the winding
      const ordered = mirrored ? [corners[0], corners[2], corners[1]] : corners;
      const middleY = corners.reduce((sum, c) => sum + c.y, 0) / 3;
      const middleX = corners.reduce((sum, c) => sum + c.x, 0) / 3;
      const dominant = influences(middleY, middleX).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      faceBones.push(dominant);
      const color = tube.color(palette, bone.side, middleY);
      for (const corner of ordered) {
        positions.push(...corner.world.toArray());
        const weights = skinWeights(corner.y, corner.x);
        skinIndices.push(...weights.map(([index]) => index), ...Array(4 - weights.length).fill(0));
        skinWeightValues.push(...weights.map(([, w]) => w), ...Array(4 - weights.length).fill(0));
        colors.push(color.r, color.g, color.b);
      }
    };

    for (let r = 0; r < ringPoints.length - 1; r++) {
      for (let k = 0; k < SEGMENTS; k++) {
        const a = ringPoints[r][k], b = ringPoints[r][(k + 1) % SEGMENTS];
        const c = ringPoints[r + 1][(k + 1) % SEGMENTS], d = ringPoints[r + 1][k];
        addTriangle([a, c, b]);
        addTriangle([a, d, c]);
      }
    }
    // Close both ends, e.g. the crotch at the bottom of the pelvis
    for (const [ring, flip] of [[ringPoints[0], true], [ringPoints[ringPoints.length - 1], false]] as const) {
      const centre = { world: ring.reduce((s, p) => s.add(p.world), new THREE.Vector3()).divideScalar(SEGMENTS), y: ring[0].y, x: 0 };
      for (let k = 0; k < SEGMENTS; k++) {
        const a = ring[k], b = ring[(k + 1) % SEGMENTS];
        addTriangle(flip ? [centre, a, b] : [centre, b, a]);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeightValues, 4));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }));
  mesh.castShadow = true;
  // The rest-pose bounds are useless once the body lies down or flips over
  mesh.frustumCulled = false;
  mesh.bind(new THREE.Skeleton(skeletonBones));
  return { mesh, faceBones, baseColors: new Float32Array(colors) };
}

const flat = (color: THREE.Color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });

function meshAt(geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale?: [number, number, number]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  return mesh;
}

// Caricature head on the neck bone: local +Y up, face towards +Z
export function buildHead(): THREE.Group {
  const head = new THREE.Group();
  head.scale.setScalar(1.2);
  const skin = flat(COLORS.skin);
  const dark = flat(COLORS.dark);
  const skullCentre: [number, number, number] = [0, 0.17, 0.005];
  const skullShape: [number, number, number] = [0.92, 1.08, 1];
  head.add(meshAt(new THREE.IcosahedronGeometry(0.125, 1), skin, skullCentre, skullShape));
  head.add(meshAt(new THREE.IcosahedronGeometry(0.075, 1), skin, [0, 0.1, 0.045], [1.1, 0.8, 0.9])); // jaw
  // Hair cap: a shell around the skull with the same shape, large enough that the skull's corners stay
  // inside its flat faces. Only the cap opening is tilted back, so the hairline sits high on the forehead.
  const hairShell = new THREE.Group();
  hairShell.position.set(...skullCentre);
  hairShell.scale.set(...skullShape).multiplyScalar(1.12);
  // Open at the bottom, so its inside is drawn too and closes it when seen from below
  const hairMaterial = flat(COLORS.hair);
  hairMaterial.side = THREE.DoubleSide;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), hairMaterial);
  hair.rotation.x = -0.55;
  hairShell.add(hair);
  head.add(hairShell);
  for (const x of [-0.045, 0.045]) {
    head.add(meshAt(new THREE.IcosahedronGeometry(0.018, 0), dark, [x, 0.18, 0.11]));
    head.add(meshAt(new THREE.IcosahedronGeometry(0.03, 0), skin, [x * 2.6, 0.165, -0.005], [0.45, 1, 0.8])); // ears
  }
  const nose = meshAt(new THREE.ConeGeometry(0.024, 0.06, 4), skin, [0, 0.145, 0.135]);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);
  const mouth = meshAt(new THREE.BoxGeometry(0.05, 0.008, 0.01), dark, [0, 0.095, 0.112]);
  head.add(mouth);
  return head;
}

// Kneecap on the front of the knee and point of the elbow on its back, at the start of the shin / forearm
const JOINT_CAPS = {
  knee: { position: [0, 0.01, 0.05], radius: 0.036, scale: [1, 1.2, 0.5] },
  elbow: { position: [0, 0.004, -0.034], radius: 0.026, scale: [1, 1.2, 0.55] },
} satisfies Partial<Record<JointId, { position: [number, number, number]; radius: number; scale: [number, number, number] }>>;

export const CAPPED_JOINTS = Object.keys(JOINT_CAPS) as (keyof typeof JOINT_CAPS)[];

// Lighter than the limb's colour, so it shows on the coloured legs as on the bare forearms
export function buildJointCap(joint: keyof typeof JOINT_CAPS, palette: Palette, side: Side): THREE.Mesh {
  const { position, radius, scale } = JOINT_CAPS[joint];
  return meshAt(new THREE.IcosahedronGeometry(radius, 0), flat(palette[side].clone().lerp(new THREE.Color(0xffffff), 0.6)), position, scale);
}

// Mitten hand: palm normal +X (facing the body when standing), fingers along +Y, thumb towards +Z
export function buildHand(): THREE.Group {
  const hand = new THREE.Group();
  const skin = flat(COLORS.skin);
  const [palmSurface, palmCentre] = CONTACT_POINTS.wrist;
  const thickness = 2 * palmSurface;
  hand.add(meshAt(new THREE.BoxGeometry(thickness, palmCentre * 1.3, 0.085), skin, [0, palmCentre * 0.65, 0]));
  const fingers = meshAt(new THREE.BoxGeometry(thickness * 0.85, 0.08, 0.078), skin, [0.002, palmCentre * 1.3 + 0.037, 0]);
  fingers.rotation.z = 0.12; // slightly curled towards the palm
  hand.add(fingers);
  const thumb = meshAt(new THREE.BoxGeometry(0.02, 0.055, 0.022), skin, [0.006, 0.04, 0.05]);
  thumb.rotation.x = 0.6;
  hand.add(thumb);
  return hand;
}

// Foot from heel to toes along +Y, sole flat at SOLE_DEPTH below the ankle (local -Z points down)
export function buildFoot(): THREE.Mesh {
  // [forward position, half width, height above the sole]
  const sections: [number, number, number][] = [
    [-0.06, 0.028, 0.045], [-0.035, 0.036, 0.075], [0.02, 0.04, 0.07], [0.09, 0.047, 0.045], [0.16, 0.046, 0.03], [0.205, 0.034, 0.02],
  ];
  const rings = sections.map(([y, halfWidth, height]) => Array.from({ length: SEGMENTS }, (_, k) => {
    const angle = (2 * Math.PI * k) / SEGMENTS + Math.PI / SEGMENTS;
    const z = -SOLE_DEPTH + height / 2 + (height / 2) * Math.sin(angle);
    return new THREE.Vector3(halfWidth * Math.cos(angle), y, Math.max(z, -SOLE_DEPTH));
  }));
  const positions: number[] = [];
  const push = (...points: THREE.Vector3[]) => points.forEach(p => positions.push(p.x, p.y, p.z));
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const a = rings[r][k], b = rings[r][(k + 1) % SEGMENTS], c = rings[r + 1][(k + 1) % SEGMENTS], d = rings[r + 1][k];
      push(a, c, b, a, d, c);
    }
  }
  for (const [ring, flip] of [[rings[0], true], [rings[rings.length - 1], false]] as const) {
    const centre = ring.reduce((s, p) => s.clone().add(p), new THREE.Vector3()).divideScalar(SEGMENTS);
    for (let k = 0; k < SEGMENTS; k++) {
      const a = ring[k], b = ring[(k + 1) % SEGMENTS];
      if (flip) push(centre, a, b);
      else push(centre, b, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, flat(COLORS.skin));
}
