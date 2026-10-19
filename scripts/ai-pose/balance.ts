import * as THREE from 'three';
import { AcroPose, Role } from '../../src/3d/acroPose';
import { limbChain, worldMatrix } from '../../src/3d/ik';
import { localSiteFrame, siteLabel, siteMatrix } from '../../src/3d/sites';
import { ALL_BONES, BONES, JOINTS, JointId } from '../../src/3d/skeleton';

// Share of the body mass per bone (rounded anthropometric tables); the shoulder girdle counts to the chest
const MASS: Record<JointId, number> = {
  root: 0.14, waist: 0.14, chest: 0.22, neck: 0.08, clavicle: 0,
  hip: 0.1, knee: 0.045, ankle: 0.015, shoulder: 0.028, elbow: 0.016, wrist: 0.006,
};
// Rough body part thickness (capsules along the bones); the torso by its front-back depth
export const RADII: Partial<Record<JointId, number>> = {
  waist: 0.1, chest: 0.1, neck: 0.09, hip: 0.07, knee: 0.05, ankle: 0.03, shoulder: 0.04, elbow: 0.03, wrist: 0.015,
};
// The capsules are rough (a lying back comes out a few cm above the floor), so the floor contact is what lies
// within this of the lowest point
const FLOOR_TOLERANCE = 0.08;
const SAMPLES_PER_BONE = 5;
const STACKED_BEND = 15;

const cm = (v: THREE.Vector3) => `(${[v.x, v.y, v.z].map(x => Math.round(x * 100)).join(', ')})`;
type Point2 = [number, number];
const ground = (v: THREE.Vector3): Point2 => [v.x, v.z];

function boneEnds(pose: AcroPose, role: Role) {
  return ALL_BONES.map(({ key, joint }) => {
    const matrix = worldMatrix(pose[role], key);
    return { key, joint, from: new THREE.Vector3().setFromMatrixPosition(matrix), to: new THREE.Vector3(0, JOINTS[joint].length, 0).applyMatrix4(matrix) };
  });
}

export function centreOfMass(pose: AcroPose, role: Role): THREE.Vector3 {
  return boneEnds(pose, role).reduce(
    (sum, { joint, from, to }) => sum.addScaledVector(from.clone().add(to).multiplyScalar(0.5), MASS[joint]),
    new THREE.Vector3(),
  );
}

function convexHull(points: Point2[]): Point2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point2, a: Point2, b: Point2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point2[]) => list.reduce<Point2[]>((hull, p) => {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
    return [...hull, p];
  }, []);
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** How far a point lies outside the support area seen from above; 0 inside */
function outsideSupport(p: Point2, support: Point2[]): number {
  const hull = convexHull(support);
  const edges = hull.map((a, i) => [a, hull[(i + 1) % hull.length]] as const);
  const inside = hull.length >= 3 && edges.every(([a, b]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0);
  return inside ? 0 : Math.min(...edges.map(([a, b]) => distanceToSegment(p, a, b)));
}

const supportLine = (what: string, com: THREE.Vector3, support: Point2[], over: string) => {
  const off = outsideSupport(ground(com), support);
  return `  ${what} ${cm(com)}: ${off < 0.01 ? `over ${over}` : `${Math.round(off * 100)} cm outside ${over} (seen from above)`}`;
};

export function balanceLines(pose: AcroPose): string[] {
  const flyerCom = centreOfMass(pose, 'flyer');
  const baseCom = centreOfMass(pose, 'base');
  const carrying = pose.contacts.filter(c => c.a.role !== c.b.role);
  const contactPoints = carrying.map(c => new THREE.Vector3().setFromMatrixPosition(siteMatrix(pose[c.b.role], c.b.site)));

  // Points along the base's body surface that rest on the floor
  const surface = boneEnds(pose, 'base').flatMap(({ joint, from, to }) =>
    Array.from({ length: SAMPLES_PER_BONE }, (_, i) => from.clone().lerp(to, i / (SAMPLES_PER_BONE - 1)))
      .map(point => ({ point, bottom: point.y - (RADII[joint] ?? 0) })));
  const lowest = Math.min(...surface.map(s => s.bottom));
  const floorSupport = surface.filter(s => s.bottom < lowest + FLOOR_TOLERANCE).map(s => ground(s.point));
  const together = flyerCom.clone().add(baseCom).multiplyScalar(0.5);

  // Which base limb takes each contact, and whether its bones are stacked (nearly straight) or held by muscle
  const loadLines = carrying.flatMap(c => {
    const baseSite = c.a.role === 'base' ? c.a : c.b;
    const flyerSite = c.a.role === 'flyer' ? c.a : c.b;
    const chain = limbChain(localSiteFrame(baseSite.site).bone);
    const bend = chain.find(key => ['knee', 'elbow'].includes(BONES[key].joint));
    if (!bend) return [`  base ${siteLabel(baseSite.site)} (torso) takes flyer ${siteLabel(flyerSite.site)}`];
    const angle = pose.base.angles[bend].bend;
    return [`  base ${bend} bent ${Math.round(angle)}° (${angle < STACKED_BEND ? 'stacked' : 'held by muscle'}) takes flyer ${siteLabel(flyerSite.site)}`];
  });

  const flyerLines = contactPoints.length ? [
    supportLine('flyer centre of mass', flyerCom, contactPoints.map(ground), `its ${contactPoints.length} contact points with the base`),
    `  flyer centre of mass ${Math.round((flyerCom.y - Math.max(...contactPoints.map(v => v.y))) * 100)} cm above its highest contact`,
  ] : [`  flyer centre of mass ${cm(flyerCom)}: no contact with the base`];

  return [
    ...flyerLines,
    supportLine('base centre of mass', baseCom, floorSupport, 'the base\'s floor contact'),
    ...(contactPoints.length ? [supportLine('both together (equal weights)', together, floorSupport, 'the base\'s floor contact')] : []),
    ...loadLines,
  ];
}

const HEIGHT_PARTS: [string, JointId, 'left' | 'right' | null][] = [
  ['head', 'neck', null], ['back', 'chest', null], ['pelvis', 'waist', null],
  ['left hand', 'wrist', 'left'], ['right hand', 'wrist', 'right'], ['left foot', 'ankle', 'left'], ['right foot', 'ankle', 'right'],
];

/** Lowest surface point of the main body parts above the floor, e.g. to catch hands floating instead of resting */
export function heightLines(pose: AcroPose): string[] {
  return (['base', 'flyer'] as const).map(role => {
    const ends = boneEnds(pose, role);
    const parts = HEIGHT_PARTS.map(([label, joint, side]) => {
      const bone = ends.find(e => e.joint === joint && (side === null || e.key.startsWith(side)))!;
      return `${label} ${Math.round((Math.min(bone.from.y, bone.to.y) - (RADII[joint] ?? 0)) * 100)}`;
    });
    return `  ${role}: ${parts.join(', ')}`;
  });
}

// A lying base's back sits about 6 cm up by the rough capsules; more means hands or feet lift him off the floor
const BACK_LIFTED = 0.08;

/** For one-line variant summaries: a lying base's back lifted off the floor, otherwise nothing */
export function liftedSummary(pose: AcroPose): string {
  if (Math.abs(pose.base.angles.root.pitch + 90) > 30) return '';
  const chest = boneEnds(pose, 'base').find(e => e.joint === 'chest')!;
  const back = Math.min(chest.from.y, chest.to.y) - RADII.chest!;
  return back > BACK_LIFTED ? `, base's back ${Math.round(back * 100)} cm up (lifted?)` : '';
}

/** For one-line variant summaries: how far the flyer is off its support, and the bend of the base's knees and elbows */
export function balanceSummary(pose: AcroPose): string {
  const carrying = pose.contacts.filter(c => c.a.role !== c.b.role);
  const points = carrying.map(c => ground(new THREE.Vector3().setFromMatrixPosition(siteMatrix(pose[c.b.role], c.b.site))));
  const off = points.length ? outsideSupport(ground(centreOfMass(pose, 'flyer')), points) : null;
  const bends = (['knee', 'elbow'] as const).map(joint =>
    `${joint}s ${(['left', 'right'] as const).map(side => Math.round(pose.base.angles[`${side}-${joint}`].bend)).join('/')}`);
  return `flyer ${off === null ? 'without contact' : off < 0.01 ? 'over its support' : `${Math.round(off * 100)} cm off its support`}, base ${bends.join(', ')}`;
}
