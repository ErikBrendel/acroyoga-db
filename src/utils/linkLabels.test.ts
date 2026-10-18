import { describe, expect, it } from 'vitest';
import { linkLabel } from './linkLabels';

describe('linkLabel', () => {
  it('names known sites and falls back to the host', () => {
    expect(linkLabel('https://acropassport.com/skills-library/lb-bird')).toBe('Open on AcroPassport');
    expect(linkLabel('https://www.youtube.com/watch?v=abc&t=42')).toBe('Open on YouTube');
    expect(linkLabel('https://m.youtube.com/watch?v=abc')).toBe('Open on YouTube');
    expect(linkLabel('https://www.example.org/bird')).toBe('Open on example.org');
  });
});
