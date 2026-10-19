// pnpm pose:check <pose.json> [<role>:<site>…]: the pose:solve report for stored pose data as it is (an approved
// pose or a draft), e.g. to review a draft or to compare it with the human-corrected version. With sites (e.g.
// flyer:left-instep, base:right-shin@0.3@-125), also their position, normal and direction.
import fs from 'fs';
import * as THREE from 'three';
import { Role, StoredAcroPoseSchema, parseAcroPose } from '../../src/3d/acroPose';
import { siteMatrix } from '../../src/3d/sites';
import { report } from './report';
import { humans } from './solver';

const [file, ...siteSpecs] = process.argv.slice(2);
if (!file) {
  console.error('Usage: pnpm pose:check <pose.json> [<role>:<site> | <role>:<segment>@<along>@<around>…]');
  process.exit(1);
}
const pose = parseAcroPose(StoredAcroPoseSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8'))));
console.log(report(pose, humans));
if (siteSpecs.length) console.log('\nSites:');

const cm = (v: THREE.Vector3) => `(${[v.x, v.y, v.z].map(x => Math.round(x * 100)).join(', ')})`;
const unit = (v: THREE.Vector3) => `(${[v.x, v.y, v.z].map(x => x.toFixed(2)).join(', ')})`;
for (const spec of siteSpecs) {
  const [role, name] = spec.split(':');
  if (role !== 'base' && role !== 'flyer') throw new Error(`"${spec}": use base:<site> or flyer:<site>`);
  const [segment, along, around] = name.split('@');
  const site = along === undefined ? name : { segment, along: Number(along), around: Number(around ?? 0) };
  const matrix = siteMatrix(pose[role as Role], site as Parameters<typeof siteMatrix>[1]);
  console.log(`${spec}: at ${cm(new THREE.Vector3().setFromMatrixPosition(matrix))} cm, normal ${unit(new THREE.Vector3().setFromMatrixColumn(matrix, 2))}, direction ${unit(new THREE.Vector3().setFromMatrixColumn(matrix, 1))}`);
}
