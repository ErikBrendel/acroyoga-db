import * as THREE from 'three';
import { z } from 'zod';
import { HumanPose, StoredHumanPose, StoredHumanPoseSchema, mirrorHumanPose, neutralPose, parseHumanPose, serializeHumanPose, withAngle } from './humanPose';
import { FixedAngle, Pins, changedAngles, limbChain, limbEffector, movedRigidly, solveChain, toTarget, withPins } from './ik';
import { Site, SiteSchema, localSiteFrame, mirrorSite, normalizeDegrees, siteMatrix } from './sites';
import { BONES, BoneKey, DEFAULT_ROOT_POSITION, JOINTS } from './skeleton';

export const ROLES = ['base', 'flyer'] as const;
export type Role = (typeof ROLES)[number];

export const otherRole = (role: Role): Role => (role === 'base' ? 'flyer' : 'base');

export interface SiteRef {
  role: Role;
  site: Site;
}

// Site `a` touches site `b`: same point, normals facing each other, and `a`'s direction turned by `twist`
// degrees about its normal relative to `b`'s (0 = parallel, 180 = opposite), or any turn with 'free'. The
// angle is the same seen from either side. `a` is the side that was moved onto `b` when the contact was made.
// Both sites may be on the same person, e.g. a hand on their own knee.
export type Twist = number | 'free';

export interface Contact {
  a: SiteRef;
  b: SiteRef;
  twist: Twist;
}

export interface AcroPose {
  base: HumanPose;
  flyer: HumanPose;
  contacts: Contact[];
}

// Stored format: {"a": {"base": "left-sole"}, "b": {"flyer": "left-hip"}, "twist": 90}, with `twist`
// omitted when 0 and "free" when any turn will do. `"symmetric": true` stands for the contact plus its mirror image (sides swapped,
// twist negated); the serializer produces it automatically for mirror-image pairs.
const StoredSiteRefSchema = z.union([z.strictObject({ base: SiteSchema }), z.strictObject({ flyer: SiteSchema })]);
const StoredContactSchema = z.strictObject({
  a: StoredSiteRefSchema,
  b: StoredSiteRefSchema,
  twist: z.union([z.number(), z.literal('free')]).optional(),
  symmetric: z.literal(true).optional(),
});

export const StoredAcroPoseSchema = z.object({
  base: StoredHumanPoseSchema,
  flyer: StoredHumanPoseSchema,
  contacts: z.array(StoredContactSchema),
});

type StoredSiteRef = z.infer<typeof StoredSiteRefSchema>;
type StoredContact = z.infer<typeof StoredContactSchema>;
export type StoredAcroPose = z.infer<typeof StoredAcroPoseSchema>;

export function initialAcroPose(): AcroPose {
  const flyer = withAngle({ ...neutralPose(), position: [0, DEFAULT_ROOT_POSITION[1], 0.7] }, 'root', 'turn', 180);
  return { base: neutralPose(), flyer, contacts: [] };
}

const parseSiteRef = (stored: StoredSiteRef): SiteRef => {
  const ref: SiteRef = 'base' in stored ? { role: 'base', site: stored.base } : { role: 'flyer', site: stored.flyer };
  localSiteFrame(ref.site);
  return ref;
};

export const normalizeTwist = (twist: Twist): Twist => (twist === 'free' ? twist : normalizeDegrees(twist));

export function mirrorContact({ a, b, twist }: Contact): Contact {
  return {
    a: { ...a, site: mirrorSite(a.site) },
    b: { ...b, site: mirrorSite(b.site) },
    twist: twist === 'free' ? twist : normalizeDegrees(-twist),
  };
}

export function parseAcroPose(json: unknown): AcroPose {
  const stored = StoredAcroPoseSchema.parse(json);
  const contacts = stored.contacts.flatMap(({ a, b, twist = 0, symmetric }) => {
    const contact = { a: parseSiteRef(a), b: parseSiteRef(b), twist: normalizeTwist(twist) };
    return symmetric ? [contact, mirrorContact(contact)] : [contact];
  });
  return { base: parseHumanPose(stored.base), flyer: parseHumanPose(stored.flyer), contacts };
}

const storedSiteRef = ({ role, site }: SiteRef) => ({ [role]: site }) as StoredSiteRef;

function storedContact({ a, b, twist }: Contact): StoredContact {
  const rounded = normalizeTwist(twist);
  return { a: storedSiteRef(a), b: storedSiteRef(b), ...(rounded !== 0 && { twist: rounded }) };
}

const contactKey = (contact: Contact) => JSON.stringify(storedContact(contact));

// E.g. belly on sacrum, which needs no symmetric partner
export const isOwnMirrorImage = (contact: Contact) => contactKey(contact) === contactKey(mirrorContact(contact));

// Index of the contact that is the mirror image of , -1 if there is none
export function mirrorPartner(contacts: Contact[], index: number): number {
  if (isOwnMirrorImage(contacts[index])) return -1;
  const mirrored = contactKey(mirrorContact(contacts[index]));
  return contacts.findIndex(c => contactKey(c) === mirrored);
}

export function serializeAcroPose(pose: AcroPose): StoredAcroPose {
  const merged = new Set<number>();
  const contacts = pose.contacts.flatMap((contact, i): StoredContact[] => {
    if (merged.has(i)) return [];
    const partner = mirrorPartner(pose.contacts, i);
    if (partner <= i || merged.has(partner)) return [storedContact(contact)];
    merged.add(partner);
    return [{ ...storedContact(contact), symmetric: true }];
  });
  return { base: serializeHumanPose(pose.base), flyer: serializeHumanPose(pose.flyer), contacts };
}

export function mirrorAcroPose(pose: AcroPose): AcroPose {
  return { base: mirrorHumanPose(pose.base), flyer: mirrorHumanPose(pose.flyer), contacts: pose.contacts.map(mirrorContact) };
}

const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

// Where site `a` has to be for the contact, given the frame of site `b`
function contactTarget(b: THREE.Matrix4, twist: number): THREE.Matrix4 {
  return b.clone().multiply(FLIP).multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(twist)));
}

// Twist between the two sites as they are now, ignoring how far apart they are
export function currentTwist(pose: AcroPose, a: SiteRef, b: SiteRef): number {
  const relative = contactTarget(siteMatrix(pose[b.role], b.site), 0).invert().multiply(siteMatrix(pose[a.role], a.site));
  const [x0, x1] = relative.elements;
  return normalizeDegrees(THREE.MathUtils.radToDeg(Math.atan2(x1, x0)));
}

export function contactError(pose: AcroPose, contact: Contact): { millimetres: number; degrees: number } {
  const actual = toTarget(siteMatrix(pose[contact.a.role], contact.a.site));
  const wanted = toTarget(targetOf(pose, contact));
  return {
    millimetres: new THREE.Vector3(...actual.position).distanceTo(new THREE.Vector3(...wanted.position)) * 1000,
    degrees: THREE.MathUtils.radToDeg(new THREE.Quaternion(...actual.quaternion).angleTo(new THREE.Quaternion(...wanted.quaternion))),
  };
}

// Sites on torso and head can only be moved by moving the whole person
export const movesLimb = (site: Site) => limbChain(localSiteFrame(site).bone).length > 0;

// A free twist is whatever the sites have now, so only position and normals count
export const targetOf = (pose: AcroPose, { a, b, twist }: Contact) =>
  contactTarget(siteMatrix(pose[b.role], b.site), twist === 'free' ? currentTwist(pose, a, b) : twist);

// The same contact, seen from `b`
export const reversed = ({ a, b, twist }: Contact): Contact => ({ a: b, b: a, twist });

// Moves the person of the `a` sites (all on the same person) as a whole, so that the contacts hold as
// well as they can together
export function fitRigidly(pose: AcroPose, contacts: Contact[], rotate = true): HumanPose {
  const mover = pose[contacts[0].a.role];
  return movedRigidly(mover, contacts.map(c => ({ from: siteMatrix(mover, c.a.site), to: targetOf(pose, c) })), rotate);
}

// Moves `a`'s person so that the contact holds: a site on an arm or leg by IK of that limb, keeping the
// `fixed` angles, otherwise (or with `rigid`) by moving the whole person
export function connect(pose: AcroPose, contact: Contact, rigid: boolean, fixed: FixedAngle[] = []): HumanPose {
  const { a } = contact;
  if (rigid || !movesLimb(a.site)) return fitRigidly(pose, [contact]);
  const target = toTarget(targetOf(pose, contact));
  const mover = pose[a.role];
  const { bone, matrix } = localSiteFrame(a.site);
  const chain = limbChain(bone);
  const freeTwist = contact.twist === 'free';
  const errorWith = (person: HumanPose) => contactError({ ...pose, [a.role]: person }, contact);
  const attempt = (start: HumanPose) => {
    const solved = solveChain(start, chain, matrix, target, { fixed, freeTwist });
    // Out of reach with this twist: at least the points meet
    return errorWith(solved).millimetres > HOLDS.millimetres ? solveChain(solved, chain, matrix, target, { positionOnly: true, fixed }) : solved;
  };
  const first = attempt(mover);
  if (holdsWith(errorWith(first))) return first;
  // A straight limb is stuck at its limit when the target is closer than its length: retry half bent
  const second = attempt(towardsMiddle(mover, chain, fixed));
  const best = (candidates: HumanPose[]) => candidates.reduce((b, c) => (offBy(errorWith(c)) < offBy(errorWith(b)) ? c : b));
  const better = best([first, second]);
  if (holdsWith(errorWith(better))) return better;
  // The solver is local: an orientation that needs e.g. a turned forearm may only be found from elsewhere
  return best([better, ...SPREAD_STARTS.map(share => attempt(spreadOver(mover, chain, fixed, share)))]);
}

// Shares of each angle's range to start from, the same for all angles of a chain
const SPREAD_STARTS = [0.2, 0.8, 0.35, 0.65];

function spreadOver(pose: HumanPose, keys: BoneKey[], fixed: FixedAngle[], share: number): HumanPose {
  return keys.reduce((result, key) => JOINTS[BONES[key].joint].angles
    .filter(({ name, meshOnly }) => !meshOnly && !fixed.some(f => f.key === key && f.name === name))
    .reduce((r, { name, min, max }, i) => withAngle(r, key, name, min + (max - min) * (i % 2 ? 1 - share : share)), result), pose);
}

function towardsMiddle(pose: HumanPose, keys: BoneKey[], fixed: FixedAngle[]): HumanPose {
  return keys.reduce((result, key) => JOINTS[BONES[key].joint].angles
    .filter(({ name, meshOnly }) => !meshOnly && !fixed.some(f => f.key === key && f.name === name))
    .reduce((r, { name, min, max }) => withAngle(r, key, name, (r.angles[key][name] + (min + max) / 2) / 2), result), pose);
}

const HOLDS = { millimetres: 1, degrees: 1 };
const holdsWith = ({ millimetres, degrees }: { millimetres: number; degrees: number }) =>
  millimetres <= HOLDS.millimetres && degrees <= HOLDS.degrees;
const holds = (pose: AcroPose, contact: Contact) => holdsWith(contactError(pose, contact));
// For comparing attempts, a millimetre counts as much as a degree
const offBy = ({ millimetres, degrees }: { millimetres: number; degrees: number }) => millimetres + degrees;

// Turns `a`'s limb so that its site has the orientation the contact needs, wherever it is
function turnedTowards(pose: AcroPose, contact: Contact, fixed: FixedAngle[]): HumanPose {
  const { bone, matrix } = localSiteFrame(contact.a.site);
  const freeTwist = contact.twist === 'free';
  return solveChain(pose[contact.a.role], limbChain(bone), matrix, toTarget(targetOf(pose, contact)), { orientationOnly: true, fixed, freeTwist });
}

const pinned = (site: Site, pins: Pins) => pins[limbEffector(localSiteFrame(site).bone)!] !== undefined;

// After `edited` changed from `previous`, everything except what the edit changed adapts so that the
// contacts hold again:
// 1. the other person as a whole, for contacts on their torso: shifted if possible (after the edited
//    person's contact limbs have turned to match), turned only if needed (their pins then pull their
//    limbs back),
// 2. the other person's contact limbs,
// 3. the edited person's contact limbs, keeping the angles the edit changed.
// Pinned limbs do not move for a contact, `locks` never change; a lock on the other person's root keeps
// them from turning.
export function followContacts(
  previous: AcroPose, pose: AcroPose, edited: Role, pins: Record<Role, Pins>, locks: Record<Role, FixedAngle[]>,
): AcroPose {
  const followed = followOtherPerson(previous, pose, edited, pins, locks);
  return withOwnContacts(followed, { ...locks, [edited]: [...changedAngles(previous[edited], pose[edited]), ...locks[edited]] }, pins);
}

// A contact within one person, turned so that `a` is on a limb that can reach; null if neither site is
export function ownContactMover(contact: Contact): Contact | null {
  if (movesLimb(contact.a.site)) return contact;
  return movesLimb(contact.b.site) ? reversed(contact) : null;
}

// Contacts within one person (a hand on their own knee) are held by that limb, unless it is pinned
function withOwnContacts(pose: AcroPose, locks: Record<Role, FixedAngle[]>, pins: Record<Role, Pins>): AcroPose {
  return pose.contacts.filter(c => c.a.role === c.b.role).reduce((next, contact) => {
    const mover = ownContactMover(contact);
    if (!mover || pinned(mover.a.site, pins[mover.a.role]) || holds(next, mover)) return next;
    return { ...next, [mover.a.role]: connect(next, mover, false, locks[mover.a.role]) };
  }, pose);
}

function followOtherPerson(
  previous: AcroPose, pose: AcroPose, edited: Role, pins: Record<Role, Pins>, locks: Record<Role, FixedAngle[]>,
): AcroPose {
  const follower = otherRole(edited);
  const contacts = pose.contacts.filter(c => c.a.role !== c.b.role).map(c => (c.a.role === follower ? c : reversed(c)));
  if (contacts.every(c => holds(pose, c))) return pose;
  const fixed = [...changedAngles(previous[edited], pose[edited]), ...locks[edited]];

  const movable = (role: Role) => (contact: Contact) => movesLimb(contact.a.site) && !pinned(contact.a.site, pins[role]);
  const chainFixed = (contact: Contact, roleFixed: FixedAngle[]) => {
    const chain = limbChain(localSiteFrame(contact.a.site).bone);
    return roleFixed.filter(f => chain.includes(f.key));
  };
  const withLimbs = (start: AcroPose) => {
    let next = start;
    const reachWith = (role: Role, roleFixed: FixedAngle[]) => (contact: Contact) => {
      if (!movable(role)(contact) || holds(next, contact)) return;
      next = { ...next, [role]: connect(next, contact, false, chainFixed(contact, roleFixed)) };
    };
    contacts.forEach(reachWith(follower, locks[follower]));
    contacts.map(reversed).forEach(reachWith(edited, fixed));
    return next;
  };

  const onTorso = contacts.filter(c => !movesLimb(c.a.site));
  if (onTorso.every(c => holds(pose, c))) return withLimbs(pose);
  const moved = (start: AcroPose, rotate: boolean) =>
    withLimbs({ ...start, [follower]: withPins(start[follower], fitRigidly(start, onTorso, rotate), pins[follower], locks[follower]) });
  const turnedLimbs = contacts.map(reversed).filter(movable(edited)).reduce(
    (p, contact) => ({ ...p, [edited]: turnedTowards(p, contact, chainFixed(contact, fixed)) }),
    pose,
  );
  const shifted = moved(turnedLimbs, false);
  if (contacts.every(c => holds(shifted, c)) || locks[follower].some(f => f.key === 'root')) return shifted;
  const turned = moved(pose, true);
  const totalError = (p: AcroPose) => contacts.reduce((sum, c) => sum + offBy(contactError(p, c)), 0);
  return totalError(turned) < totalError(shifted) ? turned : shifted;
}

// JSON with one line per joint and contact
export function formatStoredAcroPose({ base, flyer, contacts }: StoredAcroPose): string {
  const list = (open: string, close: string, lines: string[], indent: string) =>
    (lines.length ? `${open}\n${lines.map(line => `${indent}  ${line}`).join(',\n')}\n${indent}${close}` : `${open}${close}`);
  const person = ({ position, joints }: StoredHumanPose) => list('{', '}', [
    `"position": ${JSON.stringify(position)}`,
    `"joints": ${list('{', '}', Object.entries(joints).map(([joint, values]) => `"${joint}": ${JSON.stringify(values)}`), '    ')}`,
  ], '  ');
  return list('{', '}', [
    `"base": ${person(base)}`,
    `"flyer": ${person(flyer)}`,
    `"contacts": ${list('[', ']', contacts.map(c => JSON.stringify(c)), '  ')}`,
  ], '');
}
