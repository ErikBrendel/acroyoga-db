import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AcroPose, Contact, connect, contactError, currentTwist, fitRigidly, followContacts, initialAcroPose, parseAcroPose, serializeAcroPose } from './acroPose';
import { HumanPose, withJoints } from './humanPose';
import { SITE_NAMES, Site, localSiteFrame, siteAt, siteMatrix } from './sites';

describe('stored contacts', () => {
  const stored = {
    a: { base: 'left-palm' }, b: { flyer: 'right-palm' }, twist: 90, symmetric: true,
  };

  it('expands the symmetric shorthand into the contact and its mirror image', () => {
    const pose = parseAcroPose({ ...serializeAcroPose(initialAcroPose()), contacts: [stored] });
    expect(pose.contacts).toEqual([
      { a: { role: 'base', site: 'left-palm' }, b: { role: 'flyer', site: 'right-palm' }, twist: 90 },
      { a: { role: 'base', site: 'right-palm' }, b: { role: 'flyer', site: 'left-palm' }, twist: -90 },
    ]);
    expect(serializeAcroPose(pose).contacts).toEqual([stored]);
  });

  it('keeps contacts explicit that are not mirror images of each other', () => {
    const contacts: Contact[] = [
      { a: { role: 'base', site: 'left-sole' }, b: { role: 'flyer', site: 'left-hip' }, twist: 0 },
      { a: { role: 'base', site: 'right-sole' }, b: { role: 'flyer', site: 'right-hip' }, twist: 10 },
      { a: { role: 'base', site: 'belly' }, b: { role: 'flyer', site: { segment: 'pelvis', along: 0.5, around: 180 } }, twist: 180 },
    ];
    expect(serializeAcroPose({ ...initialAcroPose(), contacts }).contacts.every(c => !('symmetric' in c))).toBe(true);
  });

  it('rejects unknown sites', () => {
    expect(() => parseAcroPose({ ...serializeAcroPose(initialAcroPose()), contacts: [{ ...stored, a: { base: 'left-ear' } }] }))
      .toThrow('Unknown site "left-ear"');
  });
});

describe('siteAt', () => {
  it('finds named sites and surface coordinates from their own points', () => {
    const coordinate = { segment: 'right-shin', along: 0.7, around: -60 };
    for (const site of [...SITE_NAMES, coordinate]) {
      const { bone, matrix } = localSiteFrame(site);
      expect(siteAt(bone, new THREE.Vector3().setFromMatrixPosition(matrix))).toEqual(site);
    }
  });
});

describe('connect', () => {
  const initial = initialAcroPose();
  const goal = withJoints(initial.base, { shoulder: { forward: 70, raise: 20, rotate: -30 }, elbow: { bend: 40, rotate: 50 }, wrist: { flex: -40 } });
  const start = withJoints(goal, { shoulder: { forward: 55, raise: 30, rotate: -10 }, elbow: { bend: 60, rotate: 30 }, wrist: { flex: -20 } });

  it.each([0, 90, 180])('brings a hand onto the other hand by IK, twisted by %i°', twist => {
    // The flyer's hand placed where the goal pose can reach it, by moving the flyer as a whole
    const placing: Contact = { a: { role: 'flyer', site: 'right-palm' }, b: { role: 'base', site: 'left-palm' }, twist };
    const flyer = connect({ ...initial, base: goal }, placing, true);
    const pose = { ...initial, base: start, flyer };
    const contact: Contact = { a: { role: 'base', site: 'left-palm' }, b: { role: 'flyer', site: 'right-palm' }, twist };

    const connected = { ...pose, base: connect(pose, contact, false) };

    // The same twist holds seen from either side
    for (const c of [contact, placing]) {
      const error = contactError(connected, c);
      expect(error.millimetres).toBeLessThan(1);
      expect(error.degrees).toBeLessThan(1);
    }
    expect(connected.base.position).toEqual(start.position);
  });

  it('moves the whole person for a site on the torso', () => {
    const contact: Contact = { a: { role: 'flyer', site: 'belly' }, b: { role: 'base', site: 'left-sole' }, twist: 30 };
    const connected = { ...initial, flyer: connect(initial, contact, false) };

    const error = contactError(connected, contact);
    expect(error.millimetres).toBeLessThan(1e-6);
    expect(error.degrees).toBeLessThan(1e-4);
    expect(currentTwist(connected, contact.a, contact.b)).toBeCloseTo(30, 6);
    const normal = (pose: HumanPose, site: Site) => new THREE.Vector3().setFromMatrixColumn(siteMatrix(pose, site), 2);
    expect(normal(connected.flyer, 'belly').dot(normal(connected.base, 'left-sole'))).toBeCloseTo(-1, 6);
  });
});

describe('followContacts', () => {
  const NO_LOCKS = { base: [], flyer: [] };
  const initial = initialAcroPose();
  const expectHeld = (pose: AcroPose) => pose.contacts.forEach(c => {
    const error = contactError(pose, c);
    expect(error.millimetres).toBeLessThan(1);
    expect(error.degrees).toBeLessThan(1);
  });

  it('carries a flyer lying on the feet along when the base bends the legs', () => {
    const base = withJoints(initial.base, { root: { pitch: -90 }, hip: { pike: 90 }, knee: { bend: 15 } });
    const contacts: Contact[] = [
      // Face to face, heads on the same side: the flyer's left lies over the base's right
      { a: { role: 'flyer', site: 'left-hip' }, b: { role: 'base', site: 'right-sole' }, twist: 0 },
      { a: { role: 'flyer', site: 'right-hip' }, b: { role: 'base', site: 'left-sole' }, twist: 0 },
    ];
    // Fitting the flyer leaves the feet to adapt to the hips
    const fitted = { ...initial, base, contacts, flyer: fitRigidly({ ...initial, base, contacts }, contacts) };
    const bird = followContacts(fitted, fitted, 'flyer', { base: {}, flyer: {} }, NO_LOCKS);
    expectHeld(bird);
    const bent = { ...bird, base: withJoints(bird.base, { knee: { bend: 35 } }) };

    const followed = followContacts(bird, bent, 'base', { base: {}, flyer: {} }, NO_LOCKS);

    expectHeld(followed);
    expect(followed.flyer.position[1]).toBeLessThan(bird.flyer.position[1] - 0.03);
    expect(followed.base.angles['left-knee'].bend).toBe(35);
    // The base's feet turn to keep the flyer level
    expect(Math.abs(followed.flyer.angles.root.pitch - bird.flyer.angles.root.pitch)).toBeLessThan(2);
  });

  it('lets the other person reach along with the arm when holding hands', () => {
    const goal = withJoints(initial.base, { shoulder: { forward: 70, raise: 20 }, elbow: { bend: 40 } });
    const contact: Contact = { a: { role: 'flyer', site: 'right-palm' }, b: { role: 'base', site: 'left-palm' }, twist: 180 };
    const flyer = withJoints(initial.flyer, { shoulder: { forward: 60 } });
    const holding = { ...initial, base: goal, flyer: connect({ ...initial, base: goal, flyer }, contact, false), contacts: [contact] };
    expectHeld(holding);

    const moved = followContacts(holding, { ...holding, base: withJoints(goal, { shoulder: { forward: 80 } }) }, 'base', { base: {}, flyer: {} }, NO_LOCKS);

    expectHeld(moved);
    expect(moved.flyer.position).toEqual(holding.flyer.position);
  });

  it('leaves locked angles to the user', () => {
    const goal = withJoints(initial.base, { shoulder: { forward: 70, raise: 20 }, elbow: { bend: 40 } });
    const contact: Contact = { a: { role: 'flyer', site: 'right-palm' }, b: { role: 'base', site: 'left-palm' }, twist: 180 };
    const flyer = withJoints(initial.flyer, { shoulder: { forward: 60 } });
    const holding = { ...initial, base: goal, flyer: connect({ ...initial, base: goal, flyer }, contact, false), contacts: [contact] };
    const locks = { base: [], flyer: [{ key: 'right-elbow' as const, name: 'bend' }] };

    const moved = followContacts(holding, { ...holding, base: withJoints(goal, { shoulder: { forward: 80 } }) }, 'base', { base: {}, flyer: {} }, locks);

    expect(moved.flyer.angles['right-elbow'].bend).toBe(holding.flyer.angles['right-elbow'].bend);
    expect(moved.flyer.angles['right-shoulder']).not.toEqual(holding.flyer.angles['right-shoulder']);
  });
});
