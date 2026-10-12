import * as THREE from 'three';
import { AcroPose, ROLES, Role } from '../../src/3d/acroPose';
import { limbChain } from '../../src/3d/ik';
import { SEGMENT_NAMES, SITE_NAMES, Site, localSiteFrame, siteLabel, siteMatrix } from '../../src/3d/sites';
import { BoneKey } from '../../src/3d/skeleton';

// The sites that usually make a contact: hands and feet
export const ACTIVE_SITES = ['palm', 'hand-back', 'sole', 'instep'].flatMap(name => [`left-${name}`, `right-${name}`]);
const ALONG_STEP = 0.05;
const AROUND_STEP = 15;
// A named site this close to a surface point is offered instead
const NAMED_WITHIN = 0.05;

interface Surface {
  role: Role;
  site: Site;
  bone: BoneKey;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface Suggestion {
  a: { role: Role; site: Site };
  b: Surface;
  named: Site | null;
  distance: number;
  // 1 = the surfaces face each other exactly
  facing: number;
}

const surface = (pose: AcroPose, role: Role, site: Site): Surface => {
  const matrix = siteMatrix(pose[role], site);
  return {
    role, site, bone: localSiteFrame(site).bone,
    position: new THREE.Vector3().setFromMatrixPosition(matrix),
    normal: new THREE.Vector3().setFromMatrixColumn(matrix, 2),
  };
};

// The body surface sampled as segment coordinates, plus the named sites
function surfaces(pose: AcroPose): Surface[] {
  return ROLES.flatMap(role => [
    ...SEGMENT_NAMES.flatMap(segment => Array.from({ length: Math.round(1 / ALONG_STEP) + 1 }, (_, i) => i * ALONG_STEP)
      .flatMap(along => Array.from({ length: 360 / AROUND_STEP }, (_, j) => -180 + AROUND_STEP * (j + 1))
        .map(around => surface(pose, role, { segment, along: Number(along.toFixed(2)), around })))),
    ...SITE_NAMES.map(site => surface(pose, role, site)),
  ]);
}

// The limb the site is on, with the bone it hangs from, cannot touch the site in a useful way
function unreachable(role: Role, site: Site): (s: Surface) => boolean {
  const bone = localSiteFrame(site).bone;
  const chain = limbChain(bone);
  const own = new Set<BoneKey>([bone, ...chain.slice(-2)]);
  return s => s.role === role && own.has(s.bone);
}

const named = (all: Surface[], best: Surface): Site | null => all
  .filter(s => typeof s.site === 'string' && s.role === best.role && s.bone === best.bone && s.position.distanceTo(best.position) < NAMED_WITHIN)
  .sort((x, y) => x.position.distanceTo(best.position) - y.position.distanceTo(best.position))[0]?.site ?? null;

// Per active site without a contact: the closest surface facing it, if within `within` metres
export function possibleContacts(pose: AcroPose, within = 0.12): Suggestion[] {
  const all = surfaces(pose);
  const used = new Set(pose.contacts.flatMap(c => [c.a, c.b].map(s => `${s.role}:${JSON.stringify(s.site)}`)));
  // Parts already touching each other (a palm under a sole) also have their other sides close
  const bonePair = (a: string, b: string) => [a, b].sort().join('|');
  const touching = new Set(pose.contacts.map(c => bonePair(`${c.a.role}:${localSiteFrame(c.a.site).bone}`, `${c.b.role}:${localSiteFrame(c.b.site).bone}`)));
  const seen = new Set<string>();
  return ROLES.flatMap(role => ACTIVE_SITES
    .filter(site => !used.has(`${role}:${JSON.stringify(site)}`))
    .flatMap(site => bestTargets(pose, { role, site }, all, 1)))
    .filter(s => s.distance <= within)
    .filter(s => !touching.has(bonePair(`${s.a.role}:${localSiteFrame(s.a.site).bone}`, `${s.b.role}:${s.b.bone}`)))
    // Two hands / feet near each other show up from both sides
    .filter(s => {
      const key = bonePair(`${s.a.role}:${localSiteFrame(s.a.site).bone}`, `${s.b.role}:${s.b.bone}`);
      return !seen.has(key) && !!seen.add(key);
    })
    .sort((x, y) => x.distance - y.distance);
}

// The `count` best surfaces for `a` on different bones, ranked by distance with facing away penalized
export function bestTargets(pose: AcroPose, a: { role: Role; site: Site }, all = surfaces(pose), count = 5, onlySegment?: { role: Role; segment: string }): Suggestion[] {
  const from = surface(pose, a.role, a.site);
  const excluded = unreachable(a.role, a.site);
  const candidates = all
    .filter(s => !excluded(s) && (!onlySegment || (s.role === onlySegment.role && typeof s.site !== 'string' && s.site.segment === onlySegment.segment)))
    .map(s => ({ s, distance: s.position.distanceTo(from.position), facing: -s.normal.dot(from.normal) }))
    .filter(c => c.facing > 0.3)
    .sort((x, y) => (x.distance + 0.1 * (1 - x.facing)) - (y.distance + 0.1 * (1 - y.facing)));
  const seen = new Set<string>();
  const result: Suggestion[] = [];
  for (const c of candidates) {
    const key = `${c.s.role}:${c.s.bone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ a, b: c.s, named: named(all, c.s), distance: c.distance, facing: c.facing });
    if (result.length === count) break;
  }
  return result;
}

export function suggestionLine(s: Suggestion): string {
  const target = s.named ?? s.b.site;
  const contact = { a: { [s.a.role]: s.a.site }, b: { [s.b.role]: target }, twist: 'free' };
  const label = s.named && s.named !== s.b.site ? `${siteLabel(s.named)} (or exactly ${siteLabel(s.b.site)})` : siteLabel(target);
  return `  ${s.a.role} ${siteLabel(s.a.site)}: ${Math.round(s.distance * 100)} cm from ${s.b.role} ${label}, facing ${s.facing.toFixed(2)}`
    + `\n    ${JSON.stringify(contact)}`;
}
