import * as THREE from 'three';
import { AcroPose, Contact, movesLimb, reversed, targetOf } from './acroPose';
import { lerpHumanPose } from './humanPose';
import { limbChain, solveChain, toTarget } from './ik';
import { Site, localSiteFrame, siteMatrix } from './sites';

const siteKey = (role: string, site: Site) => `${role}:${JSON.stringify(site)}`;
const sitesOf = (contact: Contact) => [siteKey(contact.a.role, contact.a.site), siteKey(contact.b.role, contact.b.site)].sort().join('|');

// Contacts between the same two sites in both poses (a grip that is kept), in `to`'s form
export function keptContacts(from: AcroPose, to: AcroPose): Contact[] {
  const before = new Set(from.contacts.map(sitesOf));
  return to.contacts.filter(c => before.has(sitesOf(c)));
}

function interpolated(from: THREE.Matrix4, to: THREE.Matrix4, t: number): THREE.Matrix4 {
  const [p0, q0, p1, q1] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(), new THREE.Quaternion()];
  const scale = new THREE.Vector3();
  from.decompose(p0, q0, scale);
  to.decompose(p1, q1, scale);
  return new THREE.Matrix4().compose(p0.lerp(p1, t), q0.slerp(q1, t), new THREE.Vector3(1, 1, 1));
}

function reached(pose: AcroPose, contact: Contact, target: THREE.Matrix4): AcroPose {
  const { a } = contact;
  const { bone, matrix } = localSiteFrame(a.site);
  const solved = solveChain(pose[a.role], limbChain(bone), matrix, toTarget(target), { freeTwist: contact.twist === 'free' });
  return { ...pose, [a.role]: solved };
}

// The pose at `t` (0 to 1) on the way from `from` to `to`: angles interpolated, and the `kept` contacts closed
// again. A grip between two limbs moves as one thing along the shortest way and both limbs follow it; a limb on
// the other's torso follows the torso.
export function inBetween(from: AcroPose, to: AcroPose, kept: Contact[], t: number): AcroPose {
  const lerped: AcroPose = { ...to, base: lerpHumanPose(from.base, to.base, t), flyer: lerpHumanPose(from.flyer, to.flyer, t) };
  return kept.reduce((pose, contact) => {
    const [aMoves, bMoves] = [movesLimb(contact.a.site), movesLimb(contact.b.site)];
    if (aMoves && bMoves) {
      const grip = interpolated(siteMatrix(from[contact.a.role], contact.a.site), siteMatrix(to[contact.a.role], contact.a.site), t);
      const held = reached(pose, contact, grip);
      return reached(held, reversed(contact), targetOf(held, reversed(contact)));
    }
    if (aMoves) return reached(pose, contact, targetOf(pose, contact));
    if (bMoves) return reached(pose, reversed(contact), targetOf(pose, reversed(contact)));
    return pose;
  }, lerped);
}

const KEYFRAMES = 8;

// The way from `from` to `to` for an animation: `inBetween` poses at a few steps, each solved once when the
// animation first gets there, and plain interpolation between neighbouring steps (cheap enough for every frame)
export function transition(from: AcroPose, to: AcroPose): (t: number) => AcroPose {
  const kept = keptContacts(from, to);
  const steps: AcroPose[] = [from];
  steps[KEYFRAMES] = to;
  const step = (k: number) => (steps[k] ??= inBetween(from, to, kept, k / KEYFRAMES));
  return t => {
    const k = Math.min(KEYFRAMES - 1, Math.floor(t * KEYFRAMES));
    const [a, b] = [step(k), step(k + 1)];
    const share = t * KEYFRAMES - k;
    return { ...to, base: lerpHumanPose(a.base, b.base, share), flyer: lerpHumanPose(a.flyer, b.flyer, share) };
  };
}
