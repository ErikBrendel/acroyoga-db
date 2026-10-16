import relatedWork from '../../docs/related-work.md?raw';
import { Markdown } from '../components/Markdown';

const ABOUT = `# About

Acroyoga DB maps L-base acroyoga poses as a graph: each pose is a point, each transition between two poses a line, and flows are paths through it. It is a reference for remembering, browsing and sharing between sessions. It does not replace a teacher: whether you are ready for a pose and how it is spotted is learned with people who can see you.

Names differ between communities. Each pose lists the other names it is known by, and its page says when a name is also used for a different pose.

Made by a practitioner; data and code: https://github.com/ErikBrendel/acroyoga-db`;

export function AboutView() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Markdown text={ABOUT} />
      <div className="mt-6 border-t border-gray-200 pt-2">
        <Markdown text={relatedWork} />
      </div>
    </div>
  );
}
