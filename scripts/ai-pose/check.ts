// pnpm pose:check <pose.json>: the pose:solve report for stored pose data as it is (an approved pose or a draft),
// e.g. to review a draft or to compare it with the human-corrected version
import fs from 'fs';
import { StoredAcroPoseSchema, parseAcroPose } from '../../src/3d/acroPose';
import { report } from './report';
import { humans } from './solver';

const file = process.argv[2];
if (!file) {
  console.error('Usage: pnpm pose:check <pose.json>');
  process.exit(1);
}
console.log(report(parseAcroPose(StoredAcroPoseSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')))), humans));
