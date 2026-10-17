import { ReactNode, useRef } from 'react';

export const SHEET_HEIGHT = { peek: 0.33, full: 0.8 };

interface BottomSheetProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
}

/** Phone drawer over the map: scrolling its content up expands it, pulling down at its top collapses it again */
export function BottomSheet({ expanded, onExpandedChange, children }: BottomSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isAtTop = () => (ref.current?.scrollTop ?? 0) <= 0;

  return (
    <div
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col bg-white rounded-t-xl shadow-[0_-4px_16px_rgba(0,0,0,0.15)] overflow-y-auto overscroll-contain transition-[height] duration-300"
      style={{ height: `${(expanded ? SHEET_HEIGHT.full : SHEET_HEIGHT.peek) * 100}%` }}
      onScroll={(e) => !expanded && e.currentTarget.scrollTop > 8 && onExpandedChange(true)}
      onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
      onTouchMove={(e) => expanded && isAtTop() && e.touches[0].clientY - touchStartY.current > 60 && onExpandedChange(false)}
      onWheel={(e) => expanded && isAtTop() && e.deltaY < 0 && onExpandedChange(false)}
    >
      <button
        onClick={() => onExpandedChange(!expanded)}
        className="sticky top-0 z-10 shrink-0 flex justify-center py-2 bg-white"
        aria-label={expanded ? 'Show more of the map' : 'Show more details'}
      >
        <span className="w-10 h-1.5 rounded-full bg-gray-300" />
      </button>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
