import { AcroPose, Contact, ROLES, Role, connect, fitRigidly, movesLimb, ownContactMover, reversed } from '../../src/3d/acroPose';
import { Human } from '../../src/3d/Human';
import { PALETTES } from '../../src/3d/bodyMesh';
import { HumanPose } from '../../src/3d/humanPose';
import { Params, setUp } from './params';

export const humans = { base: new Human(PALETTES.base), flyer: new Human(PALETTES.flyer) };

const onFloor = (person: HumanPose, role: Role): HumanPose =>
  ({ ...person, position: [person.position[0], humans[role].groundedRootHeight(person), person.position[2]] });

// Rounds of: `fit` contacts move their person as a whole (the other person's limb reaching back), then `reach`
// contacts move limbs, then contacts within a person
export function solvePose(params: Params): AcroPose {
  const { pose: start, solveOf, locks, grounded } = setUp(params);
  let pose: AcroPose = { ...start, base: grounded.base ? onFloor(start.base, 'base') : start.base, flyer: grounded.flyer ? onFloor(start.flyer, 'flyer') : start.flyer };
  const between = pose.contacts.filter(c => c.a.role !== c.b.role);
  const own = pose.contacts.filter(c => c.a.role === c.b.role);
  const fits = ROLES.map(role => between.filter(c => solveOf.get(c) === 'fit' && c.a.role === role));
  const reaches = between.filter(c => solveOf.get(c) === 'reach');

  const reach = (contact: Contact) => {
    if (!movesLimb(contact.a.site)) return;
    pose = { ...pose, [contact.a.role]: connect(pose, contact, false, locks[contact.a.role]) };
  };
  const holdOwn = () => own.forEach(c => { const mover = ownContactMover(c); if (mover) reach(mover); });

  const rounds = params.rounds ?? 6;
  for (let round = 0; round < rounds; round++) {
    for (const group of fits.filter(g => g.length)) {
      const mover = group[0].a.role;
      pose = { ...pose, [mover]: fitRigidly(pose, group, !!params.fitRotate) };
      if (grounded[mover]) pose = { ...pose, [mover]: onFloor(pose[mover], mover) };
      group.forEach(c => reach(reversed(c)));
    }
    if (round === rounds - 1) break;
    reaches.forEach(reach);
    holdOwn();
  }
  holdOwn();
  for (const role of ROLES) if (grounded[role] && !fits.some(g => g[0]?.a.role === role)) pose = { ...pose, [role]: onFloor(pose[role], role) };
  return pose;
}
