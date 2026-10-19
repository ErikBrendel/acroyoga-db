import * as THREE from 'three';
import { AcroPose, Contact, ROLES, Role, contactError, currentTwist } from '../../src/3d/acroPose';
import { Human } from '../../src/3d/Human';
import { possibleContacts, suggestionLine } from './contacts';
import { RADII, balanceLines, balanceSummary, heightLines } from './balance';
import { limbChain, worldMatrix } from '../../src/3d/ik';
import { localSiteFrame, siteLabel, siteMatrix } from '../../src/3d/sites';
import { ALL_BONES, BONES, BoneKey, JOINTS } from '../../src/3d/skeleton';

const OVERLAP_REPORTED = 0.03;
const HOLDS = { millimetres: 10, degrees: 5 };
const KEY_SITES = ['crown', 'chest', 'upper-back', 'sacrum', 'left-palm', 'right-palm', 'left-knee', 'right-knee', 'left-sole', 'right-sole'];

const cm = (v: THREE.Vector3) => `(${[v.x, v.y, v.z].map(x => Math.round(x * 100)).join(', ')})`;
const sitePosition = (pose: AcroPose, role: Role, site: Contact['a']['site']) => new THREE.Vector3().setFromMatrixPosition(siteMatrix(pose[role], site));
const siteNormal = (pose: AcroPose, role: Role, site: Contact['a']['site']) => new THREE.Vector3().setFromMatrixColumn(siteMatrix(pose[role], site), 2);
// Towards fingers / toes, a limb's far end, the head
const siteDirection = (pose: AcroPose, role: Role, site: Contact['a']['site']) => new THREE.Vector3().setFromMatrixColumn(siteMatrix(pose[role], site), 1);
const direction = (v: THREE.Vector3) => (['x', 'y', 'z'] as const)
  .map(axis => ({ axis, value: v[axis] })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  .slice(0, 2).filter(d => Math.abs(d.value) > 0.3).map(d => `${d.value > 0 ? '+' : '-'}${d.axis.toUpperCase()}`).join('');

// A straight knee / elbow on a limb that does not hold its contact: the target is probably out of reach
function stretched(pose: AcroPose, c: Contact): string {
  const straight = [c.a, c.b].flatMap(({ role, site }) => limbChain(localSiteFrame(site).bone)
    .filter(key => ['knee', 'elbow'].includes(BONES[key].joint) && pose[role].angles[key].bend < 1)
    .map(key => `${role} ${key}`));
  return straight.length ? `; straight: ${straight.join(', ')} (out of reach?)` : '';
}

function contactLines(pose: AcroPose): string[] {
  return pose.contacts.map(c => {
    const { millimetres, degrees } = contactError(pose, c);
    const twist = c.twist === 'free' ? `free (now ${Math.round(currentTwist(pose, c.a, c.b))}°)` : `${c.twist}°`;
    const holds = millimetres <= HOLDS.millimetres && degrees <= HOLDS.degrees;
    return `  ${holds ? 'ok ' : 'OFF'} ${c.a.role} ${siteLabel(c.a.site)} -> ${c.b.role} ${siteLabel(c.b.site)}, twist ${twist}: ${millimetres.toFixed(0)} mm, ${degrees.toFixed(0)}°`
      + ` at ${cm(sitePosition(pose, c.b.role, c.b.site))}`
      + `; normals ${direction(siteNormal(pose, c.a.role, c.a.site))} / ${direction(siteNormal(pose, c.b.role, c.b.site))}`
      + `, directions ${direction(siteDirection(pose, c.a.role, c.a.site))} / ${direction(siteDirection(pose, c.b.role, c.b.site))}`
      + (holds ? '' : stretched(pose, c));
  });
}

// Angles at a limit usually explain a contact that does not hold. Straight knees / elbows (0 at the limit) are left out.
function limitLines(pose: AcroPose): string[] {
  return ROLES.flatMap(role => ALL_BONES.flatMap(({ key, joint }) => JOINTS[joint].angles
    .filter(a => a.max - a.min < 360)
    .map(a => ({ a, value: pose[role].angles[key][a.name] }))
    .filter(({ a, value }) => value !== 0 && (value <= a.min + 0.5 || value >= a.max - 0.5))
    .map(({ a, value }) => `  ${role} ${key}.${a.name} = ${value.toFixed(1)} (${value <= a.min + 0.5 ? 'min' : 'max'} ${value <= a.min + 0.5 ? a.min : a.max})`)));
}

function pointLines(pose: AcroPose, humans: Record<Role, Human>): string[] {
  return ROLES.map(role => {
    const lowest = pose[role].position[1] - humans[role].groundedRootHeight(pose[role]);
    const points = KEY_SITES.map(site => `${site} ${cm(sitePosition(pose, role, site))}`).join(', ');
    const root = Object.entries(pose[role].angles.root).map(([name, value]) => `${name} ${Math.round(value) || 0}`).join(', ');
    return `  ${role}: root ${root}; pelvis centre ${cm(new THREE.Vector3(...pose[role].position))}, ${points}; lowest point ${Math.round(lowest * 100)} cm above the floor`;
  });
}

interface Capsule {
  role: Role;
  key: BoneKey;
  from: THREE.Vector3;
  to: THREE.Vector3;
  radius: number;
}

function capsules(pose: AcroPose): Capsule[] {
  return ROLES.flatMap(role => ALL_BONES.filter(b => RADII[b.joint]).map(({ key, joint }) => {
    const matrix = worldMatrix(pose[role], key);
    return {
      role, key, radius: RADII[joint]!,
      from: new THREE.Vector3().setFromMatrixPosition(matrix),
      to: new THREE.Vector3(0, JOINTS[joint].length, 0).applyMatrix4(matrix),
    };
  }));
}

function segmentDistance(a: Capsule, b: Capsule): number {
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  new THREE.Line3(a.from, a.to).closestPointToPoint(b.from, true, pa);
  // Alternating projection converges on the closest points of two segments
  for (let i = 0; i < 8; i++) {
    new THREE.Line3(b.from, b.to).closestPointToPoint(pa, true, pb);
    new THREE.Line3(a.from, a.to).closestPointToPoint(pb, true, pa);
  }
  return pa.distanceTo(pb);
}

const related = (a: BoneKey, b: BoneKey) => {
  const parent = (k: BoneKey) => ALL_BONES.find(x => x.joint === JOINTS[BONES[k].joint].parent && (x.side === BONES[k].side || x.side === null))?.key;
  return a === b || parent(a) === b || parent(b) === a || parent(a) === parent(b) || parent(parent(a)!) === b || parent(parent(b)!) === a;
};

// Body parts sinking into each other more than OVERLAP_REPORTED, apart from the parts that are in contact
function overlapLines(pose: AcroPose): string[] {
  const inContact = new Set(pose.contacts.flatMap(c => [c.a, c.b].map(s => `${s.role}:${localSiteFrame(s.site).bone}`)));
  const parts = capsules(pose);
  const lines: string[] = [];
  parts.forEach((a, i) => parts.slice(i + 1).forEach(b => {
    if (a.role === b.role && related(a.key, b.key)) return;
    if (a.role !== b.role && (inContact.has(`${a.role}:${a.key}`) || inContact.has(`${b.role}:${b.key}`))) return;
    const depth = a.radius + b.radius - segmentDistance(a, b);
    if (depth > OVERLAP_REPORTED) lines.push(`  ${a.role} ${a.key} and ${b.role} ${b.key}: ${Math.round(depth * 100)} cm into each other`);
  }));
  return lines;
}

// One line for comparing variants
export function summary(pose: AcroPose): string {
  const errors = pose.contacts.map(c => contactError(pose, c));
  const holding = errors.filter(e => e.millimetres <= HOLDS.millimetres && e.degrees <= HOLDS.degrees).length;
  const worst = `${Math.round(Math.max(0, ...errors.map(e => e.millimetres)))} mm, ${Math.round(Math.max(0, ...errors.map(e => e.degrees)))}°`;
  return `contacts ok ${holding}/${errors.length} (worst ${worst}), limits ${limitLines(pose).length}, overlaps ${overlapLines(pose).length}; ${balanceSummary(pose)}`;
}

export function report(pose: AcroPose, humans: Record<Role, Human>): string {
  const section = (title: string, lines: string[]) => [title, ...(lines.length ? lines : ['  none'])].join('\n');
  return [
    section('Contacts (ok = within 10 mm / 5°; position in cm as (x, y, z); +X = base left, +Y up, +Z = base front when standing;'
      + ' normals / directions of a / b, direction = towards fingers, toes, a limb\'s far end or the head):', contactLines(pose)),
    section('Angles at their limits:', limitLines(pose)),
    section('Key points (cm):', pointLines(pose, humans)),
    section('Lowest surface point above the floor (cm; rough capsules, so a few cm off the mesh):', heightLines(pose)),
    section('Balance (rough body masses; the flyer should sit over the contacts that carry it, the base\'s limbs ideally stacked):', balanceLines(pose)),
    section(`Overlaps (rough, ${OVERLAP_REPORTED * 100} cm or more):`, overlapLines(pose)),
    section('Possible contacts (free hands and feet within 12 cm of a surface facing them; add them if the pose has them):',
      possibleContacts(pose).map(suggestionLine)),
  ].join('\n\n');
}
