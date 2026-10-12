// pnpm pose:solve <params.json> [--out <file.json>] [--vary <path>=<v1>,<v2>…]…: builds the pose from starting
// angles and contacts, solves it and writes the AI draft data-drafts/poses3d/<poseId>.json (or --out); prints
// contact errors, angles at their limits, key points and overlaps. With --vary, every combination of the
// values is solved and summed up in one line each, nothing is written; <path> is a dot path into the params,
// e.g. flyer.joints.hip.pike or contacts.1.b.base.around. See docs/ai-pose-generation.md.
import fs from 'fs';
import path from 'path';
import { formatStoredAcroPose, serializeAcroPose } from '../../src/3d/acroPose';
import { ParamsSchema } from './params';
import { report, summary } from './report';
import { humans, solvePose } from './solver';

const args = process.argv.slice(2);
const option = (name: string) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const paramsPath = args.find((a, i) => !a.startsWith('--') && !['--out', '--vary'].includes(args[i - 1]));
if (!paramsPath) {
  console.error('Usage: pnpm pose:solve <params.json> [--out <file.json>] [--vary <path>=<v1>,<v2>…]');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(paramsPath, 'utf-8'));

const variations = option('--vary').map(spec => {
  const [key, values] = spec.split('=');
  return { key, values: values.split(',').map(v => JSON.parse(v)) };
});

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
    console.log(`${label}: ${summary(solvePose(ParamsSchema.parse(varied)))}`);
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
