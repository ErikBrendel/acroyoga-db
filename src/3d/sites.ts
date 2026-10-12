import * as THREE from 'three';
import { z } from 'zod';
import { crossSection } from './bodyMesh';
import { HumanPose } from './humanPose';
import { worldMatrix } from './ik';
import { ALL_BONES, BoneKey, CONTACT_NORMALS, CONTACT_POINTS, JOINTS, JointId, Side, boneKey } from './skeleton';

// A contact site is a point on the body surface with a frame: `normal` points out of the surface and
// `direction` along it, towards the fingers / toes on hands and feet, towards the far end on limbs and
// towards the head on the torso. A site is either named ("left-sole", "belly") or a coordinate on a
// segment's surface: `along` from 0 (its joint, or the crotch for the pelvis) to 1 (its far end), `around`
// in degrees from the front, positive towards the outside of a limb or the left of the torso.

type Vec3 = [number, number, number];

// `tube` is the body mesh tube the surface is taken from, `from` / `to` the part of it (as share of the
// tube bone's length) that `along` spans
const SEGMENTS = {
  pelvis: { joint: 'root', tube: 'waist', from: -0.62, to: 0 },
  'lower-back': { joint: 'waist', tube: 'waist', from: 0, to: 1 },
  'upper-back': { joint: 'chest', tube: 'chest', from: 0, to: 0.85 },
  thigh: { joint: 'hip', tube: 'hip', from: 0, to: 1 },
  shin: { joint: 'knee', tube: 'knee', from: 0, to: 1 },
  'upper-arm': { joint: 'shoulder', tube: 'shoulder', from: 0, to: 1 },
  forearm: { joint: 'elbow', tube: 'elbow', from: 0, to: 1 },
} satisfies Record<string, { joint: JointId; tube: JointId; from: number; to: number }>;

type SegmentName = keyof typeof SEGMENTS;

interface Coordinate {
  segment: SegmentName;
  along: number;
  around: number;
}

// In the (left side) frame of the joint's bone
interface FixedFrame {
  joint: JointId;
  point: Vec3;
  normal: Vec3;
  direction: Vec3;
}

type SiteDef = Coordinate | FixedFrame;

// Defined for the left side, the right side is the mirror image
const PAIRED_SITES: Record<string, SiteDef> = {
  palm: { joint: 'wrist', point: CONTACT_POINTS.wrist, normal: CONTACT_NORMALS.wrist, direction: [0, 1, 0] },
  'hand-back': { joint: 'wrist', point: [-CONTACT_POINTS.wrist[0], CONTACT_POINTS.wrist[1], 0], normal: [-1, 0, 0], direction: [0, 1, 0] },
  sole: { joint: 'ankle', point: CONTACT_POINTS.ankle, normal: CONTACT_NORMALS.ankle, direction: [0, 1, 0] },
  instep: { joint: 'ankle', point: [0, 0.1, -0.005], normal: [0, 0, 1], direction: [0, 1, 0] },
  knee: { segment: 'shin', along: 0.05, around: 0 },
  shin: { segment: 'shin', along: 0.45, around: 0 },
  thigh: { segment: 'thigh', along: 0.5, around: 0 },
  // Front of the hip bone
  hip: { segment: 'pelvis', along: 0.8, around: 35 },
  // Top of the shoulder, between neck and arm
  shoulder: { joint: 'clavicle', point: [-0.015, 0.11, -0.01], normal: [-1, 0, 0], direction: [0, 0, 1] },
};

const CENTER_SITES: Record<string, SiteDef> = {
  belly: { segment: 'lower-back', along: 0.3, around: 0 },
  sacrum: { segment: 'pelvis', along: 0.75, around: 180 },
  chest: { segment: 'upper-back', along: 0.6, around: 0 },
  'upper-back': { segment: 'upper-back', along: 0.6, around: 180 },
  crown: { joint: 'neck', point: [0, 0.385, 0.006], normal: [0, 1, 0], direction: [0, 0, 1] },
};

export const SiteSchema = z.union([z.string(), z.object({ segment: z.string(), along: z.number(), around: z.number() })]);
export type Site = z.infer<typeof SiteSchema>;

export const SITE_NAMES = [
  ...Object.keys(PAIRED_SITES).flatMap(name => [`left-${name}`, `right-${name}`]),
  ...Object.keys(CENTER_SITES),
];

function splitSide(name: string): [Side | null, string] {
  const match = /^(left|right)-(.+)$/.exec(name);
  return match ? [match[1] as Side, match[2]] : [null, name];
}

function definitionOf(site: Site): { side: Side | null; def: SiteDef } {
  if (typeof site === 'string') {
    const [side, name] = splitSide(site);
    const def = side ? PAIRED_SITES[name] : CENTER_SITES[name];
    if (!def) throw new Error(`Unknown site "${site}"`);
    return { side, def };
  }
  const [side, name] = splitSide(site.segment);
  const segment = SEGMENTS[name as SegmentName];
  if (!segment || JOINTS[segment.joint].paired !== (side !== null)) throw new Error(`Unknown segment "${site.segment}"`);
  return { side, def: { segment: name as SegmentName, along: site.along, around: site.around } };
}

const jointOf = (def: SiteDef) => ('joint' in def ? def.joint : SEGMENTS[def.segment].joint);

// Limbs point down from their joint, so their local +X points towards the body's middle
const lateralSign = (joint: JointId) => (JOINTS[joint].paired ? -1 : 1);

function leftFrame(def: SiteDef): { point: THREE.Vector3; normal: THREE.Vector3; direction: THREE.Vector3 } {
  if ('joint' in def) {
    return { point: new THREE.Vector3(...def.point), normal: new THREE.Vector3(...def.normal), direction: new THREE.Vector3(...def.direction) };
  }
  const { joint, tube, from, to } = SEGMENTS[def.segment];
  const t = from + def.along * (to - from);
  const { rx, rz, cz, inward } = crossSection(tube, t);
  const lateral = lateralSign(joint);
  const angle = THREE.MathUtils.degToRad(def.around);
  return {
    point: new THREE.Vector3(inward + lateral * rx * Math.sin(angle), t * JOINTS[tube].length, cz + rz * Math.cos(angle)),
    normal: new THREE.Vector3(lateral * Math.sin(angle) / rx, 0, Math.cos(angle) / rz).normalize(),
    direction: new THREE.Vector3(0, 1, 0),
  };
}

// The site's frame relative to its bone: Z is the normal, Y the direction
export function localSiteFrame(site: Site): { bone: BoneKey; matrix: THREE.Matrix4 } {
  const { side, def } = definitionOf(site);
  const joint = jointOf(def);
  const { point, normal, direction } = leftFrame(def);
  if (side === 'right') [point, normal, direction].forEach(v => { v.x *= -1; });
  const y = direction.clone().addScaledVector(normal, -direction.dot(normal)).normalize();
  const x = y.clone().cross(normal);
  return {
    bone: boneKey(joint, JOINTS[joint].paired ? side : null),
    matrix: new THREE.Matrix4().makeBasis(x, y, normal).setPosition(point),
  };
}

export function siteMatrix(pose: HumanPose, site: Site): THREE.Matrix4 {
  const { bone, matrix } = localSiteFrame(site);
  return worldMatrix(pose, bone).multiply(matrix);
}

const NAMED_FRAMES = SITE_NAMES.map(name => ({ name, ...localSiteFrame(name) }));
// Picked points closer than this to a named site snap onto it
const SNAP_DISTANCE = 0.04;

// The site at a point (in the bone's frame) picked on the body
export function siteAt(bone: BoneKey, point: THREE.Vector3): Site {
  const nearest = NAMED_FRAMES
    .filter(f => f.bone === bone)
    .map(f => ({ name: f.name, distance: new THREE.Vector3().setFromMatrixPosition(f.matrix).distanceTo(point) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const { joint, side } = ALL_BONES.find(b => b.key === bone)!;
  const segmentName = (Object.keys(SEGMENTS) as SegmentName[]).find(name => SEGMENTS[name].joint === joint);
  if (!segmentName || (nearest && nearest.distance < SNAP_DISTANCE)) return nearest.name;

  const { tube, from, to } = SEGMENTS[segmentName];
  const x = side === 'right' ? -point.x : point.x;
  const t = point.y / JOINTS[tube].length;
  const { rx, rz, cz, inward } = crossSection(tube, t);
  const around = THREE.MathUtils.radToDeg(Math.atan2(lateralSign(joint) * (x - inward) / rx, (point.z - cz) / rz));
  return {
    segment: side ? `${side}-${segmentName}` : segmentName,
    along: round(THREE.MathUtils.clamp((t - from) / (to - from), 0, 1), 2),
    around: round(around, 0),
  };
}

const round = (value: number, decimals: number) => Number(value.toFixed(decimals)) || 0;

export const normalizeDegrees = (degrees: number) => round(180 - THREE.MathUtils.euclideanModulo(180 - degrees, 360), 1);

const swapSide = (name: string) => {
  const [side, rest] = splitSide(name);
  return side ? `${side === 'left' ? 'right' : 'left'}-${rest}` : name;
};

export function mirrorSite(site: Site): Site {
  if (typeof site === 'string') return swapSide(site);
  const [side] = splitSide(site.segment);
  return side ? { ...site, segment: swapSide(site.segment) } : { ...site, around: normalizeDegrees(-site.around) };
}

export function siteLabel(site: Site): string {
  if (typeof site === 'string') return site.replace(/-/g, ' ');
  return `${site.segment.replace(/-/g, ' ')} ${Math.round(site.along * 100)}% ${site.around}°`;
}
