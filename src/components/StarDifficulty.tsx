import { getTransitionColor } from '../utils/difficultyColors';

interface StarDifficultyProps {
  rating: number; // 0-3
  maxStars?: number;
}

// Reuse transition difficulty colors
const EASY_COLOR = getTransitionColor('easy');
const INTERMEDIATE_COLOR = getTransitionColor('intermediate');
const HARD_COLOR = getTransitionColor('hard');

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function lerpColor(color1: string, color2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(color1);
  const [r2, g2, b2] = hexToRgb(color2);

  const r = r1 + (r2 - r1) * t;
  const g = g1 + (g2 - g1) * t;
  const b = b1 + (b2 - b1) * t;

  return rgbToHex(r, g, b);
}

function getDifficultyColor(rating: number): string {
  // Clamp rating to 0-3 range
  const clampedRating = Math.max(0, Math.min(3, rating));

  if (clampedRating <= 1) {
    // 0-1: lerp from easy to easy (just return easy color)
    return EASY_COLOR;
  } else if (clampedRating <= 2) {
    // 1-2: lerp from easy to intermediate
    const t = clampedRating - 1;
    return lerpColor(EASY_COLOR, INTERMEDIATE_COLOR, t);
  } else {
    // 2-3: lerp from intermediate to hard
    const t = clampedRating - 2;
    return lerpColor(INTERMEDIATE_COLOR, HARD_COLOR, t);
  }
}

export function StarDifficulty({ rating, maxStars = 3 }: StarDifficultyProps) {
  const stars = [];
  const fillColor = getDifficultyColor(rating);

  for (let i = 0; i < maxStars; i++) {
    const fillPercentage = Math.min(Math.max(rating - i, 0), 1) * 100;

    stars.push(
      <svg
        key={i}
        className="w-4 h-4 inline-block"
        viewBox="0 0 20 20"
        fill="none"
      >
        <defs>
          <linearGradient id={`star-gradient-${i}-${rating}`}>
            <stop offset={`${fillPercentage}%`} stopColor={fillColor} />
            <stop offset={`${fillPercentage}%`} stopColor="#d1d5db" />
          </linearGradient>
        </defs>
        <path
          d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
          fill={`url(#star-gradient-${i}-${rating})`}
        />
      </svg>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`Difficulty: ${rating.toFixed(1)}/3`}
    >
      {stars}
    </span>
  );
}
