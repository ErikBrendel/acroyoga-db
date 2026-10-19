// pnpm pose:render <poseId> [--view Front|Side|Top|Angled|Head end] [--saved]: renders the pose in the 3D editor of the
// running dev server and writes data-drafts/renders/<poseId>.png: 2×2 Front | Side / Angled | Top, or one larger
// view. Shows the AI draft unless --saved. Starts a headless Chrome with remote debugging if none is running.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const APP_URL = process.env.POSE_APP_URL ?? 'http://localhost:5173/acroyoga-db/';
const PORT = Number(process.env.POSE_CHROME_PORT ?? 9333);
const CHROME = process.env.POSE_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWS = ['Front', 'Side', 'Angled', 'Top'];
const SINGLE_VIEWS = [...VIEWS, 'Head end'];
const PANEL_WIDTH = 384;
const SIZE = { width: 1400, height: 900 };

const args = process.argv.slice(2);
const poseId = args.find(a => !a.startsWith('--'));
const view = args.includes('--view') ? args[args.indexOf('--view') + 1] : null;
if (!poseId || (view && !SINGLE_VIEWS.includes(view))) {
  console.error('Usage: pnpm pose:render <poseId> [--view Front|Side|Top|Angled|"Head end"] [--saved]');
  process.exit(1);
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const devtools = (route: string, method = 'GET') => fetch(`http://127.0.0.1:${PORT}/json/${route}`, { method }).then(r => r.json());

async function ensureChrome(): Promise<void> {
  if (await devtools('version').then(() => true, () => false)) return;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-render-'));
  spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50 && !(await devtools('version').then(() => true, () => false)); i++) await sleep(200);
}

async function connectTab(url: string) {
  const tab = await devtools(`new?${url}`, 'PUT');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  let id = 0;
  const pending = new Map<number, (result: any) => void>();
  ws.addEventListener('message', event => {
    const data = JSON.parse(String(event.data));
    if (data.id) pending.get(data.id)?.(data);
  });
  const send = (method: string, params = {}) => new Promise<any>(resolve => {
    pending.set(++id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression: string) => {
    const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const close = async () => { ws.close(); await devtools(`close/${tab.id}`, 'PUT').catch(() => undefined); };
  return { send, evaluate, close };
}

const clickButton = (text: string) => `(() => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)});
  if (button) button.click();
  return !!button;
})()`;

// Clicks the button as soon as it is there; false if it does not appear in time
async function clickWhenThere(tab: Awaited<ReturnType<typeof connectTab>>, text: string, timeout = 15000): Promise<boolean> {
  for (const start = Date.now(); Date.now() - start < timeout; await sleep(200)) {
    if (await tab.evaluate(clickButton(text))) return true;
  }
  return false;
}

await ensureChrome();
const tab = await connectTab('about:blank');
try {
  await tab.send('Emulation.setDeviceMetricsOverride', { ...SIZE, deviceScaleFactor: 1, mobile: false });
  await tab.send('Page.enable');
  await tab.send('Page.navigate', { url: `${APP_URL}?pose=${poseId}` });
  if (!(await clickWhenThere(tab, '🎭 Open in 3D editor'))) throw new Error(`No pose "${poseId}" or the app is not in edit mode at ${APP_URL}`);
  if (!args.includes('--saved') && !(await clickWhenThere(tab, 'Load AI draft'))) throw new Error(`No AI draft for "${poseId}" (use --saved for saved data)`);
  // The editor opened with the pose: its view buttons are there
  if (!(await clickWhenThere(tab, 'Angled'))) throw new Error('The 3D editor did not open');
  await sleep(800);
  const clip = { x: 0, y: 0, width: SIZE.width - PANEL_WIDTH, height: SIZE.height, scale: view ? 1 : 0.5 };
  const shots: string[] = [];
  for (const name of view ? [view] : VIEWS) {
    await tab.evaluate(clickButton(name));
    await sleep(400);
    shots.push((await tab.send('Page.captureScreenshot', { format: 'png', clip })).result.data);
  }
  // Composed in the page itself, so no image library is needed
  const composed: string = await tab.evaluate(`(async () => {
    const images = await Promise.all(${JSON.stringify(shots)}.map(data => new Promise(resolve => {
      const image = new Image(); image.onload = () => resolve(image); image.src = 'data:image/png;base64,' + data;
    })));
    const [w, h] = [images[0].width, images[0].height];
    const canvas = document.createElement('canvas');
    canvas.width = images.length > 1 ? w * 2 : w;
    canvas.height = images.length > 1 ? h * 2 : h;
    images.forEach((image, i) => canvas.getContext('2d').drawImage(image, (i % 2) * w, Math.floor(i / 2) * h));
    return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  const out = path.join('data-drafts/renders', `${poseId}${view ? `-${view.toLowerCase().replace(' ', '-')}` : ''}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(composed, 'base64'));
  console.log(`Written: ${out}${view ? '' : ' (Front | Side / Angled | Top)'}`);
} finally {
  await tab.close();
}
