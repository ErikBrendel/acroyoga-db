// pnpm pose:solve <params.json> [--out <file.json>] [--vary <path>=<v1>,<v2>…]…: builds the pose from starting
// angles and contacts, solves it and writes the AI draft data-drafts/poses3d/<poseId>.json (or --out); prints
// contact errors, angles at their limits, key points and overlaps. With --vary, every combination of the
// values is solved and summed up in one line each, nothing is written; <path> is a dot path into the params,
// e.g. flyer.joints.hip.pike or contacts.1.b.base.around; --show adds chosen angles or site positions to each line.
// See docs/ai-pose-generation.md.
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { AcroPose, Role, formatStoredAcroPose, serializeAcroPose } from '../../src/3d/acroPose';
import { siteMatrix } from '../../src/3d/sites';
import { ParamsSchema } from './params';
import { report, summary } from './report';
import { humans, solvePose } from './solver';

const args = process.argv.slice(2);
const option = (name: string) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const paramsPath = args.find((a, i) => !a.startsWith('--') && !['--out', '--vary', '--show'].includes(args[i - 1]));
if (!paramsPath) {
  console.error('Usage: pnpm pose:solve <params.json> [--out <file.json>] [--vary <path>=<v1>,<v2>…]');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(paramsPath, 'utf-8'));

// Commas inside JSON values ({"left":5,"right":30}) do not separate values
function splitTopLevel(text: string): string[] {
  let depth = 0;
  return [...text].reduce<string[]>((parts, char) => {
    depth += '{['.includes(char) ? 1 : '}]'.includes(char) ? -1 : 0;
    if (char === ',' && depth === 0) return [...parts, ''];
    parts[parts.length - 1] += char;
    return parts;
  }, ['']);
}

const variations = option('--vary').map(spec => {
  const split = spec.indexOf('=');
  const parse = (v: string) => { try { return JSON.parse(v); } catch { return v; } };
  return { key: spec.slice(0, split), values: splitTopLevel(spec.slice(split + 1)).map(parse) };
});

// --show base.left-elbow.bend (an angle) or flyer:left-sole / flyer:left-forearm@0@0 (a site's position in cm), comma-separated
const shows = option('--show').flatMap(s => s.split(','));
function showValue(pose: AcroPose, spec: string): string {
  if (spec.includes(':')) {
    const [role, name] = spec.split(':') as [Role, string];
    const [segment, along, around] = name.split('@');
    const site = along === undefined ? name : { segment, along: Number(along), around: Number(around ?? 0) };
    const v = new THREE.Vector3().setFromMatrixPosition(siteMatrix(pose[role], site as Parameters<typeof siteMatrix>[1]));
    return `(${[v.x, v.y, v.z].map(x => Math.round(x * 100)).join(', ')})`;
  }
  const [role, bone, angle] = spec.split('.');
  const value = (pose[role as Role].angles as Record<string, Record<string, number>>)[bone]?.[angle];
  if (value === undefined) throw new Error(`--show ${spec}: use <role>.<bone>.<angle> or <role>:<site>`);
  return value.toFixed(1);
}

if (variations.length) {
  const combinations = variations.reduce<Record<string, unknown>[]>(
    (all, { key, values }) => all.flatMap(c => values.map(v => ({ ...c, [key]: v }))), [{}]);
  for (const combination of combinations) {
    const varied = structuredClone(raw);
    for (const [key, value] of Object.entries(combination)) {
      const keys = key.split('.');
      const parent = keys.slice(0, -1).reduce((o, k) => (o[k] ??= {}), varied);
      if (typeof parent !== 'object') throw new Error(`--vary ${key}: ${keys.slice(0, -1).join('.')} is not an object`);
      parent[keys[keys.length - 1]] = value;
    }
    const label = Object.entries(combination).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
    const pose = solvePose(ParamsSchema.parse(varied));
    const shown = shows.map(spec => `${spec} ${showValue(pose, spec)}`).join(', ');
    console.log(`${label}: ${summary(pose)}${shown ? `; ${shown}` : ''}`);
  }
  process.exit(0);
}

const params = ParamsSchema.parse(raw);
const pose = solvePose(params);
// Variants go to --out, so that they do not replace the draft
const draftPath = option('--out')[0] ?? path.join('data-drafts/poses3d', `${params.poseId}.json`);
fs.mkdirSync(path.dirname(draftPath), { recursive: true });
fs.writeFileSync(draftPath, formatStoredAcroPose(serializeAcroPose(pose)) + '\n');
console.log(report(pose, humans));
console.log(`\nWritten: ${draftPath}`);
