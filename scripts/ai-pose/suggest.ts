// pnpm pose:suggest <params.json | pose.json> [<role>:<site> [<role>:<segment>]]: where contacts could go.
// Without a site: free hands and feet near a surface facing them. With a site (e.g. flyer:left-palm): the best
// points for it on the bodies, one per body part, optionally only on one segment (e.g. base:left-thigh).
import fs from 'fs';
import { Role, StoredAcroPoseSchema, parseAcroPose } from '../../src/3d/acroPose';
import { bestTargets, possibleContacts, suggestionLine } from './contacts';
import { ParamsSchema } from './params';
import { solvePose } from './solver';

const [file, siteSpec, segmentSpec] = process.argv.slice(2);
if (!file) {
  console.error('Usage: pnpm pose:suggest <params.json | pose.json> [<role>:<site> [<role>:<segment>]]');
  process.exit(1);
}
const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
// A params file is solved first, stored pose data is taken as it is
const pose = 'poseId' in json ? solvePose(ParamsSchema.parse(json)) : parseAcroPose(StoredAcroPoseSchema.parse(json));

const ref = (spec: string) => {
  const [role, name] = spec.split(':');
  if (role !== 'base' && role !== 'flyer') throw new Error(`"${spec}": use base:<site> or flyer:<site>`);
  return { role: role as Role, name };
};

if (!siteSpec) {
  const lines = possibleContacts(pose, 0.2).map(suggestionLine);
  console.log(lines.length ? lines.join('\n') : 'No free hand or foot within 20 cm of a surface facing it');
} else {
  const { role, name } = ref(siteSpec);
  const segment = segmentSpec ? ref(segmentSpec) : undefined;
  console.log(bestTargets(pose, { role, site: name }, undefined, segment ? 3 : 8, segment && { role: segment.role, segment: segment.name })
    .map(suggestionLine).join('\n'));
}
