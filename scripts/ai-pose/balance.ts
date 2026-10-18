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
const FLOOR_TOLERANCE = 0.04;
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
  return `  ${what} ${cm(com)}: ${off === 0 ? `over ${over}` : `${Math.round(off * 100)} cm outside ${over} (seen from above)`}`;
};

export function balanceLines(pose: AcroPose): string[] {
  const flyerCom = centreOfMass(pose, 'flyer');
  const baseCom = centreOfMass(pose, 'base');
  const carrying = pose.contacts.filter(c => c.a.role !== c.b.role);
  const contactPoints = carrying.map(c => new THREE.Vector3().setFromMatrixPosition(siteMatrix(pose[c.b.role], c.b.site)));

  const baseEnds = boneEnds(pose, 'base').flatMap(({ from, to }) => [from, to]);
  const floor = Math.min(...baseEnds.map(v => v.y));
  const floorSupport = baseEnds.filter(v => v.y < floor + FLOOR_TOLERANCE).map(ground);
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

  return [
    contactPoints.length
      ? supportLine('flyer centre of mass', flyerCom, contactPoints.map(ground), `its ${contactPoints.length} contact points with the base`)
      : `  flyer centre of mass ${cm(flyerCom)}: no contact with the base`,
    `  flyer centre of mass ${Math.round((flyerCom.y - Math.max(...contactPoints.map(v => v.y), -Infinity)) * 100)} cm above its highest contact`,
    supportLine('base centre of mass', baseCom, floorSupport, 'the base\'s floor contact'),
    supportLine('both together (equal weights)', together, floorSupport, 'the base\'s floor contact'),
    ...loadLines,
  ];
}
