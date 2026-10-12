// pnpm pose:orient '<joints JSON>' [preset names…]: which way head, front, own left, soles and toes of a person
// point with these joints (after the presets), e.g. pnpm pose:orient '{"root":{"turn":180,"roll":-90}}'
import * as THREE from 'three';
import { HumanPose, neutralPose, withJoints } from '../../src/3d/humanPose';
import { findPreset } from '../../src/3d/presets';
import { Site, siteMatrix } from '../../src/3d/sites';

const [jointsJson = '{}', ...presets] = process.argv.slice(2);
const pose = [...presets.map(name => findPreset(name).joints), JSON.parse(jointsJson)]
  .reduce((p: HumanPose, joints) => withJoints(p, joints), neutralPose());

const direction = (v: THREE.Vector3) => (['x', 'y', 'z'] as const)
  .map(axis => ({ axis, value: v[axis] })).filter(d => Math.abs(d.value) > 0.4)
  .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  .map(d => `${d.value > 0 ? '+' : '-'}${d.axis.toUpperCase()}`).join(' and ') || 'diagonal';
const point = (site: Site) => new THREE.Vector3().setFromMatrixPosition(siteMatrix(pose, site));
const axis = (site: Site, column: 1 | 2) => new THREE.Vector3().setFromMatrixColumn(siteMatrix(pose, site), column);
const pelvis = new THREE.Vector3(...pose.position);

console.log([
  `head (from pelvis): ${direction(point('crown').sub(pelvis).normalize())}`,
  `front (chest faces): ${direction(axis('chest', 2))}`,
  `own left side: ${direction(point('left-hip').sub(point('right-hip')).normalize())}`,
  ...(['left', 'right'] as const).flatMap(side => [
    `${side} sole faces: ${direction(axis(`${side}-sole`, 2))}, toes point: ${direction(axis(`${side}-sole`, 1))}`,
    `${side} palm faces: ${direction(axis(`${side}-palm`, 2))}, fingers point: ${direction(axis(`${side}-palm`, 1))}`,
  ]),
  `(world: +X = left of a person standing at turn 0, +Y up, +Z = their front; a base lying with pitch -90 has the head at -Z)`,
].join('\n'));
