import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { contactError, parseAcroPose } from './acroPose';
import { lerpHumanPose } from './humanPose';
import { keptContacts, transition } from './transition';

const load = (path: string) => parseAcroPose(JSON.parse(fs.readFileSync(path, 'utf-8')));

describe('transition', () => {
  it('keeps the grips that both poses share closed on the way', () => {
    const from = load('public/data/poses3d/star.json');
    const to = load('public/data/poses3d/straddlebat.json');
    const kept = keptContacts(from, to);
    const grips = kept.filter(c => String(c.a.site).includes('palm'));
    expect(grips).toHaveLength(2);

    // Between two solved steps
    const t = 0.45;
    const lerped = { ...to, base: lerpHumanPose(from.base, to.base, t), flyer: lerpHumanPose(from.flyer, to.flyer, t) };
    const middle = transition(from, to)(t);
    for (const grip of grips) {
      expect(contactError(lerped, grip).millimetres).toBeGreaterThan(10);
      expect(contactError(middle, grip).millimetres).toBeLessThan(5);
    }
  });
});
