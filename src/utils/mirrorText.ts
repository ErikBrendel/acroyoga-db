export function mirrorText(text: string): string {
  const parts: { text: string; isLeftRight: boolean }[] = [];
  const regex = /(left|right)/gi;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.substring(lastIndex, match.index), isLeftRight: false });
    }
    parts.push({ text: match[0], isLeftRight: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.substring(lastIndex), isLeftRight: false });
  }

  return parts.map(part => {
    if (!part.isLeftRight) {
      return part.text;
    }

    const lower = part.text.toLowerCase();
    const isLeft = lower === 'left';
    const swapped = isLeft ? 'right' : 'left';

    if (part.text === part.text.toUpperCase()) {
      return swapped.toUpperCase();
    } else if (part.text[0] === part.text[0].toUpperCase()) {
      return swapped.charAt(0).toUpperCase() + swapped.slice(1);
    } else {
      return swapped;
    }
  }).join('');
}
