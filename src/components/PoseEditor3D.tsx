import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Human } from '../3d/Human';
import {
  HumanPose, StoredHumanPose, StoredJoints, mirrorHumanPose, neutralPose, parseHumanPose, serializeHumanPose, withAngle, withJoints,
} from '../3d/humanPose';
import { AngleDef, BONES, BoneKey, JOINTS, JointId, Side, boneKey, boneLabel, oppositeBone } from '../3d/skeleton';
import { useHistory } from '../hooks/useHistory';

const DRAFT_STORAGE_KEY = 'acroyoga-db:pose-editor-draft';
const CAMERA_TARGET = new THREE.Vector3(0, 0.9, 0);
const VIEWS: Record<string, [number, number, number]> = {
  Front: [0, 1.1, 3.2],
  Side: [3.2, 1.1, 0],
  Top: [0, 4, 0.001],
  Angled: [2, 1.6, 2.6],
};

interface PresetGroup {
  name: string;
  // Body presets change the orientation, so the root is moved to stand/lie on the floor afterwards
  grounded: boolean;
  presets: { name: string; joints: StoredJoints }[];
}

const PRESET_GROUPS: PresetGroup[] = [
  {
    name: 'Body',
    grounded: true,
    presets: [
      { name: 'Upright', joints: { root: { turn: 0, pitch: 0, roll: 0 } } },
      { name: 'On back', joints: { root: { turn: 0, pitch: -90, roll: 0 } } },
      { name: 'On belly', joints: { root: { turn: 0, pitch: 90, roll: 0 } } },
      { name: 'Upside down', joints: { root: { turn: 0, pitch: 180, roll: 0 } } },
    ],
  },
  {
    name: 'Legs',
    grounded: false,
    presets: [
      { name: 'Straight', joints: { hip: { pike: 0, straddle: 0, rotate: 0 }, knee: { bend: 0 } } },
      { name: 'Straddle', joints: { hip: { pike: 0, straddle: 60 }, knee: { bend: 0 } } },
      { name: 'Pike', joints: { hip: { pike: 90, straddle: 0 }, knee: { bend: 0 } } },
      { name: 'Straddle pike', joints: { hip: { pike: 80, straddle: 50 }, knee: { bend: 0 } } },
      { name: 'Tuck', joints: { hip: { pike: 110, straddle: 0 }, knee: { bend: 130 } } },
      { name: 'Base legs up', joints: { hip: { pike: 90, straddle: 0 }, knee: { bend: 0 }, ankle: { point: -10 } } },
    ],
  },
  {
    name: 'Feet',
    grounded: false,
    presets: [
      { name: 'Neutral', joints: { ankle: { point: 0, tilt: 0 } } },
      { name: 'Pointed', joints: { ankle: { point: 70, tilt: 0 } } },
      { name: 'Flexed', joints: { ankle: { point: -25, tilt: 0 } } },
    ],
  },
  {
    name: 'Arms',
    grounded: false,
    presets: [
      { name: 'Hanging', joints: { shoulder: { forward: 0, raise: 0, rotate: 0 }, elbow: { bend: 0, rotate: 0 }, wrist: { flex: 0, tilt: 0 } } },
      { name: 'Relaxed', joints: { shoulder: { forward: 10, raise: 10, rotate: 0 }, elbow: { bend: 25, rotate: 0 }, wrist: { flex: 10, tilt: 0 } } },
      { name: 'T', joints: { shoulder: { forward: 0, raise: 90, rotate: 0 }, elbow: { bend: 0, rotate: 0 } } },
      { name: 'Forward', joints: { shoulder: { forward: 90, raise: 0, rotate: 0 }, elbow: { bend: 0, rotate: 0 } } },
      { name: 'Overhead', joints: { shoulder: { forward: 180, raise: 0, rotate: 0 }, elbow: { bend: 0, rotate: 0 } } },
      { name: 'Hands on hips', joints: { shoulder: { forward: 0, raise: 30, rotate: -60 }, elbow: { bend: 110, rotate: -60 }, wrist: { flex: 0 } } },
    ],
  },
];

function loadDraft(): HumanPose {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw) return parseHumanPose(JSON.parse(raw));
  } catch {
    // Storage unavailable or draft from an outdated format: start fresh
  }
  return neutralPose();
}

function saveDraft(pose: HumanPose): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(serializeHumanPose(pose)));
  } catch {
    // Storage unavailable: the draft just won't survive a reload
  }
}

function withBoneAngles(pose: HumanPose, key: BoneKey, values: Record<string, number>, symmetric: boolean): HumanPose {
  const opposite = oppositeBone(key);
  const keys = symmetric && opposite ? [key, opposite] : [key];
  return keys.reduce(
    (result, k) => Object.entries(values).reduce((r, [name, value]) => withAngle(r, k, name, value), result),
    pose,
  );
}

// One joint per line keeps the JSON short and diff-friendly
function formatStoredPose({ position, joints }: StoredHumanPose): string {
  const lines = Object.entries(joints).map(([joint, values]) => `    "${joint}": ${JSON.stringify(values)}`);
  const jointsJson = lines.length ? `{\n${lines.join(',\n')}\n  }` : '{}';
  return `{\n  "position": ${JSON.stringify(position)},\n  "joints": ${jointsJson}\n}`;
}

export function PoseEditor3D({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const humanRef = useRef<Human | null>(null);
  const gizmoRef = useRef<TransformControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);

  const history = useHistory(loadDraft);
  const pose = history.state;
  const [selected, setSelected] = useState<BoneKey | null>(null);
  const [rootMode, setRootMode] = useState<'translate' | 'rotate'>('rotate');
  const [symmetric, setSymmetric] = useState(false);
  const [importText, setImportText] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Three.js event handlers are registered once, so they read the current values from here
  const latest = useRef({ pose, symmetric, history });
  latest.current = { pose, symmetric, history };

  useEffect(() => {
    const container = containerRef.current;
    if (!isOpen || !container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.05, 100);
    camera.position.set(...VIEWS.Angled);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.target.copy(CAMERA_TARGET);
    orbitRef.current = orbit;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
    scene.add(sun);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(10, 20, 0x888888, 0x444444);
    grid.position.y = 0.001;
    scene.add(grid);

    const human = new Human();
    human.apply(latest.current.pose);
    scene.add(human.object);
    humanRef.current = human;

    const gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setSize(0.9);
    scene.add(gizmo.getHelper());
    gizmoRef.current = gizmo;

    gizmo.addEventListener('dragging-changed', event => {
      orbit.enabled = !event.value;
    });
    gizmo.addEventListener('mouseDown', () => latest.current.history.checkpoint());
    gizmo.addEventListener('objectChange', () => {
      const node = gizmo.object;
      const bone = Object.values(human.bones).find(b => b.node === node);
      if (!bone) return;
      const { pose: current, symmetric: isSymmetric, history: h } = latest.current;

      const next = gizmo.mode === 'translate'
        ? { ...current, position: node.position.toArray() as [number, number, number] }
        : withBoneAngles(current, bone.key, bone.anglesFromQuaternion(node.quaternion, current.angles[bone.key]), isSymmetric);
      // Snap the bone back onto the clamped angles right away, before React re-renders
      human.apply(next);
      latest.current.pose = next;
      h.replace(next);
    });

    // Click selects a bone, but not at the end of a camera orbit or gizmo drag
    const raycaster = new THREE.Raycaster();
    let pointerDown: { x: number; y: number; onGizmo: boolean } | null = null;
    const handlePointerDown = (e: PointerEvent) => {
      pointerDown = { x: e.clientX, y: e.clientY, onGizmo: gizmo.axis !== null };
    };
    const handlePointerUp = (e: PointerEvent) => {
      const down = pointerDown;
      pointerDown = null;
      if (!down || down.onGizmo || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      setSelected(human.pick(raycaster));
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    renderer.setAnimationLoop(() => {
      orbit.update();
      renderer.render(scene, camera);
    });

    const resizeObserver = new ResizeObserver(() => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      gizmo.detach();
      gizmo.dispose();
      orbit.dispose();
      human.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      grid.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      humanRef.current = null;
      gizmoRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    humanRef.current?.apply(pose);
    saveDraft(pose);
  }, [pose]);

  useEffect(() => {
    const human = humanRef.current;
    const gizmo = gizmoRef.current;
    if (!human || !gizmo) return;

    const opposite = selected && symmetric ? oppositeBone(selected) : null;
    human.setHighlighted([selected, opposite].filter((k): k is BoneKey => k !== null));

    if (!selected) {
      gizmo.detach();
      return;
    }
    const bone = human.bones[selected];
    const translate = selected === 'root' && rootMode === 'translate';
    gizmo.attach(bone.node);
    gizmo.setMode(translate ? 'translate' : 'rotate');
    gizmo.setSpace(translate ? 'world' : 'local');
    gizmo.showX = translate || bone.hasAxis('x');
    gizmo.showY = translate || bone.hasAxis('y');
    gizmo.showZ = translate || bone.hasAxis('z');
  }, [selected, rootMode, symmetric, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) latest.current.history.redo();
        else latest.current.history.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        latest.current.history.redo();
      } else if (e.key === 'Escape') {
        setSelected(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const setView = (position: [number, number, number]) => {
    cameraRef.current?.position.set(...position);
    orbitRef.current?.target.copy(CAMERA_TARGET);
  };

  const grounded = (p: HumanPose): HumanPose => {
    const human = humanRef.current;
    return human ? { ...p, position: [p.position[0], human.groundedRootHeight(p), p.position[2]] } : p;
  };

  const applyPreset = (group: PresetGroup, joints: StoredJoints) => history.commit(p => {
    const next = withJoints(p, joints);
    return group.grounded ? grounded(next) : next;
  });

  const resetBone = (key: BoneKey) => history.commit(p =>
    withBoneAngles(p, key, Object.fromEntries(Object.keys(p.angles[key]).map(name => [name, 0])), symmetric),
  );

  const storedPose = serializeHumanPose(pose);
  const json = formatStoredPose(storedPose);

  const copyJson = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const applyImport = () => {
    try {
      history.commit(parseHumanPose(JSON.parse(importText ?? '')));
      setImportText(null);
      setImportError(null);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex">
      <div ref={containerRef} className="flex-1 min-w-0 relative">
        <div className="absolute top-3 left-3 flex gap-1">
          {Object.entries(VIEWS).map(([name, position]) => (
            <button key={name} onClick={() => setView(position)} className="px-2 py-1 rounded text-xs bg-gray-800/80 text-gray-200 hover:bg-gray-700">
              {name}
            </button>
          ))}
        </div>
        <div className="absolute bottom-3 left-3 text-xs text-gray-400 pointer-events-none">
          Click a body part to select · drag rings to rotate · Esc deselects · ⌘Z / ⇧⌘Z undo/redo
        </div>
      </div>

      <div className="w-96 shrink-0 bg-gray-900 text-white p-4 overflow-y-auto space-y-5">
        <div className="flex justify-between items-center gap-2">
          <h2 className="text-lg font-bold">3D Pose Editor</h2>
          <div className="flex gap-1">
            <ToolbarButton onClick={history.undo} disabled={!history.canUndo} title="Undo (⌘Z)">Undo</ToolbarButton>
            <ToolbarButton onClick={history.redo} disabled={!history.canRedo} title="Redo (⇧⌘Z)">Redo</ToolbarButton>
            <ToolbarButton onClick={onClose} className="bg-red-600 hover:bg-red-700">Close</ToolbarButton>
          </div>
        </div>

        <section>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-gray-300">Body part</h3>
            <ToolbarButton
              onClick={() => setSymmetric(!symmetric)}
              className={symmetric ? 'bg-yellow-500 text-black hover:bg-yellow-400' : undefined}
              title="Edits to one side are applied to the other side as well"
            >
              ⟷ Symmetric
            </ToolbarButton>
          </div>
          <BodyMap selected={selected} onSelect={setSelected} />
        </section>

        {selected && (
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">{boneLabel(BONES[selected].joint, BONES[selected].side)}{symmetric && oppositeBone(selected) ? ' (both sides)' : ''}</h3>
              <ToolbarButton onClick={() => resetBone(selected)}>Reset</ToolbarButton>
            </div>
            {selected === 'root' && (
              <RootControls
                pose={pose}
                mode={rootMode}
                onModeChange={setRootMode}
                onBeginEdit={history.checkpoint}
                onChange={history.replace}
                onGround={() => history.commit(grounded)}
              />
            )}
            {JOINTS[BONES[selected].joint].angles.map(angle => (
              <AngleRow
                key={angle.name}
                angle={angle}
                value={pose.angles[selected][angle.name]}
                onBeginEdit={history.checkpoint}
                onChange={value => history.replace(p => withBoneAngles(p, selected, { [angle.name]: value }, symmetric))}
              />
            ))}
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-300">Presets</h3>
          {PRESET_GROUPS.map(group => (
            <div key={group.name} className="flex flex-wrap gap-1 items-center">
              <span className="text-xs text-gray-500 w-12">{group.name}</span>
              {group.presets.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(group, preset.joints)}
                  className="px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ))}
        </section>

        <section className="flex flex-wrap gap-2">
          <ToolbarButton onClick={() => history.commit(mirrorHumanPose)} title="Swap left and right">⟷ Mirror pose</ToolbarButton>
          <ToolbarButton onClick={() => history.commit(grounded)} title="Move vertically so the lowest point touches the floor">⤓ Drop to floor</ToolbarButton>
          <ToolbarButton onClick={() => history.commit(neutralPose())}>Reset all</ToolbarButton>
        </section>

        <section className="space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-300">Pose JSON</h3>
            <div className="flex gap-1">
              <ToolbarButton onClick={copyJson}>{copied ? '✓ Copied' : 'Copy'}</ToolbarButton>
              <ToolbarButton onClick={() => { setImportText(importText === null ? json : null); setImportError(null); }}>
                {importText === null ? 'Edit / paste' : 'Cancel'}
              </ToolbarButton>
            </div>
          </div>
          {importText === null ? (
            <pre className="bg-gray-950 rounded p-2 text-xs text-green-300 overflow-x-auto">{json}</pre>
          ) : (
            <>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                className="w-full h-48 bg-gray-950 rounded p-2 text-xs font-mono text-green-300"
                spellCheck={false}
              />
              {importError && <p className="text-xs text-red-400 whitespace-pre-wrap">{importError}</p>}
              <ToolbarButton onClick={applyImport} className="bg-green-700 hover:bg-green-600">Apply</ToolbarButton>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ToolbarButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-2 py-1 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed ${className ?? 'bg-gray-700 hover:bg-gray-600'}`}
    />
  );
}

const SIDE_DOT: Record<Side | 'center', string> = { left: 'bg-[#4f8ef7]', right: 'bg-[#f59e42]', center: 'bg-[#b0bec5]' };

// Laid out as seen from the front: the person's right side is on the left
function BodyMap({ selected, onSelect }: { selected: BoneKey | null; onSelect: (key: BoneKey) => void }) {
  const cell = (joint: JointId, side: Side | null) => {
    const key = boneKey(joint, side);
    return (
      <button
        key={key}
        onClick={() => onSelect(key)}
        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left ${selected === key ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${SIDE_DOT[side ?? 'center']}`} />
        {JOINTS[joint].label}
      </button>
    );
  };
  const center = (joint: JointId) => <div className="col-span-2 grid px-12">{cell(joint, null)}</div>;
  const pairs = (joints: JointId[]) => joints.flatMap(joint => [cell(joint, 'right'), cell(joint, 'left')]);

  return (
    <div className="grid grid-cols-2 gap-1">
      {center('neck')}
      {center('chest')}
      <div className="text-[10px] text-gray-500 text-center">Right</div>
      <div className="text-[10px] text-gray-500 text-center">Left</div>
      {pairs(['shoulder', 'elbow', 'wrist'])}
      {center('waist')}
      {center('root')}
      {pairs(['hip', 'knee', 'ankle'])}
    </div>
  );
}

interface AngleRowProps {
  angle: AngleDef;
  value: number;
  onBeginEdit: () => void;
  onChange: (value: number) => void;
}

function AngleRow({ angle, value, onBeginEdit, onChange }: AngleRowProps) {
  const handleChange = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) onChange(parsed);
  };
  return (
    <div>
      <div className="flex justify-between items-center text-sm mb-1">
        <span>{angle.name}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            step={1}
            min={angle.min}
            max={angle.max}
            value={Math.round(value * 10) / 10}
            onFocus={onBeginEdit}
            onChange={e => handleChange(e.target.value)}
            className="w-16 bg-gray-800 rounded px-1 text-right"
          />
          °
        </span>
      </div>
      <input
        type="range"
        min={angle.min}
        max={angle.max}
        step={0.5}
        value={value}
        onPointerDown={onBeginEdit}
        onKeyDown={onBeginEdit}
        onChange={e => handleChange(e.target.value)}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>{angle.min}°</span>
        <span>{angle.max}°</span>
      </div>
    </div>
  );
}

interface RootControlsProps {
  pose: HumanPose;
  mode: 'translate' | 'rotate';
  onModeChange: (mode: 'translate' | 'rotate') => void;
  onBeginEdit: () => void;
  onChange: (update: (pose: HumanPose) => HumanPose) => void;
  onGround: () => void;
}

function RootControls({ pose, mode, onModeChange, onBeginEdit, onChange, onGround }: RootControlsProps) {
  const setCoordinate = (index: number, raw: string) => {
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    onChange(p => {
      const position = [...p.position] as [number, number, number];
      position[index] = parsed;
      return { ...p, position };
    });
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {(['rotate', 'translate'] as const).map(m => (
          <ToolbarButton key={m} onClick={() => onModeChange(m)} className={mode === m ? 'bg-green-600 hover:bg-green-500 flex-1' : 'bg-gray-700 hover:bg-gray-600 flex-1'}>
            {m === 'rotate' ? 'Rotate gizmo' : 'Move gizmo'}
          </ToolbarButton>
        ))}
      </div>
      <div className="flex gap-2 items-center text-sm">
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <label key={axis} className="flex items-center gap-1">
            {axis}
            <input
              type="number"
              step={0.01}
              value={Number(pose.position[i].toFixed(3))}
              onFocus={onBeginEdit}
              onChange={e => setCoordinate(i, e.target.value)}
              className="w-16 bg-gray-800 rounded px-1 text-right"
            />
          </label>
        ))}
        <ToolbarButton onClick={onGround} title="Move vertically so the lowest point touches the floor">⤓</ToolbarButton>
      </div>
    </div>
  );
}
