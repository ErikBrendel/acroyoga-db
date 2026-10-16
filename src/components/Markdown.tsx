import { ReactNode } from 'react';

/** Renders the small markdown subset of the docs: headings, paragraphs, bullet lists, bold, code and bare URLs */
export function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const heading = /^(#+) (.*)/.exec(block);
        if (heading) {
          const className = heading[1].length === 1 ? 'text-2xl font-bold mt-2 mb-3' : 'text-lg font-semibold mt-6 mb-2';
          return <h2 key={i} className={`text-gray-900 ${className}`}>{inline(heading[2])}</h2>;
        }
        if (lines[0].startsWith('- ')) {
          const items = block.split(/\n(?=- )/).map(item => item.slice(2));
          return (
            <ul key={i} className="list-disc pl-5 space-y-1.5 text-gray-700">
              {items.map((item, j) => <li key={j}>{inline(item)}</li>)}
            </ul>
          );
        }
        return <p key={i} className="text-gray-700 mb-3">{inline(block)}</p>;
      })}
    </>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s),]+)/).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i} className="text-sm bg-gray-100 px-1 rounded">{part.slice(1, -1)}</code>;
    if (/^https?:\/\//.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">{part}</a>;
    }
    return part;
  });
}
