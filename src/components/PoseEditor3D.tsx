import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { z } from 'zod';
import { Hit, Human } from '../3d/Human';
import {
  AcroPose, Contact, ROLES, Role, SiteRef, Twist, connect, contactError, currentTwist, fitRigidly, followContacts,
  initialAcroPose, isOwnMirrorImage, mirrorAcroPose, reversed, mirrorContact, mirrorPartner, movesLimb, normalizeTwist, ownContactMover,
  parseAcroPose, serializeAcroPose, formatStoredAcroPose,
} from '../3d/acroPose';
import { PALETTES } from '../3d/bodyMesh';
import {
  EFFECTORS, Effector, FixedAngle, FixedAngleSchema, IkTarget, Pins, PinsSchema, parentAngles, floorTarget, isEffector, limbChain, limbEffector, mirrorTarget, readTarget, solveIk, withPins, worldMatrix,
} from '../3d/ik';
import { HumanPose, breaksSymmetry, editedSide, symmetrized, withAngle, withJoints } from '../3d/humanPose';
import { SITE_NAMES, localSiteFrame, normalizeDegrees, siteAt, siteLabel, siteMatrix } from '../3d/sites';
import { AngleDef, BONES, BoneKey, JOINTS, JointId, Side, boneKey, boneLabel, oppositeBone } from '../3d/skeleton';
import { useHistory } from '../hooks/useHistory';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { PRESET_GROUPS, PresetGroup } from '../3d/presets';
import { StoredPoses3d, deleteDraft3d, fetchPoses3d, savePose3d } from '../api/poses3d';
import { loadPose3d } from '../3d/pose3dData';
import { Pose } from '../types/data';

const DRAFT_STORAGE_KEY = 'acroyoga-db:pose-editor-draft';
const CAMERA_TARGET = new THREE.Vector3(0, 0.9, 0.35);
const VIEWS: Record<string, [number, number, number]> = {
  Front: [0, 1.1, 3.6],
  Side: [3.6, 1.1, 0.35],
  Top: [0, 4.4, 0.351],
  Angled: [2.2, 1.7, 3],
};

const ROLE_LABELS: Record<Role, string> = { base: 'Base', flyer: 'Flyer' };
// A contact counts as broken beyond this
const CONTACT_TOLERANCE = { millimetres: 10, degrees: 5 };

type GizmoMode = 'translate' | 'rotate';

// `edit`: edits to one side are applied to the other side as well; `enforce`: in addition, the edited
// person is always kept symmetric, also through IK, presets and contacts
type SymmetryMode = 'off' | 'edit' | 'enforce';

const SYMMETRY_MODES: { mode: SymmetryMode; label: string; title: string }[] = [
  { mode: 'off', label: 'Off', title: 'Every side is edited on its own' },
  { mode: 'edit', label: '⟷ Edit', title: 'Edits to one side are applied to the other side as well' },
  { mode: 'enforce', label: '⟷ Always', title: 'The edited person is always kept symmetric, also through IK, presets and contacts' },
];

interface EditorState {
  pose: AcroPose;
  pins: Record<Role, Pins>;
  // Angles the solver must not change (the user still can)
  locks: Record<Role, FixedAngle[]>;
}

const NO_PINS: Record<Role, Pins> = { base: {}, flyer: {} };
const NO_LOCKS: Record<Role, FixedAngle[]> = { base: [], flyer: [] };

const DraftSchema = z.object({
  pose: z.unknown(),
  pins: z.object({ base: PinsSchema, flyer: PinsSchema }),
  locks: z.object({ base: z.array(FixedAngleSchema), flyer: z.array(FixedAngleSchema) }),
});

function loadDraft(): EditorState {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw) {
      const draft = DraftSchema.parse(JSON.parse(raw));
      return { pose: parseAcroPose(draft.pose), pins: draft.pins, locks: draft.locks };
    }
  } catch {
    // Storage unavailable or draft from an outdated format: start fresh
  }
  return { pose: initialAcroPose(), pins: NO_PINS, locks: NO_LOCKS };
}

function saveDraft({ pose, pins, locks }: EditorState): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ pose: serializeAcroPose(pose), pins, locks }));
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

// Per hand / foot pair, the pin on the `source` side and its mirror image relative to the body; a pin only
// on the other side is mirrored onto the source side
function mirroredPins(pose: HumanPose, pins: Pins, source: Side): Pins {
  const result: Pins = {};
  for (const effector of EFFECTORS.filter(e => BONES[e].side === source)) {
    const opposite = oppositeBone(effector) as Effector;
    const [from, to] = pins[effector] ? [effector, opposite] : [opposite, effector];
    if (!pins[from]) continue;
    result[from] = pins[from];
    result[to] = mirrorTarget(pose, pins[from]!);
  }
  return result;
}

// Symmetry wins over pins: both people are mirrored from one side (`source` for the edited person, the
// left for the other one) and so are their pins
const withEnforcedSymmetry = (state: EditorState, edited: Role, source: Side): EditorState => ROLES.reduce((s, role) => {
  const side = role === edited ? source : 'left';
  const pose = symmetrized(s.pose[role], side);
  return { ...s, pose: { ...s.pose, [role]: pose }, pins: { ...s.pins, [role]: mirroredPins(pose, s.pins[role], side) } };
}, state);

const withMirroredContacts = (contacts: Contact[]): Contact[] => contacts.flatMap((contact, i) =>
  (isOwnMirrorImage(contact) || mirrorPartner(contacts, i) >= 0 ? [contact] : [contact, mirrorContact(contact)]));

interface EditOptions {
  enforce: boolean;
  // Off while the solver is paused: pins and contacts are then not held
  solve: boolean;
}

const SOLVING: EditOptions = { enforce: false, solve: true };

// The edit is kept as far as the person's pins allow, the other person follows to keep the contacts.
// With `enforce`, the side the edit changed is mirrored onto the other side, overriding pins and contacts.
// `held` angles (what is being dragged right now) count as locked for this edit.
function withPerson(state: EditorState, role: Role, next: HumanPose, options: EditOptions = SOLVING, held: FixedAngle[] = []): EditorState {
  const holding = { ...state, locks: { ...state.locks, [role]: [...state.locks[role], ...held] } };
  return { ...solvedPerson(holding, role, next, options), locks: state.locks };
}

function solvedPerson(state: EditorState, role: Role, next: HumanPose, { enforce, solve }: EditOptions): EditorState {
  if (!solve) {
    const person = enforce ? symmetrized(next, editedSide(state.pose[role], next)) : next;
    return { ...state, pose: { ...state.pose, [role]: person } };
  }
  if (!enforce) {
    const pose = { ...state.pose, [role]: withPins(state.pose[role], next, state.pins[role], state.locks[role]) };
    return { ...state, pose: followContacts(state.pose, pose, role, state.pins, state.locks) };
  }
  const source = editedSide(state.pose[role], next);
  const sourcePins = Object.fromEntries(Object.entries(state.pins[role]).filter(([e]) => BONES[e as Effector].side === source));
  const solved = withPins(state.pose[role], symmetrized(next, source), sourcePins, state.locks[role]);
  return withFollowedSymmetrically(state, withEnforcedSymmetry({ ...state, pose: { ...state.pose, [role]: solved } }, role, source), role, source);
}

const withFollowedSymmetrically = (previous: EditorState, state: EditorState, role: Role, source: Side): EditorState =>
  withEnforcedSymmetry({ ...state, pose: followContacts(previous.pose, state.pose, role, state.pins, state.locks) }, role, source);

const updatingPerson = (role: Role, options: EditOptions, update: (pose: HumanPose) => HumanPose, held: FixedAngle[] = []) =>
  (state: EditorState): EditorState => withPerson(state, role, update(state.pose[role]), options, held);

function withLocked(state: EditorState, role: Role, added: FixedAngle[]): EditorState {
  const fresh = added.filter(a => !state.locks[role].some(l => l.key === a.key && l.name === a.name));
  return fresh.length ? { ...state, locks: { ...state.locks, [role]: [...state.locks[role], ...fresh] } } : state;
}

// The angles `names` of `key`, and of the opposite bone when editing symmetrically
const heldAngles = (key: BoneKey, names: string[], symmetric: boolean): FixedAngle[] => {
  const opposite = oppositeBone(key);
  return (symmetric && opposite ? [key, opposite] : [key]).flatMap(k => names.map(name => ({ key: k, name })));
};

const withAcroPose = (state: EditorState, pose: AcroPose, options: EditOptions): EditorState =>
  ROLES.reduce((s, role) => withPerson(s, role, pose[role], options), { ...state, pose: { ...state.pose, contacts: pose.contacts } });

// Brings what was edited while the solver was paused back onto pins and contacts, as one edit of `active`
// since `paused`
function withResumedSolver(state: EditorState, paused: AcroPose, active: Role, enforce: boolean): EditorState {
  const pinned = ROLES.reduce((pose, role) => ({ ...pose, [role]: withPins(paused[role], pose[role], state.pins[role], state.locks[role]) }), state.pose);
  const next = { ...state, pose: followContacts({ ...paused, contacts: state.pose.contacts }, pinned, active, state.pins, state.locks) };
  return enforce ? withEnforcedSymmetry(next, active, 'left') : next;
}

const effectorsFor = (effector: Effector, symmetric: boolean): Effector[] =>
  symmetric ? [effector, oppositeBone(effector) as Effector] : [effector];

// While dragged, the hand / foot turns with the limb; its orientation is re-pinned on release.
// In symmetric mode the opposite effector follows as mirror image, if it is pinned as well; when enforcing
// symmetry, the opposite limb and its pin always do.
function withMovedTarget(
  state: EditorState, role: Role, effector: Effector, position: IkTarget['position'], mode: SymmetryMode, solve: boolean,
): EditorState {
  const pins: Pins = { ...state.pins[role], [effector]: { position, quaternion: state.pins[role][effector]!.quaternion } };
  let pose = solveIk(state.pose[role], effector, pins[effector]!, { positionOnly: true });
  const opposite = oppositeBone(effector) as Effector;
  const allPins = { ...state.pins, [role]: pins };
  if (mode === 'enforce') {
    const side = BONES[effector].side!;
    const symmetric = withEnforcedSymmetry({ ...state, pose: { ...state.pose, [role]: pose }, pins: allPins }, role, side);
    return solve ? withFollowedSymmetrically(state, symmetric, role, side) : symmetric;
  }
  if (mode === 'edit' && pins[opposite]) {
    pins[opposite] = mirrorTarget(pose, pins[effector]!);
    pose = solveIk(pose, opposite, pins[opposite], { positionOnly: true });
  }
  const moved = { ...state.pose, [role]: pose };
  return { ...state, pose: solve ? followContacts(state.pose, moved, role, allPins, state.locks) : moved, pins: allPins };
}

function withReachedOrientations(state: EditorState, role: Role, effectors: Effector[]): EditorState {
  const pins = { ...state.pins[role] };
  effectors.forEach(e => {
    const pin = pins[e];
    if (pin) pins[e] = { ...pin, quaternion: readTarget(state.pose[role], e).quaternion };
  });
  return { ...state, pins: { ...state.pins, [role]: pins } };
}

// Moves `a`'s limb onto the contact by IK. A pin on that limb gives way, all other pins hold.
function withConnected(state: EditorState, contact: Contact): EditorState {
  const { role, site } = contact.a;
  const pins = { ...state.pins[role] };
  const freed = limbEffector(localSiteFrame(site).bone);
  if (freed) delete pins[freed];
  const moved = connect(state.pose, contact, false, state.locks[role]);
  return { ...state, pose: { ...state.pose, [role]: withPins(state.pose[role], moved, pins, state.locks[role]) }, pins: { ...state.pins, [role]: pins } };
}

// Moves `a`'s person as a whole; whatever the fit leaves open (e.g. for a symmetric pair) the other
// person's limbs close
function withFitted(state: EditorState, contacts: Contact[]): EditorState {
  const fitted = withPerson(state, contacts[0].a.role, fitRigidly(state.pose, contacts));
  return contacts.reduce(
    (s, c) => (movesLimb(c.b.site) && contactError(s.pose, c).millimetres > 1 ? withConnected(s, reversed(c)) : s),
    fitted,
  );
}

// `contacts` all move sites of the same kind on the same person, e.g. a contact and its mirror image
const withSolved = (state: EditorState, contacts: Contact[], rigid: boolean): EditorState =>
  (!rigid && movesLimb(contacts[0].a.site) ? contacts.reduce(withConnected, state) : withFitted(state, contacts));

// Solving a symmetric pair leaves small differences between the sides, which enforcement removes
const finished = (state: EditorState, role: Role, mode: SymmetryMode) =>
  (mode === 'enforce' ? withEnforcedSymmetry(state, role, 'left') : state);

function withNewContact(state: EditorState, contact: Contact, rigid: boolean, mode: SymmetryMode): EditorState {
  const added = mode !== 'off' && !isOwnMirrorImage(contact) ? [contact, mirrorContact(contact)] : [contact];
  const next = withSolved(state, added, rigid);
  return finished({ ...next, pose: { ...next.pose, contacts: [...state.pose.contacts, ...added] } }, contact.a.role, mode);
}

function withTwist(state: EditorState, index: number, twist: Twist, mode: SymmetryMode): EditorState {
  const contacts = [...state.pose.contacts];
  const partner = mode !== 'off' ? mirrorPartner(contacts, index) : -1;
  contacts[index] = { ...contacts[index], twist: normalizeTwist(twist) };
  if (partner >= 0) contacts[partner] = mirrorContact(contacts[index]);
  const changed = partner >= 0 ? [contacts[index], contacts[partner]] : [contacts[index]];
  return finished(withSolved({ ...state, pose: { ...state.pose, contacts } }, changed, false), contacts[index].a.role, mode);
}

function withoutContact(state: EditorState, index: number, symmetric: boolean): EditorState {
  const partner = symmetric ? mirrorPartner(state.pose.contacts, index) : -1;
  return { ...state, pose: { ...state.pose, contacts: state.pose.contacts.filter((_, i) => i !== index && i !== partner) } };
}

const isBroken = (error: ReturnType<typeof contactError>) =>
  error.millimetres > CONTACT_TOLERANCE.millimetres || error.degrees > CONTACT_TOLERANCE.degrees;

// One joint and one contact per line keeps the JSON short and diff-friendly

const markerMaterial = (color: number) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 });

// Markers keep their size in the scene until it would exceed this on screen (about their size from the
// default views), then shrink, so they don't cover the body when zoomed in
const MAX_MARKER_PIXELS_PER_METRE = 280;

// `keepLength` scales a line (along its Y) only in thickness
function addMarkerMesh(group: THREE.Group, geometry: THREE.BufferGeometry, color: number, keepLength = false): THREE.Mesh {
  const marker = new THREE.Mesh(geometry, markerMaterial(color));
  marker.renderOrder = 1;
  marker.onBeforeRender = (renderer, _, camera) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const distance = camera.position.distanceTo(marker.getWorldPosition(new THREE.Vector3()));
    const pixelsPerMetre = renderer.domElement.clientHeight / (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const scale = Math.min(1, MAX_MARKER_PIXELS_PER_METRE / pixelsPerMetre);
    marker.scale.set(scale, keepLength ? 1 : scale, scale);
    marker.updateMatrixWorld();
  };
  group.add(marker);
  return marker;
}

function addMarker(group: THREE.Group, position: THREE.Vector3, color: number, radius = 0.025): THREE.Mesh {
  const marker = addMarkerMesh(group, new THREE.SphereGeometry(radius, 12, 8), color);
  marker.position.copy(position);
  return marker;
}

const snapTwist = (twist: number) => normalizeDegrees(Math.round(twist / 90) * 90);

type Pick = { role: Role; hit: Hit } | null;

interface PoseEditor3DProps {
  isOpen: boolean;
  onClose: () => void;
  poses: Pose[];
  // Opened for this pose: its 3D data (or AI draft) is loaded and becomes what "Show before" compares with
  openPoseId: string | null;
}

export function PoseEditor3D({ isOpen, onClose, poses, openPoseId }: PoseEditor3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const humansRef = useRef<Record<Role, Human> | null>(null);
  const gizmoRef = useRef<TransformControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const proxyRef = useRef<THREE.Object3D | null>(null);
  const markersRef = useRef<THREE.Group | null>(null);

  const history = useHistory(loadDraft);
  const { pose: acroPose, pins: allPins } = history.state;
  const [active, setActive] = useState<Role>('base');
  const pose = acroPose[active];
  const pins = allPins[active];
  const locks = history.state.locks[active];
  const [selected, setSelected] = useState<BoneKey | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('rotate');
  const [symmetryMode, setSymmetryMode] = useState<SymmetryMode>('off');
  const symmetric = symmetryMode !== 'off';
  const enforce = symmetryMode === 'enforce';
  // The pose when the solver was paused, null while it runs
  const [pausedAt, setPausedAt] = useState<AcroPose | null>(null);
  const editOptions: EditOptions = { enforce, solve: pausedAt === null };
  // While connecting: null until the site to move is picked
  const [connecting, setConnecting] = useState<{ from: SiteRef | null } | null>(null);
  const [hovered, setHovered] = useState<SiteRef | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The pose the editor content is saved as
  const [poseId, setPoseId] = useLocalStorageState<string | null>('acroyoga-db:pose-editor-pose-id', null);
  const [stored, setStored] = useState<StoredPoses3d | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  // The pose as it was loaded or last saved
  const [original, setOriginal] = useState<AcroPose | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const shownPose = showBefore && original ? original : acroPose;

  const togglePin = (effector: Effector) => history.commit(state => {
    const rolePins = { ...state.pins[active] };
    const unpin = rolePins[effector] !== undefined;
    effectorsFor(effector, symmetric).forEach(e => {
      if (unpin) delete rolePins[e];
      else rolePins[e] = readTarget(state.pose[active], e);
    });
    return { ...state, pins: { ...state.pins, [active]: rolePins } };
  });

  const siteRefAt = ({ role, hit }: NonNullable<Pick>): SiteRef =>
    ({ role, site: siteAt(hit.key, hit.point.clone().applyMatrix4(worldMatrix(acroPose[role], hit.key).invert())) });

  const siteBone = ({ site }: SiteRef) => localSiteFrame(site).bone;

  const isLocked = (key: BoneKey, name: string) => locks.some(l => l.key === key && l.name === name);

  const toggleLock = (key: BoneKey, name: string) => history.commit(state => {
    const opposite = oppositeBone(key);
    const keys = symmetric && opposite ? [key, opposite] : [key];
    const others = state.locks[active].filter(l => !(keys.includes(l.key) && l.name === name));
    const added = isLocked(key, name) ? [] : keys.map(k => ({ key: k, name }));
    return { ...state, locks: { ...state.locks, [active]: [...others, ...added] } };
  });

  const handleHover = (pick: Pick) => {
    const next = pick && siteRefAt(pick);
    if (JSON.stringify(next) !== JSON.stringify(hovered)) setHovered(next);
  };

  const handlePick = (pick: Pick, rigid: boolean) => {
    if (!connecting) {
      if (pick) setActive(pick.role);
      setSelected(pick?.hit.key ?? null);
      return;
    }
    if (!pick) return;
    const picked = siteRefAt(pick);
    const from = connecting.from;
    // A second site on the same bone picks that one instead; on another part of the same person it makes a
    // contact within that person, moved by whichever of the two is on a limb
    if (!from || (from.role === picked.role && siteBone(from) === siteBone(picked))) {
      setConnecting({ from: picked });
      return;
    }
    const proposed: Contact = { a: from, b: picked, twist: snapTwist(currentTwist(acroPose, from, picked)) };
    const contact = from.role === picked.role ? ownContactMover(proposed) : proposed;
    if (!contact) return;
    setHovered(null);
    history.commit(state => withNewContact(state, contact, rigid && contact.a.role !== contact.b.role, symmetryMode));
    setConnecting(null);
  };

  // Three.js event handlers are registered once, so they read the current values from here
  const toggleSolver = () => {
    if (pausedAt === null) {
      setPausedAt(history.state.pose);
      return;
    }
    history.commit(state => withResumedSolver(state, pausedAt, active, enforce));
    setPausedAt(null);
  };

  const latest = useRef({ state: history.state, active, symmetryMode, history, selected, togglePin, handlePick, handleHover, connecting, editOptions, toggleSolver });
  latest.current = { state: history.state, active, symmetryMode, history, selected, togglePin, handlePick, handleHover, connecting, editOptions, toggleSolver };

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

    const humans = Object.fromEntries(ROLES.map(role => {
      const human = new Human(PALETTES[role]);
      human.apply(latest.current.state.pose[role]);
      scene.add(human.object);
      return [role, human];
    })) as Record<Role, Human>;
    humansRef.current = humans;

    const gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setSize(0.9);
    scene.add(gizmo.getHelper());
    gizmoRef.current = gizmo;

    gizmo.addEventListener('dragging-changed', event => {
      orbit.enabled = !event.value;
    });
    // Dragged by the gizmo to move a pinned hand / foot; the limb follows via IK
    const proxy = new THREE.Object3D();
    scene.add(proxy);
    proxyRef.current = proxy;

    const markers = new THREE.Group();
    scene.add(markers);
    markersRef.current = markers;

    const commitLive = (next: EditorState) => {
      // Snap the bones onto the clamped / solved angles right away, before React re-renders
      ROLES.forEach(role => humans[role].apply(next.pose[role]));
      latest.current.state = next;
      latest.current.history.replace(next);
    };

    gizmo.addEventListener('mouseDown', () => latest.current.history.checkpoint());
    gizmo.addEventListener('mouseUp', () => {
      const { state, active: role, selected: key, symmetryMode: mode } = latest.current;
      if (gizmo.object !== proxy || !key || !isEffector(key)) return;
      commitLive(withReachedOrientations(state, role, effectorsFor(key, mode !== 'off')));
    });
    gizmo.addEventListener('objectChange', () => {
      const { state, active: role, symmetryMode: mode, selected: key, editOptions: options } = latest.current;
      if (gizmo.object === proxy) {
        if (key && isEffector(key)) commitLive(withMovedTarget(state, role, key, proxy.position.toArray(), mode, options.solve));
        return;
      }
      const node = gizmo.object;
      const bone = Object.values(humans[role].bones).find(b => b.node === node);
      if (!bone) return;
      const person = state.pose[role];
      const next = gizmo.mode === 'translate'
        ? { ...person, position: node.position.toArray() as [number, number, number] }
        : withBoneAngles(person, bone.key, bone.anglesFromQuaternion(node.quaternion, person.angles[bone.key], parentAngles(person.angles, bone.key)), mode !== 'off');
      const held = gizmo.mode === 'translate' ? [] : heldAngles(bone.key, bone.angles.map(a => a.name), mode !== 'off');
      // Like a slider, a rotated bone stays locked against the solver afterwards
      commitLive(withLocked(withPerson(state, role, next, options, held), role, held));
    });

    // Click selects a bone (or picks a contact site), but not at the end of a camera orbit or gizmo drag
    const raycaster = new THREE.Raycaster();
    let pointerDown: { x: number; y: number; onGizmo: boolean } | null = null;
    const handlePointerDown = (e: PointerEvent) => {
      pointerDown = { x: e.clientX, y: e.clientY, onGizmo: gizmo.axis !== null };
    };
    const pickAt = (e: PointerEvent): Pick => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return ROLES
        .map(role => ({ role, hit: humans[role].pick(raycaster) }))
        .filter((p): p is { role: Role; hit: Hit } => p.hit !== null)
        .sort((a, b) => a.hit.distance - b.hit.distance)[0] ?? null;
    };
    const handlePointerUp = (e: PointerEvent) => {
      const down = pointerDown;
      pointerDown = null;
      if (!down || down.onGizmo || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      latest.current.handlePick(pickAt(e), e.shiftKey);
    };
    const handlePointerMove = (e: PointerEvent) => {
      if (latest.current.connecting && !pointerDown) latest.current.handleHover(pickAt(e));
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);

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
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      gizmo.detach();
      gizmo.dispose();
      disposeChildren(markers);
      orbit.dispose();
      ROLES.forEach(role => humans[role].dispose());
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      grid.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      humansRef.current = null;
      gizmoRef.current = null;
      proxyRef.current = null;
      markersRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    saveDraft(history.state);
    setShowBefore(false);
  }, [history.state]);

  useEffect(() => {
    ROLES.forEach(role => humansRef.current?.[role].apply(shownPose[role]));
  }, [shownPose]);

  // Pins as wireframe balls; contacts as a dot on the moved site, red on both sites with a line between them when broken
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    disposeChildren(markers);
    if (showBefore) return;
    for (const role of ROLES) {
      for (const target of Object.values(allPins[role])) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0xffd400, wireframe: true, depthTest: false }),
        );
        marker.renderOrder = 1;
        marker.position.set(...target.position);
        markers.add(marker);
      }
    }
    const positionOf = ({ role, site }: SiteRef) => new THREE.Vector3().setFromMatrixPosition(siteMatrix(acroPose[role], site));
    for (const contact of acroPose.contacts) {
      const broken = isBroken(contactError(acroPose, contact));
      const [a, b] = [positionOf(contact.a), positionOf(contact.b)];
      addMarker(markers, a, broken ? 0xff4040 : 0x40e070);
      if (!broken) continue;
      addMarker(markers, b, 0xff4040);
      // A cylinder, since WebGL draws lines only one pixel wide
      const line = addMarkerMesh(markers, new THREE.CylinderGeometry(0.007, 0.007, a.distanceTo(b), 8), 0xff4040, true);
      line.position.lerpVectors(a, b, 0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
    // While connecting, the named sites are offered as points to click; picks near one snap onto it
    if (connecting) {
      // Hidden by the body where they are on its far side
      ROLES.forEach(role => SITE_NAMES.forEach(site => {
        (addMarker(markers, positionOf({ role, site }), 0x9be7ff, 0.015).material as THREE.Material).depthTest = true;
      }));
    }
    if (connecting?.from) addMarker(markers, positionOf(connecting.from), 0x40d0ff, 0.03);
    if (connecting && hovered) addMarker(markers, positionOf(hovered), 0xffffff, 0.02);
  }, [acroPose, allPins, connecting, hovered, isOpen, showBefore]);

  const selectedPin = selected && isEffector(selected) ? pins[selected] : undefined;

  useEffect(() => {
    const humans = humansRef.current;
    const gizmo = gizmoRef.current;
    if (!humans || !gizmo) return;

    const opposite = selected && symmetric ? oppositeBone(selected) : null;
    ROLES.forEach(role => humans[role].setHighlighted(
      role === active ? [selected, opposite].filter((k): k is BoneKey => k !== null) : [],
    ));

    if (!selected || connecting) {
      gizmo.detach();
      return;
    }
    const bone = humans[active].bones[selected];
    const translate = gizmoMode === 'translate' && (selected === 'root' || selectedPin !== undefined);
    const proxy = proxyRef.current!;
    if (translate && selectedPin && !gizmo.dragging) proxy.position.set(...selectedPin.position);
    gizmo.attach(translate && selectedPin ? proxy : bone.node);
    gizmo.setMode(translate ? 'translate' : 'rotate');
    gizmo.setSpace(translate ? 'world' : 'local');
    const axes = bone.angles.filter(a => !(enforce && breaksSymmetry(bone.joint, a))).map(a => a.unitAxis);
    gizmo.showX = translate || axes.includes('x');
    gizmo.showY = translate || axes.includes('y');
    gizmo.showZ = translate || axes.includes('z');
  }, [selected, active, gizmoMode, symmetric, enforce, isOpen, selectedPin, connecting]);

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
        if (latest.current.connecting) setConnecting(null);
        else setSelected(null);
      } else if (e.key === 'w') {
        setGizmoMode('translate');
      } else if (e.key === 'e') {
        setGizmoMode('rotate');
      } else if (e.key === 's') {
        latest.current.toggleSolver();
      } else if (e.key === 'b') {
        setShowBefore(show => !show);
      } else if (e.key === 'c') {
        setConnecting(latest.current.connecting ? null : { from: null });
      } else if (e.key === 'p') {
        const key = latest.current.selected;
        if (key && isEffector(key)) latest.current.togglePin(key);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const refreshStored = () => fetchPoses3d().then(setStored, e => setStorageMessage(e.message));

  useEffect(() => {
    if (isOpen) refreshStored();
  }, [isOpen]);

  useEffect(() => {
    const pose = isOpen && poses.find(p => p.id === openPoseId);
    if (!pose) return;
    setPoseId(pose.id);
    loadPose3d(pose).then(loaded => {
      if (!loaded) {
        setOriginal(null);
        setStorageMessage('No 3D data for this pose yet: build it here and save it');
        return;
      }
      load(loaded.pose);
      setStorageMessage(loaded.isDraft ? 'AI draft loaded, saving approves it' : null);
    }, e => setStorageMessage(e.message));
  }, [isOpen, openPoseId]);

  if (!isOpen) return null;

  const setView = (position: [number, number, number]) => {
    cameraRef.current?.position.set(...position);
    orbitRef.current?.target.copy(CAMERA_TARGET);
  };

  const grounded = (p: HumanPose, ignored: BoneKey[] = []): HumanPose => {
    const human = humansRef.current?.[active];
    return human ? { ...p, position: [p.position[0], human.groundedRootHeight(p, ignored), p.position[2]] } : p;
  };

  const applyPreset = (group: PresetGroup, preset: PresetGroup['presets'][number]) => history.commit(updatingPerson(active, editOptions, p => {
    let next = withJoints(p, preset.joints);
    if (!group.grounded) return next;
    const planted = preset.planted ?? [];
    next = grounded(next, planted.flatMap(e => limbChain(e)));
    return planted.reduce((pose, effector) => solveIk(pose, effector, floorTarget(pose, effector)), next);
  }));

  // Switching to enforcement makes both people, their pins and the contacts symmetric right away: the
  // selected side wins, otherwise the left
  const changeSymmetryMode = (mode: SymmetryMode) => {
    setSymmetryMode(mode);
    if (mode !== 'enforce') return;
    const source = (selected && BONES[selected].side) || 'left';
    history.commit(state =>
      withEnforcedSymmetry({ ...state, pose: { ...state.pose, contacts: withMirroredContacts(state.pose.contacts) } }, active, source));
  };

  const resetBone = (key: BoneKey) => history.commit(updatingPerson(active, editOptions, p =>
    withBoneAngles(p, key, Object.fromEntries(Object.keys(p.angles[key]).map(name => [name, 0])), symmetric),
  ));

  const json = formatStoredAcroPose(serializeAcroPose(acroPose));

  const copyJson = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const saved = poseId ? stored?.saved[poseId] : undefined;
  const draft = poseId ? stored?.drafts[poseId] : undefined;

  const load = (loaded: AcroPose) => {
    history.commit(() => ({ pose: loaded, pins: NO_PINS, locks: NO_LOCKS }));
    setOriginal(loaded);
    setStorageMessage(null);
  };

  const loadStored = (data: unknown) => {
    try {
      load(parseAcroPose(data));
    } catch (e) {
      setStorageMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const runStorage = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      setStorageMessage(done);
      await refreshStored();
    } catch (e) {
      setStorageMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const applyImport = () => {
    try {
      const imported = parseAcroPose(JSON.parse(importText ?? ''));
      history.commit(state => withAcroPose(state, imported, editOptions));
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
          {original && (
            <button
              onClick={() => setShowBefore(!showBefore)}
              className={`ml-2 px-2 py-1 rounded text-xs ${showBefore ? 'bg-yellow-500 text-black' : 'bg-gray-800/80 text-gray-200 hover:bg-gray-700'}`}
              title="Show the pose as it was loaded or last saved (B); any edit switches back"
            >
              Show before (B)
            </button>
          )}
        </div>
        {showBefore && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-yellow-500/90 text-black text-sm pointer-events-none">
            Showing the pose as loaded / last saved
          </div>
        )}
        {pausedAt && !connecting && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-yellow-500/90 text-black text-sm pointer-events-none">
            Solver paused: pins and contacts are not held until you resume (S)
          </div>
        )}
        {connecting && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-cyan-700/90 text-white text-sm pointer-events-none">
            {connecting.from
              ? `Move ${ROLE_LABELS[connecting.from.role].toLowerCase()} ${siteLabel(connecting.from.site)} to… (click the other person, ⇧ moves the whole person; or another part of the same person)`
              : 'Click the part to move'}
            {hovered && <span className="ml-2 text-cyan-200">· {ROLE_LABELS[hovered.role]} {siteLabel(hovered.site)}</span>}
          </div>
        )}
        <div className="absolute bottom-3 left-3 text-xs text-gray-400 pointer-events-none">
          Click a body part to select · E rotate / W move · P pin hand or foot · C connect · S pause solver · Esc cancels · ⌘Z / ⇧⌘Z undo/redo
        </div>
      </div>

      <div className="w-96 shrink-0 bg-gray-900 text-white p-4 overflow-y-auto space-y-5">
        <div className="flex justify-between items-center gap-2">
          <h2 className="text-lg font-bold whitespace-nowrap">3D Pose Editor</h2>
          <div className="flex gap-1">
            <ToolbarButton
              onClick={toggleSolver}
              className={pausedAt ? 'bg-yellow-500 text-black hover:bg-yellow-400' : undefined}
              title="Pause (S) to edit several parts without IK and contacts pulling them; resuming solves pins and contacts once"
            >
              {pausedAt ? '▶ Resume' : '⏸ Pause'}
            </ToolbarButton>
            <ToolbarButton onClick={history.undo} disabled={!history.canUndo} title="Undo (⌘Z)">Undo</ToolbarButton>
            <ToolbarButton onClick={history.redo} disabled={!history.canRedo} title="Redo (⇧⌘Z)">Redo</ToolbarButton>
            <ToolbarButton onClick={onClose} className="bg-red-600 hover:bg-red-700" title="Close">✕</ToolbarButton>
          </div>
        </div>

        <section className="space-y-2">
          <select
            value={poseId ?? ''}
            onChange={e => { setPoseId(e.target.value || null); setStorageMessage(null); }}
            className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm"
            title="The pose this is saved as; choosing one does not load it"
          >
            <option value="">Save as pose…</option>
            {[...poses].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)).map(p => (
              <option key={p.id} value={p.id}>
                {p.name ?? p.id}{stored?.saved[p.id] ? ' ✓' : ''}{stored?.drafts[p.id] ? ' · AI draft' : ''}
              </option>
            ))}
          </select>
          {poseId && (
            <div className="flex flex-wrap gap-1">
              {saved !== undefined && <ToolbarButton onClick={() => loadStored(saved)}>Load saved</ToolbarButton>}
              {draft !== undefined && (
                <>
                  <ToolbarButton onClick={() => loadStored(draft)} className="bg-cyan-700 hover:bg-cyan-600">Load AI draft</ToolbarButton>
                  <ToolbarButton onClick={() => runStorage(() => deleteDraft3d(poseId), 'Draft discarded')}>Discard draft</ToolbarButton>
                </>
              )}
              <ToolbarButton
                onClick={() => runStorage(async () => { await savePose3d(poseId, json); setOriginal(acroPose); }, 'Saved')}
                className="bg-green-700 hover:bg-green-600"
                title="Saves what the editor shows as this pose's 3D data; an AI draft of it is removed"
              >
                💾 Save
              </ToolbarButton>
            </div>
          )}
          {storageMessage && <p className="text-xs text-gray-400 whitespace-pre-wrap">{storageMessage}</p>}
        </section>

        <section>
          <div className="flex justify-between items-center mb-2">
            <div className="flex gap-1">
              {ROLES.map(role => (
                <ToolbarButton key={role} onClick={() => setActive(role)} className={role === active ? 'bg-blue-600 hover:bg-blue-500' : undefined}>
                  {ROLE_LABELS[role]}
                </ToolbarButton>
              ))}
            </div>
            <div className="flex gap-px">
              {SYMMETRY_MODES.map(({ mode, label, title }) => (
                <ToolbarButton
                  key={mode}
                  onClick={() => changeSymmetryMode(mode)}
                  className={symmetryMode === mode ? (mode === 'off' ? 'bg-gray-500' : 'bg-yellow-500 text-black hover:bg-yellow-400') : undefined}
                  title={title}
                >
                  {label}
                </ToolbarButton>
              ))}
            </div>
          </div>
          <BodyMap role={active} selected={selected} pins={pins} locks={locks} onSelect={key => setSelected(selected === key ? null : key)} />
        </section>

        {selected && (
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">
                {ROLE_LABELS[active]}: {boneLabel(BONES[selected].joint, BONES[selected].side).toLowerCase()}{symmetric && oppositeBone(selected) ? ' (both sides)' : ''}
              </h3>
              <div className="flex gap-1">
                {isEffector(selected) && (
                  <ToolbarButton
                    onClick={() => togglePin(selected)}
                    className={selectedPin ? 'bg-yellow-500 text-black hover:bg-yellow-400' : undefined}
                    title="Pin in place (P): moving it or the rest of the body then solves this limb with IK"
                  >
                    📌 {selectedPin ? 'Pinned' : 'Pin'}
                  </ToolbarButton>
                )}
                <ToolbarButton onClick={() => resetBone(selected)}>Reset</ToolbarButton>
              </div>
            </div>
            {(selected === 'root' || selectedPin) && <GizmoModeToggle mode={gizmoMode} onChange={setGizmoMode} />}
            {selected === 'root' && (
              <RootControls
                pose={pose}
                onBeginEdit={history.checkpoint}
                onChange={update => history.replace(updatingPerson(active, editOptions, update))}
                onGround={() => history.commit(updatingPerson(active, editOptions, grounded))}
              />
            )}
            {JOINTS[BONES[selected].joint].angles.map(angle => (
              <AngleRow
                key={angle.name}
                angle={angle}
                disabled={enforce && breaksSymmetry(BONES[selected].joint, angle)}
                locked={isLocked(selected, angle.name)}
                onToggleLock={() => toggleLock(selected, angle.name)}
                value={pose.angles[selected][angle.name]}
                onBeginEdit={history.checkpoint}
                onChange={value => {
                  // An angle set by hand stays locked against the solver afterwards
                  const held = heldAngles(selected, [angle.name], symmetric);
                  history.replace(state => withLocked(
                    updatingPerson(active, editOptions, p => withBoneAngles(p, selected, { [angle.name]: value }, symmetric), held)(state),
                    active,
                    held,
                  ));
                }}
              />
            ))}
          </section>
        )}

        <section className="space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-300">Contacts</h3>
            <ToolbarButton
              onClick={() => setConnecting(connecting ? null : { from: null })}
              className={connecting ? 'bg-cyan-600 hover:bg-cyan-500' : undefined}
              title="Click the part to move, then where it goes: a hand / foot / limb gets there by IK, a torso site (or with ⇧) moves the whole person"
            >
              🔗 Connect (C)
            </ToolbarButton>
          </div>
          {acroPose.contacts.length === 0 && <p className="text-xs text-gray-500">No contacts yet</p>}
          {acroPose.contacts.map((contact, index) => (
            <ContactRow
              key={index}
              contact={contact}
              error={contactError(acroPose, contact)}
              onBeginEdit={history.checkpoint}
              onTwist={(twist, live) => (live ? history.replace : history.commit)(state => withTwist(state, index, twist, symmetryMode))}
              onRemove={() => history.commit(state => withoutContact(state, index, symmetric))}
            />
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-300">Presets for the {ROLE_LABELS[active].toLowerCase()}</h3>
          {PRESET_GROUPS.map(group => (
            <div key={group.name} className="flex flex-wrap gap-1 items-center">
              <span className="text-xs text-gray-500 w-12">{group.name}</span>
              {group.presets.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(group, preset)}
                  className="px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ))}
        </section>

        <section className="flex flex-wrap gap-2">
          <ToolbarButton onClick={() => history.commit(state => withAcroPose(state, mirrorAcroPose(state.pose), editOptions))} title="Swap left and right of both people and the contacts">
            ⟷ Mirror
          </ToolbarButton>
          <ToolbarButton onClick={() => history.commit(updatingPerson(active, editOptions, grounded))} title="Move vertically so the lowest point touches the floor">⤓ Drop to floor</ToolbarButton>
          <ToolbarButton onClick={() => history.commit({ pose: initialAcroPose(), pins: NO_PINS, locks: NO_LOCKS })}>Reset all</ToolbarButton>
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

const TWIST_PRESETS: Twist[] = [0, 90, 180, -90, 'free'];

interface ContactRowProps {
  contact: Contact;
  error: ReturnType<typeof contactError>;
  onBeginEdit: () => void;
  onTwist: (twist: Twist, live: boolean) => void;
  onRemove: () => void;
}

function ContactRow({ contact: { a, b, twist }, error, onBeginEdit, onTwist, onRemove }: ContactRowProps) {
  const broken = isBroken(error);
  return (
    <div className="bg-gray-800 rounded p-2 space-y-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${broken ? 'bg-red-500' : 'bg-green-500'}`}
          title={`${error.millimetres.toFixed(0)} mm, ${error.degrees.toFixed(0)}° off`}
        />
        <span className="flex-1">
          {ROLE_LABELS[a.role]} {siteLabel(a.site)} → {ROLE_LABELS[b.role]} {siteLabel(b.site)}
        </span>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-400" title="Remove contact">✕</button>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-400 mr-1">twist</span>
        {TWIST_PRESETS.map(preset => (
          <button
            key={preset}
            onClick={() => onTwist(preset, false)}
            className={`px-1.5 py-0.5 rounded ${twist === preset ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            {preset === 'free' ? 'free' : `${preset}°`}
          </button>
        ))}
        <input
          type="number"
          step={5}
          value={twist === 'free' ? '' : twist}
          placeholder="any"
          onFocus={onBeginEdit}
          onChange={e => { const value = parseFloat(e.target.value); if (!Number.isNaN(value)) onTwist(value, true); }}
          className="w-14 ml-auto bg-gray-900 rounded px-1 text-right"
        />
        °
      </div>
      {broken && <p className="text-red-400">Out of reach: {error.millimetres.toFixed(0)} mm, {error.degrees.toFixed(0)}° off</p>}
    </div>
  );
}

function ToolbarButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-2 py-1 rounded text-sm whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${className ?? 'bg-gray-700 hover:bg-gray-600'}`}
    />
  );
}

interface BodyMapProps {
  role: Role;
  selected: BoneKey | null;
  pins: Pins;
  locks: FixedAngle[];
  onSelect: (key: BoneKey) => void;
}

// Laid out as seen from the front: the person's right side is on the left
function BodyMap({ role, selected, pins, locks, onSelect }: BodyMapProps) {
  const palette = PALETTES[role];
  const cell = (joint: JointId, side: Side | null) => {
    const key = boneKey(joint, side);
    return (
      <button
        key={key}
        onClick={() => onSelect(key)}
        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left ${selected === key ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `#${palette[side ?? 'shirt'].getHexString()}` }} />
        {JOINTS[joint].label}
        <span className="ml-auto">
          {locks.some(l => l.key === key) && '🔒'}
          {isEffector(key) && pins[key] && '📌'}
        </span>
      </button>
    );
  };
  const center = (joint: JointId) => <div className="col-span-2 grid px-12">{cell(joint, null)}</div>;
  const pairs = (joints: JointId[]) => joints.flatMap(joint => [cell(joint, 'right'), cell(joint, 'left')]);

  return (
    <div className="grid grid-cols-2 gap-1">
      {center('neck')}
      <div className="text-[10px] text-gray-500 text-center">Right</div>
      <div className="text-[10px] text-gray-500 text-center">Left</div>
      {pairs(['clavicle', 'shoulder', 'elbow', 'wrist'])}
      {center('chest')}
      {center('waist')}
      {center('root')}
      {pairs(['hip', 'knee', 'ankle'])}
    </div>
  );
}

interface AngleRowProps {
  angle: AngleDef;
  value: number;
  disabled: boolean;
  locked: boolean;
  onToggleLock: () => void;
  onBeginEdit: () => void;
  onChange: (value: number) => void;
}

function AngleRow({ angle, value, disabled, locked, onToggleLock, onBeginEdit, onChange }: AngleRowProps) {
  const handleChange = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) onChange(parsed);
  };
  return (
    <div className={disabled ? 'opacity-40' : undefined} title={disabled ? 'Not available while symmetry is always enforced' : undefined}>
      <div className="flex justify-between items-center text-sm mb-1">
        <span className="flex items-center gap-1">
          <button
            onClick={onToggleLock}
            disabled={disabled}
            className={locked ? '' : 'opacity-30 hover:opacity-70'}
            title={locked ? 'Locked: IK and contacts leave this angle alone (you can still change it)' : 'Lock this angle against IK and contacts'}
          >
            {locked ? '🔒' : '🔓'}
          </button>
          {angle.name}
        </span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            step={1}
            min={angle.min}
            max={angle.max}
            value={Math.round(value * 10) / 10}
            disabled={disabled}
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
        disabled={disabled}
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

function disposeChildren(group: THREE.Group): void {
  group.children.forEach(child => {
    const mesh = child as THREE.Mesh;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
  group.clear();
}

function GizmoModeToggle({ mode, onChange }: { mode: GizmoMode; onChange: (mode: GizmoMode) => void }) {
  return (
    <div className="flex gap-1">
      {(['rotate', 'translate'] as const).map(m => (
        <ToolbarButton key={m} onClick={() => onChange(m)} className={mode === m ? 'bg-green-600 hover:bg-green-500 flex-1' : 'bg-gray-700 hover:bg-gray-600 flex-1'}>
          {m === 'rotate' ? 'Rotate gizmo (E)' : 'Move gizmo (W)'}
        </ToolbarButton>
      ))}
    </div>
  );
}

interface RootControlsProps {
  pose: HumanPose;
  onBeginEdit: () => void;
  onChange: (update: (pose: HumanPose) => HumanPose) => void;
  onGround: () => void;
}

function RootControls({ pose, onBeginEdit, onChange, onGround }: RootControlsProps) {
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
