// pnpm pose:frames <youtube-url> [<seconds>…] [--range <from>-<to>]: still frames of a YouTube video from its
// storyboard (the preview thumbnails), without downloading the video. Each <seconds> gives one frame, --range a
// labelled contact sheet of every frame in between; without either, the URL's t= is used. The storyboard is
// coarse (one frame every 1–10 s, at most 320×180), enough to see grips, entries and which way people face.
// Written to data-drafts/renders/frames/. See docs/ai-pose-generation.md.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'data-drafts/renders/frames';
const UPSCALE = 2;

const args = process.argv.slice(2);
const url = args.find(a => a.startsWith('http'));
const rangeArg = args[args.indexOf('--range') + 1];
const range = args.includes('--range') ? rangeArg?.split('-').map(Number) : undefined;
const videoId = url && /(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/.exec(url)?.[1];
if (!url || !videoId || (range && (range.length !== 2 || range.some(Number.isNaN)))) {
  console.error('Usage: pnpm pose:frames <youtube-url> [<seconds>…] [--range <from>-<to>]');
  process.exit(1);
}
const urlSeconds = Number(/[?&]t=(\d+)/.exec(url)?.[1] ?? 0);
const seconds = args.filter(a => /^\d+(\.\d+)?$/.test(a) && a !== rangeArg).map(Number);

interface Level {
  index: number;
  width: number;
  height: number;
  count: number;
  columns: number;
  rows: number;
  intervalMs: number;
  name: string;
  signature: string;
}

async function storyboard(): Promise<{ base: string; level: Level; lengthSeconds: number }> {
  const html = await (await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const spec = /"spec":"([^"]+)"/.exec(html)?.[1];
  if (!spec) throw new Error(`No storyboard found for ${videoId} (private, age-restricted or no previews)`);
  const [base, ...levels] = spec.replace(/\\u0026/g, '&').split('|');
  // Level 0 is a single strip of tiny frames; the last level has the largest ones
  const index = levels.length - 1;
  const [width, height, count, columns, rows, intervalMs, name, signature] = levels[index].split('#');
  const lengthSeconds = Number(/"lengthSeconds":"(\d+)"/.exec(html)?.[1] ?? 0);
  return {
    base,
    level: { index, width: +width, height: +height, count: +count, columns: +columns, rows: +rows, intervalMs: +intervalMs, name, signature },
    lengthSeconds,
  };
}

const { base, level, lengthSeconds } = await storyboard();
// Some videos give no interval; then the frames spread over the whole length
const intervalMs = level.intervalMs || (lengthSeconds * 1000) / level.count;
const perSheet = level.columns * level.rows;
const frameAt = (s: number) => Math.min(level.count - 1, Math.max(0, Math.floor((s * 1000) / intervalMs)));
fs.mkdirSync(OUT_DIR, { recursive: true });
const sheets = new Map<number, string>();

async function sheetFile(sheet: number): Promise<string> {
  if (sheets.has(sheet)) return sheets.get(sheet)!;
  const sheetUrl = `${base.replace('$L', String(level.index)).replace('$N', level.name.replace("$M", String(sheet)))}&sigh=${encodeURIComponent(level.signature)}`;
  const response = await fetch(sheetUrl);
  if (!response.ok) throw new Error(`Storyboard sheet ${sheet}: HTTP ${response.status}`);
  const file = path.join(OUT_DIR, `.${videoId}-sheet${sheet}.jpg`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  sheets.set(sheet, file);
  return file;
}

async function writeFrame(frame: number, file: string): Promise<void> {
  const within = frame % perSheet;
  const [x, y] = [(within % level.columns) * level.width, Math.floor(within / level.columns) * level.height];
  execFileSync('magick', [await sheetFile(Math.floor(frame / perSheet)), '-crop', `${level.width}x${level.height}+${x}+${y}`, '+repage', '-resize', `${UPSCALE * 100}%`, file]);
}

const timeOf = (frame: number) => Math.round((frame * intervalMs) / 1000);
const written: string[] = [];
if (range) {
  const frames = Array.from({ length: frameAt(range[1]) - frameAt(range[0]) + 1 }, (_, i) => frameAt(range[0]) + i);
  const tiles = await Promise.all(frames.map(async frame => {
    const file = path.join(OUT_DIR, `.${videoId}-${frame}.png`);
    await writeFrame(frame, file);
    return file;
  }));
  const sheet = path.join(OUT_DIR, `${videoId}-${range[0]}-${range[1]}s.png`);
  execFileSync('magick', ['montage', ...tiles.flatMap((file, i) => ['-label', `${timeOf(frames[i])} s`, file]),
    '-tile', '4x', '-geometry', '+4+4', '-pointsize', '16', sheet]);
  tiles.forEach(file => fs.rmSync(file));
  written.push(sheet);
}
for (const s of seconds.length || range ? seconds : [urlSeconds]) {
  const frame = frameAt(s);
  const file = path.join(OUT_DIR, `${videoId}-${timeOf(frame)}s.png`);
  await writeFrame(frame, file);
  written.push(file);
}
sheets.forEach(file => fs.rmSync(file));
console.log(`Storyboard: ${level.width}×${level.height} frames every ${(intervalMs / 1000).toFixed(1)} s, video ${lengthSeconds} s (frames upscaled ×${UPSCALE})`);
written.forEach(file => console.log(`Written: ${file}`));
