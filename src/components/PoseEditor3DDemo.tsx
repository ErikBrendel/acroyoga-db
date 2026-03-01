import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Bone, BoneConfig } from '../3d/Bone';

interface Preset {
  name: string;
  angles: {
    bone: 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot' | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot' | 'rightUpperArm' | 'rightLowerArm' | 'rightHand' | 'leftUpperArm' | 'leftLowerArm' | 'leftHand';
    angleName: string;
    value: number;
  }[];
}

const PRESETS: Preset[] = [
  {
    name: 'Straight',
    angles: [
      { bone: 'rightUpperLeg', angleName: 'pike', value: 0 },
      { bone: 'rightUpperLeg', angleName: 'straddle', value: 0 },
      { bone: 'rightLowerLeg', angleName: 'bend', value: 0 },
      { bone: 'leftUpperLeg', angleName: 'pike', value: 0 },
      { bone: 'leftUpperLeg', angleName: 'straddle', value: 0 },
      { bone: 'leftLowerLeg', angleName: 'bend', value: 0 },
    ],
  },
  {
    name: 'Straddle',
    angles: [
      { bone: 'rightUpperLeg', angleName: 'straddle', value: 60 },
      { bone: 'leftUpperLeg', angleName: 'straddle', value: 60 },
    ],
  },
  {
    name: 'Pike',
    angles: [
      { bone: 'rightUpperLeg', angleName: 'pike', value: 90 },
      { bone: 'leftUpperLeg', angleName: 'pike', value: 90 },
    ],
  },
  {
    name: 'Straddle-Pike',
    angles: [
      { bone: 'rightUpperLeg', angleName: 'pike', value: 80 },
      { bone: 'rightUpperLeg', angleName: 'straddle', value: 50 },
      { bone: 'leftUpperLeg', angleName: 'pike', value: 80 },
      { bone: 'leftUpperLeg', angleName: 'straddle', value: 50 },
    ],
  },
  {
    name: 'Tuck',
    angles: [
      { bone: 'rightUpperLeg', angleName: 'pike', value: 100 },
      { bone: 'rightLowerLeg', angleName: 'bend', value: 130 },
      { bone: 'leftUpperLeg', angleName: 'pike', value: 100 },
      { bone: 'leftLowerLeg', angleName: 'bend', value: 130 },
    ],
  },
  {
    name: 'Point',
    angles: [
      { bone: 'rightFoot', angleName: 'flex', value: 10 },
      { bone: 'leftFoot', angleName: 'flex', value: 10 },
    ],
  },
  {
    name: 'Flex',
    angles: [
      { bone: 'rightFoot', angleName: 'flex', value: 130 },
      { bone: 'leftFoot', angleName: 'flex', value: 130 },
    ],
  },
  {
    name: 'Relaxed Arms',
    angles: [
      { bone: 'rightUpperArm', angleName: 'raise', value: -40 },
      { bone: 'rightUpperArm', angleName: 'forward', value: 25 },
      { bone: 'rightLowerArm', angleName: 'bend', value: 35 },
      { bone: 'rightHand', angleName: 'stretch', value: -20 },
      { bone: 'leftUpperArm', angleName: 'raise', value: -40 },
      { bone: 'leftUpperArm', angleName: 'forward', value: 25 },
      { bone: 'leftLowerArm', angleName: 'bend', value: 35 },
      { bone: 'leftHand', angleName: 'stretch', value: -20 },
    ],
  },
];

// Right hand:  +X local = world +Y = dorsal (up in T-pose), -X = palm
// Left hand: +X local = world -Y = palm (down in T-pose), -X = dorsal
// Both hands: +Z local = world +Z = thumb side (toward viewer in T-pose)
function buildHandMesh(bone: Bone, color: number, isRight: boolean): void {
  const palmColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.6);
  const dorsalMat = new THREE.MeshStandardMaterial({ color });
  const palmMat = new THREE.MeshStandardMaterial({ color: palmColor });
  const edgeMat = new THREE.MeshStandardMaterial({ color });

  const wristSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 12, 12),
    new THREE.MeshStandardMaterial({ color }),
  );
  wristSphere.castShadow = true;
  bone.mesh.add(wristSphere);

  const faceMaterials = isRight
    ? [dorsalMat, palmMat, edgeMat, edgeMat, edgeMat, edgeMat]
    : [palmMat, dorsalMat, edgeMat, edgeMat, edgeMat, edgeMat];
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.15, 0.08), faceMaterials);
  palm.position.y = 0.075;
  palm.castShadow = true;
  bone.mesh.add(palm);

  const thumb = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.015, 0.05, 4, 8),
    new THREE.MeshStandardMaterial({ color }),
  );
  thumb.position.set(0, 0.03, 0.052);
  thumb.rotation.x = Math.PI / 5;
  thumb.castShadow = true;
  bone.mesh.add(thumb);
}

function buildHeadMesh(bone: Bone): void {
  const skin = new THREE.MeshStandardMaterial({ color: 0xf5cba7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1f1a });

  // Neck joint
  const neck = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), skin);
  neck.castShadow = true;
  bone.mesh.add(neck);

  // Skull
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.22, 0.17), skin);
  skull.position.y = 0.13;
  skull.castShadow = true;
  bone.mesh.add(skull);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.026, 12, 12);
  for (const x of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.position.set(x, 0.16, 0.086);
    bone.mesh.add(eye);
  }

  // Nose: 3-segment cone (triangle) pointing forward
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.03, 3), skin);
  nose.position.set(0, 0.115, 0.09);
  nose.rotation.x = Math.PI / 2;
  bone.mesh.add(nose);

  // Smile: tube along a downward arc
  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.042, 0.068, 0.087),
    new THREE.Vector3(-0.02,  0.052, 0.091),
    new THREE.Vector3(0,      0.047, 0.092),
    new THREE.Vector3(0.02,   0.052, 0.091),
    new THREE.Vector3(0.042,  0.068, 0.087),
  ]);
  const smile = new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 12, 0.006, 6, false), dark);
  bone.mesh.add(smile);
}

const MIRROR_BONE_NAMES: Partial<Record<string, string>> = {
  rightUpperLeg: 'leftUpperLeg', leftUpperLeg: 'rightUpperLeg',
  rightLowerLeg: 'leftLowerLeg', leftLowerLeg: 'rightLowerLeg',
  rightFoot:     'leftFoot',     leftFoot:     'rightFoot',
  rightUpperArm: 'leftUpperArm', leftUpperArm: 'rightUpperArm',
  rightLowerArm: 'leftLowerArm', leftLowerArm: 'rightLowerArm',
  rightHand:     'leftHand',     leftHand:     'rightHand',
};

export function PoseEditor3DDemo({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bones, setBones] = useState<{
    hip: Bone;
    head: Bone;
    rightUpperLeg: Bone;
    rightLowerLeg: Bone;
    rightFoot: Bone;
    leftUpperLeg: Bone;
    leftLowerLeg: Bone;
    leftFoot: Bone;
    rightUpperArm: Bone;
    rightLowerArm: Bone;
    rightHand: Bone;
    leftUpperArm: Bone;
    leftLowerArm: Bone;
    leftHand: Bone;
  } | null>(null);
  const [selectedBone, setSelectedBone] = useState<'hip' | 'head' | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot' | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot' | 'rightUpperArm' | 'rightLowerArm' | 'rightHand' | 'leftUpperArm' | 'leftLowerArm' | 'leftHand' | null>(null);
  const [hipMode, setHipMode] = useState<'translate' | 'rotate'>('translate');
  const [symmetricMode, setSymmetricModeState] = useState(false);
  const symmetricModeRef = useRef(false);
  const [, setUpdateTrigger] = useState(0);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const previousEulerRef = useRef<THREE.Euler>(new THREE.Euler());

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(2, 1.5, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    orbitControlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -5;
    directionalLight.shadow.camera.right = 5;
    directionalLight.shadow.camera.top = 5;
    directionalLight.shadow.camera.bottom = -5;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Ground plane with shadow
    const planeGeometry = new THREE.PlaneGeometry(10, 10);
    const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    plane.receiveShadow = true;
    scene.add(plane);

    // Grid
    const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0x444444);
    gridHelper.position.y = 0.01; // Slightly above ground to prevent z-fighting
    scene.add(gridHelper);

    // Axes helper (red=X, green=Y, blue=Z)
    const axesHelper = new THREE.AxesHelper(1);
    scene.add(axesHelper);

    // Create leg skeleton: Hip (root) → Upper Leg → Lower Leg → Foot
    const hipConfig: BoneConfig = {
      name: 'hip',
      length: 0,
      angles: [],
    };

    const rightUpperLegConfig: BoneConfig = {
      name: 'right-upper-leg',
      length: 0.43, // ~43cm upper leg
      baseRotation: new THREE.Euler(0, 0, Math.PI), // Rotate 180° around Z to point downward
      angles: [
        { name: 'pike', value: 0, min: -10, max: 130, axis: 'x' },
        { name: 'straddle', value: 0, min: -30, max: 120, axis: '-z' },
        { name: 'rotate', value: 0, min: -90, max: 90, axis: '-y' },
      ],
    };

    const leftUpperLegConfig: BoneConfig = {
      name: 'left-upper-leg',
      length: 0.43, // ~43cm upper leg
      baseRotation: new THREE.Euler(0, 0, Math.PI), // Rotate 180° around Z to point downward
      angles: [
        { name: 'pike', value: 0, min: -10, max: 130, axis: 'x' },
        { name: 'straddle', value: 0, min: -30, max: 120, axis: 'z' }, // Inverted for left leg
        { name: 'rotate', value: 0, min: -90, max: 90, axis: 'y' },
      ],
    };

    const lowerLegConfig: BoneConfig = {
      name: 'lower-leg',
      length: 0.43, // ~43cm lower leg
      angles: [
        { name: 'bend', value: 0, min: 0, max: 150, axis: '-x' },
      ],
    };

    const rightFootConfig: BoneConfig = {
      name: 'foot',
      length: 0.25,
      angles: [
        { name: 'flex', value: 90, min: 5, max: 140, axis: 'x'  },
        { name: 'tilt', value: 0,  min: -20, max: 20, axis: '-z' },
      ],
    };

    const leftFootConfig: BoneConfig = {
      name: 'foot',
      length: 0.25,
      angles: [
        { name: 'flex', value: 90, min: 5, max: 140, axis: 'x' },
        { name: 'tilt', value: 0,  min: -20, max: 20, axis: 'z' },
      ],
    };

    // Right upper arm: base rotation points bone to the right (-X)
    const rightUpperArmConfig: BoneConfig = {
      name: 'right-upper-arm',
      length: 0.33,
      baseRotation: new THREE.Euler(0, 0, Math.PI / 2), // +Y → -X (right)
      angles: [
        { name: 'forward', value: 0, min: -60, max: 170, axis: 'x' },
        { name: 'raise', value: 0, min: -90, max: 90, axis: '-z' },
        { name: 'rotate', value: 0, min: -90, max: 90, axis: '-y' },
      ],
    };

    // Left upper arm: base rotation points bone to the left (+X)
    const leftUpperArmConfig: BoneConfig = {
      name: 'left-upper-arm',
      length: 0.33,
      baseRotation: new THREE.Euler(0, 0, -Math.PI / 2), // +Y → +X (left)
      angles: [
        { name: 'forward', value: 0, min: -60, max: 170, axis: 'x' },
        { name: 'raise', value: 0, min: -90, max: 90, axis: 'z' },
        { name: 'rotate', value: 0, min: -90, max: 90, axis: 'y' },
      ],
    };

    const rightLowerArmConfig: BoneConfig = {
      name: 'lower-arm',
      length: 0.28,
      angles: [
        { name: 'bend',   value: 0, min: 0,   max: 150, axis: 'x'  },
        { name: 'rotate', value: 0, min: -90, max: 90,  axis: '-y' },
      ],
    };

    const leftLowerArmConfig: BoneConfig = {
      name: 'lower-arm',
      length: 0.28,
      angles: [
        { name: 'bend',   value: 0, min: 0,   max: 150, axis: 'x' },
        { name: 'rotate', value: 0, min: -90, max: 90,  axis: 'y' },
      ],
    };

    const rightHandConfig: BoneConfig = {
      name: 'hand',
      length: 0.18,
      angles: [
        { name: 'stretch', value: 0, min: -85, max: 100, axis: '-z' },
        { name: 'tilt', value: 0, min: -20, max: 20, axis: 'x' },
      ],
    };

    const leftHandConfig: BoneConfig = {
      name: 'hand',
      length: 0.18,
      angles: [
        { name: 'stretch', value: 0, min: -85, max: 100, axis: 'z' },
        { name: 'tilt', value: 0, min: -20, max: 20, axis: 'x' },
      ],
    };

    const hipWidth = 0.15; // ~15cm offset from center for each leg
    const shoulderWidth = 0.2; // ~20cm offset from center for each shoulder
    const shoulderHeight = 0.5; // ~50cm torso height above hip

    const hip = new Bone(hipConfig, new THREE.Vector3(0, 1, 0));

    // Right leg
    const rightUpperLeg = new Bone(rightUpperLegConfig, new THREE.Vector3(-hipWidth, -0.1, 0));
    const rightLowerLeg = new Bone(lowerLegConfig, new THREE.Vector3(0, rightUpperLegConfig.length, 0));
    const rightFoot = new Bone(rightFootConfig, new THREE.Vector3(0, lowerLegConfig.length, 0));

    // Left leg
    const leftUpperLeg = new Bone(leftUpperLegConfig, new THREE.Vector3(hipWidth, -0.1, 0));
    const leftLowerLeg = new Bone(lowerLegConfig, new THREE.Vector3(0, leftUpperLegConfig.length, 0));
    const leftFoot = new Bone(leftFootConfig, new THREE.Vector3(0, lowerLegConfig.length, 0));

    // Right arm
    const rightUpperArm = new Bone(rightUpperArmConfig, new THREE.Vector3(-shoulderWidth, shoulderHeight, 0));
    const rightLowerArm = new Bone(rightLowerArmConfig, new THREE.Vector3(0, rightUpperArmConfig.length, 0));
    const rightHand = new Bone(rightHandConfig, new THREE.Vector3(0, rightLowerArmConfig.length, 0));

    // Left arm
    const leftUpperArm = new Bone(leftUpperArmConfig, new THREE.Vector3(shoulderWidth, shoulderHeight, 0));
    const leftLowerArm = new Bone(leftLowerArmConfig, new THREE.Vector3(0, leftUpperArmConfig.length, 0));
    const leftHand = new Bone(leftHandConfig, new THREE.Vector3(0, leftLowerArmConfig.length, 0));

    // Build hierarchy
    hip.addChild(rightUpperLeg);
    rightUpperLeg.addChild(rightLowerLeg);
    rightLowerLeg.addChild(rightFoot);

    hip.addChild(leftUpperLeg);
    leftUpperLeg.addChild(leftLowerLeg);
    leftLowerLeg.addChild(leftFoot);

    hip.addChild(rightUpperArm);
    rightUpperArm.addChild(rightLowerArm);
    rightLowerArm.addChild(rightHand);

    hip.addChild(leftUpperArm);
    leftUpperArm.addChild(leftLowerArm);
    leftLowerArm.addChild(leftHand);

    const headConfig: BoneConfig = {
      name: 'head',
      length: 0.25,
      angles: [
        { name: 'side', value: 0, min: -70, max: 70, axis: 'y'  },
        { name: 'up',   value: 0, min: -60, max: 60, axis: '-x' },
        { name: 'tilt', value: 0, min: -30, max: 30, axis: 'z'  },
      ],
    };
    const head = new Bone(headConfig, new THREE.Vector3(0, shoulderHeight + 0.12, 0));
    hip.addChild(head);

    // Create visuals
    hip.createVisuals(0xff0000); // red - hip
    rightUpperLeg.createVisuals(0x00ff00); // green - right upper leg
    rightLowerLeg.createVisuals(0x0000ff); // blue - right lower leg
    rightFoot.createVisuals(0xffff00); // yellow - right foot
    leftUpperLeg.createVisuals(0x00ffff); // cyan - left upper leg
    leftLowerLeg.createVisuals(0xff00ff); // magenta - left lower leg
    leftFoot.createVisuals(0xffa500); // orange - left foot
    rightUpperArm.createVisuals(0xff69b4); // pink - right upper arm
    rightLowerArm.createVisuals(0xff1493); // deep pink - right lower arm
    buildHandMesh(rightHand, 0xffb6c1, true);
    leftUpperArm.createVisuals(0x00fa9a); // spring green - left upper arm
    leftLowerArm.createVisuals(0x00ced1); // dark turquoise - left lower arm
    buildHandMesh(leftHand, 0x1e90ff, false);
    buildHeadMesh(head);

    scene.add(hip.mesh);

    hip.updateTransform();

    const mirrorMap = new Map<Bone, Bone>([
      [rightUpperLeg, leftUpperLeg], [leftUpperLeg, rightUpperLeg],
      [rightLowerLeg, leftLowerLeg], [leftLowerLeg, rightLowerLeg],
      [rightFoot, leftFoot],         [leftFoot, rightFoot],
      [rightUpperArm, leftUpperArm], [leftUpperArm, rightUpperArm],
      [rightLowerArm, leftLowerArm], [leftLowerArm, rightLowerArm],
      [rightHand, leftHand],         [leftHand, rightHand],
    ]);

    setBones({ hip, head, rightUpperLeg, rightLowerLeg, rightFoot, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperArm, rightLowerArm, rightHand, leftUpperArm, leftLowerArm, leftHand });

    // Create TransformControls for rotation
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode('rotate');
    transformControls.setSize(1.2);
    transformControls.setSpace('local');

    // Add the control's internal objects to the scene
    if (transformControls instanceof THREE.Object3D) {
      scene.add(transformControls);
    } else if ('_root' in transformControls && transformControls._root instanceof THREE.Object3D) {
      scene.add(transformControls._root);
    }

    transformControlsRef.current = transformControls;

    // Attach to right upper leg by default and configure axes
    transformControls.attach(rightUpperLeg.mesh);
    previousEulerRef.current.copy(rightUpperLeg.mesh.rotation);
    const hasX = rightUpperLeg.angles.some(a => a.axis === 'x' || a.axis === '-x');
    const hasY = rightUpperLeg.angles.some(a => a.axis === 'y' || a.axis === '-y');
    const hasZ = rightUpperLeg.angles.some(a => a.axis === 'z' || a.axis === '-z');
    transformControls.showX = hasX;
    transformControls.showY = hasY;
    transformControls.showZ = hasZ;

    console.log('TransformControls created:', transformControls);
    console.log('Is Object3D:', transformControls instanceof THREE.Object3D);
    console.log('Has _root:', '_root' in transformControls);
    console.log('Attached to bone:', rightUpperLeg.mesh.name);

    // Disable orbit controls when dragging gizmo
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
    });

    // Update semantic angles when gizmo changes
    transformControls.addEventListener('objectChange', () => {
      const attachedBone = transformControls.object as THREE.Group;
      if (!attachedBone) return;

      // Find which bone this is
      let bone: Bone | null = null;
      let isHip = false;
      if (attachedBone === hip.mesh) {
        bone = hip;
        isHip = true;
      }
      else if (attachedBone === rightUpperLeg.mesh) bone = rightUpperLeg;
      else if (attachedBone === rightLowerLeg.mesh) bone = rightLowerLeg;
      else if (attachedBone === rightFoot.mesh) bone = rightFoot;
      else if (attachedBone === leftUpperLeg.mesh) bone = leftUpperLeg;
      else if (attachedBone === leftLowerLeg.mesh) bone = leftLowerLeg;
      else if (attachedBone === leftFoot.mesh) bone = leftFoot;
      else if (attachedBone === rightUpperArm.mesh) bone = rightUpperArm;
      else if (attachedBone === rightLowerArm.mesh) bone = rightLowerArm;
      else if (attachedBone === rightHand.mesh) bone = rightHand;
      else if (attachedBone === leftUpperArm.mesh) bone = leftUpperArm;
      else if (attachedBone === leftLowerArm.mesh) bone = leftLowerArm;
      else if (attachedBone === leftHand.mesh) bone = leftHand;
      else if (attachedBone === head.mesh) bone = head;

      if (bone && isHip) {
        // Hip translation - just update the UI
        setUpdateTrigger(prev => prev + 1);
      } else if (bone) {
        // Extract euler rotation from the mesh (this was set by the gizmo)
        const currentEuler = attachedBone.rotation;
        const prevEuler = previousEulerRef.current;

        // Calculate which axis changed the most (threshold: 0.01 radians)
        const deltaX = Math.abs(currentEuler.x - prevEuler.x);
        const deltaY = Math.abs(currentEuler.y - prevEuler.y);
        const deltaZ = Math.abs(currentEuler.z - prevEuler.z);

        let changedAxis: 'x' | 'y' | 'z' | null = null;
        const threshold = 0.01;

        if (deltaX > threshold && deltaX > deltaY && deltaX > deltaZ) changedAxis = 'x';
        else if (deltaY > threshold && deltaY > deltaX && deltaY > deltaZ) changedAxis = 'y';
        else if (deltaZ > threshold && deltaZ > deltaX && deltaZ > deltaY) changedAxis = 'z';

        // Only update angles that use the changed axis
        if (changedAxis) {
          bone.angles.forEach(angle => {
            const absAxis = angle.axis.replace('-', '') as 'x' | 'y' | 'z';

            // Only update this angle if it uses the axis that changed
            if (absAxis === changedAxis) {
              const multiplier = angle.axis.startsWith('-') ? -1 : 1;
              let eulerValue = 0;
              if (absAxis === 'x') eulerValue = currentEuler.x;
              else if (absAxis === 'y') eulerValue = currentEuler.y;
              else if (absAxis === 'z') eulerValue = currentEuler.z;

              const degrees = THREE.MathUtils.radToDeg(eulerValue * multiplier);
              angle.value = THREE.MathUtils.clamp(degrees, angle.min, angle.max);
            }
          });

          // Re-apply the clamped angles to the mesh
          bone.updateTransform();

          // Mirror to opposite side if symmetric mode is on
          if (symmetricModeRef.current) {
            const mirror = mirrorMap.get(bone);
            if (mirror) {
              bone.angles.forEach(angle => mirror.setAngle(angle.name, angle.value));
            }
          }

          // Store current euler for next comparison
          previousEulerRef.current.copy(attachedBone.rotation);

          setUpdateTrigger(prev => prev + 1);
        }
      }
    });

    // Animation loop
    let animationId: number;
    function animate() {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      transformControls.dispose();
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [isOpen]);

  // Update gizmo attachment when selected bone changes
  useEffect(() => {
    if (!bones || !transformControlsRef.current) return;

    if (selectedBone === null) {
      transformControlsRef.current.detach();
      return;
    }

    const bone = bones[selectedBone];
    if (bone) {
      transformControlsRef.current.detach();
      transformControlsRef.current.attach(bone.mesh);

      // Hip gets translate or rotate mode based on toggle, others get rotate mode
      if (selectedBone === 'hip') {
        transformControlsRef.current.setMode(hipMode);
        transformControlsRef.current.showX = true;
        transformControlsRef.current.showY = true;
        transformControlsRef.current.showZ = true;

        // Initialize previous euler for rotation mode
        if (hipMode === 'rotate') {
          previousEulerRef.current.copy(bone.mesh.rotation);
        }
      } else {
        transformControlsRef.current.setMode('rotate');

        // Initialize previous euler with current bone rotation
        previousEulerRef.current.copy(bone.mesh.rotation);

        // Enable only the axes that this bone has angles for
        const hasX = bone.angles.some((a: { axis: string }) => a.axis === 'x' || a.axis === '-x');
        const hasY = bone.angles.some((a: { axis: string }) => a.axis === 'y' || a.axis === '-y');
        const hasZ = bone.angles.some((a: { axis: string }) => a.axis === 'z' || a.axis === '-z');
        transformControlsRef.current.showX = hasX;
        transformControlsRef.current.showY = hasY;
        transformControlsRef.current.showZ = hasZ;
      }
    }
  }, [selectedBone, bones, hipMode]);

  if (!isOpen) return null;

  const handleAngleChange = (boneName: 'hip' | 'head' | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot' | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot' | 'rightUpperArm' | 'rightLowerArm' | 'rightHand' | 'leftUpperArm' | 'leftLowerArm' | 'leftHand', angleName: string, value: number) => {
    if (!bones || boneName === 'hip') return; // Hip has no angles
    bones[boneName].setAngle(angleName, value);
    if (symmetricMode) {
      const mirrorName = MIRROR_BONE_NAMES[boneName];
      if (mirrorName) bones[mirrorName as keyof typeof bones].setAngle(angleName, value);
    }
    // Update previous euler reference after manual slider change
    if (selectedBone === boneName) {
      previousEulerRef.current.copy(bones[boneName].mesh.rotation);
    }
    setUpdateTrigger(prev => prev + 1); // Force re-render
  };

  const applyPreset = (preset: Preset) => {
    if (!bones) return;

    preset.angles.forEach(({ bone, angleName, value }) => {
      bones[bone].setAngle(angleName, value);
    });

    // Update previous euler reference if current bone was affected
    if (selectedBone) {
      previousEulerRef.current.copy(bones[selectedBone].mesh.rotation);
    }

    setUpdateTrigger(prev => prev + 1);
  };

  const currentBone = bones && selectedBone ? bones[selectedBone] : null;
  const angles = currentBone ? currentBone.angles : [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex">
      {/* 3D Canvas */}
      <div ref={containerRef} className="flex-1" />

      {/* Controls Sidebar */}
      <div className="w-110 bg-gray-900 text-white p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">3D Pose Editor (Demo)</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { const v = !symmetricMode; symmetricModeRef.current = v; setSymmetricModeState(v); }}
              className={`px-3 py-1 rounded text-sm ${symmetricMode ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              title="Mirror edits to opposite side"
            >
              ⟷ Sym
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-red-600 rounded hover:bg-red-700"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Select Bone</label>

          {/* Head centered */}
          <div className="flex justify-center mb-2">
            <button
              onClick={() => setSelectedBone('head')}
              className={`px-6 py-2 rounded text-sm ${selectedBone === 'head' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
            >
              🟤 Head
            </button>
          </div>

          {/* Arms row */}
          <div className="grid grid-cols-2 gap-2 mb-1">
            <div className="text-xs text-gray-500 text-center">Right Arm</div>
            <div className="text-xs text-gray-500 text-center">Left Arm</div>
            {(['rightUpperArm', 'leftUpperArm'] as const).map((b) => (
              <button key={b} onClick={() => setSelectedBone(b)}
                className={`px-3 py-2 rounded text-left text-sm ${selectedBone === b ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                {b.startsWith('right') ? '🩷' : '🟩'} Upper Arm
              </button>
            ))}
            {(['rightLowerArm', 'leftLowerArm'] as const).map((b) => (
              <button key={b} onClick={() => setSelectedBone(b)}
                className={`px-3 py-2 rounded text-left text-sm ${selectedBone === b ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                {b.startsWith('right') ? '🩷' : '🟩'} Lower Arm
              </button>
            ))}
            {(['rightHand', 'leftHand'] as const).map((b) => (
              <button key={b} onClick={() => setSelectedBone(b)}
                className={`px-3 py-2 rounded text-left text-sm ${selectedBone === b ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                {b.startsWith('right') ? '🩷' : '🟩'} Hand
              </button>
            ))}
          </div>

          {/* Hip centered */}
          <div className="flex gap-2 my-2">
            <button
              onClick={() => setSelectedBone(null)}
              className={`flex-1 px-3 py-2 rounded text-left text-sm ${selectedBone === null ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
            >
              ✕ None
            </button>
            <button
              onClick={() => setSelectedBone('hip')}
              className={`flex-1 px-3 py-2 rounded text-left text-sm ${selectedBone === 'hip' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
            >
              🔴 Hip
            </button>
          </div>

          {/* Legs row */}
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className="text-xs text-gray-500 text-center">Right Leg</div>
            <div className="text-xs text-gray-500 text-center">Left Leg</div>
            {(['rightUpperLeg', 'leftUpperLeg'] as const).map((b) => (
              <button key={b} onClick={() => setSelectedBone(b)}
                className={`px-3 py-2 rounded text-left text-sm ${selectedBone === b ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                {b.startsWith('right') ? '🟢' : '🔵'} Upper Leg
              </button>
            ))}
            {(['rightLowerLeg', 'leftLowerLeg'] as const).map((b) => (
              <button key={b} onClick={() => setSelectedBone(b)}
                className={`px-3 py-2 rounded text-left text-sm ${selectedBone === b ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                {b.startsWith('right') ? '🔵' : '🟣'} Lower Leg
              </button>
            ))}
            {(['rightFoot', 'leftFoot'] as const).map((b) => (
              <button key={b} onClick={() => setSelectedBone(b)}
                className={`px-3 py-2 rounded text-left text-sm ${selectedBone === b ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                {b.startsWith('right') ? '🟡' : '🟠'} Foot
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Presets</label>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Angles</h3>
          {selectedBone === null ? (
            <p className="text-sm text-gray-400">Select a bone to adjust angles</p>
          ) : selectedBone === 'hip' ? (
            <div>
              <p className="text-sm text-gray-400 mb-3">Use gizmo to move/rotate hip</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setHipMode('translate')}
                  className={`flex-1 px-3 py-2 rounded text-sm ${
                    hipMode === 'translate' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Translate
                </button>
                <button
                  onClick={() => setHipMode('rotate')}
                  className={`flex-1 px-3 py-2 rounded text-sm ${
                    hipMode === 'rotate' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Rotate
                </button>
              </div>
            </div>
          ) : (
            angles.map((angle: { name: string; value: number; min: number; max: number }) => (
              <div key={angle.name}>
                <label className="block text-sm mb-1">
                  {angle.name}: {angle.value.toFixed(1)}°
                </label>
                <input
                  type="range"
                  min={angle.min}
                  max={angle.max}
                  value={angle.value}
                  onChange={(e) =>
                    handleAngleChange(selectedBone as Exclude<typeof selectedBone, null | 'hip'>, angle.name, parseFloat(e.target.value))
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{angle.min}°</span>
                  <span>{angle.max}°</span>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
