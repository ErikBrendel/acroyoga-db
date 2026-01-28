import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Bone, BoneConfig } from '../3d/Bone';

export function PoseEditor3DDemo({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bones, setBones] = useState<{
    hip: Bone;
    leftUpperLeg: Bone;
    leftLowerLeg: Bone;
    leftFoot: Bone;
    rightUpperLeg: Bone;
    rightLowerLeg: Bone;
    rightFoot: Bone;
  } | null>(null);
  const [selectedBone, setSelectedBone] = useState<'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot' | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot' | null>(null);
  const [, setUpdateTrigger] = useState(0);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);

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

    const leftUpperLegConfig: BoneConfig = {
      name: 'left-upper-leg',
      length: 0.43, // ~43cm upper leg
      baseRotation: new THREE.Euler(0, 0, Math.PI), // Rotate 180° around Z to point downward
      angles: [
        { name: 'pike', value: 0, min: -10, max: 130, axis: 'x' },
        { name: 'straddle', value: 0, min: -30, max: 120, axis: '-z' },
        { name: 'rotate', value: 0, min: -90, max: 90, axis: 'y' },
      ],
    };

    const rightUpperLegConfig: BoneConfig = {
      name: 'right-upper-leg',
      length: 0.43, // ~43cm upper leg
      baseRotation: new THREE.Euler(0, 0, Math.PI), // Rotate 180° around Z to point downward
      angles: [
        { name: 'pike', value: 0, min: -10, max: 130, axis: 'x' },
        { name: 'straddle', value: 0, min: -30, max: 120, axis: 'z' }, // Inverted for right leg
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

    const footConfig: BoneConfig = {
      name: 'foot',
      length: 0.25, // ~25cm foot
      angles: [
        { name: 'flex', value: 90, min: 5, max: 140, axis: 'x' },
        { name: 'tilt', value: 0, min: -20, max: 20, axis: 'z' },
      ],
    };

    const hipWidth = 0.15; // ~15cm offset from center for each leg

    const hip = new Bone(hipConfig, new THREE.Vector3(0, 1, 0));

    // Left leg
    const leftUpperLeg = new Bone(leftUpperLegConfig, new THREE.Vector3(-hipWidth, 0, 0));
    const leftLowerLeg = new Bone(lowerLegConfig, new THREE.Vector3(0, leftUpperLegConfig.length, 0));
    const leftFoot = new Bone(footConfig, new THREE.Vector3(0, lowerLegConfig.length, 0));

    // Right leg
    const rightUpperLeg = new Bone(rightUpperLegConfig, new THREE.Vector3(hipWidth, 0, 0));
    const rightLowerLeg = new Bone(lowerLegConfig, new THREE.Vector3(0, rightUpperLegConfig.length, 0));
    const rightFoot = new Bone(footConfig, new THREE.Vector3(0, lowerLegConfig.length, 0));

    // Build hierarchy
    hip.addChild(leftUpperLeg);
    leftUpperLeg.addChild(leftLowerLeg);
    leftLowerLeg.addChild(leftFoot);

    hip.addChild(rightUpperLeg);
    rightUpperLeg.addChild(rightLowerLeg);
    rightLowerLeg.addChild(rightFoot);

    // Create visuals
    hip.createVisuals(0xff0000); // red - hip
    leftUpperLeg.createVisuals(0x00ff00); // green - left upper leg
    leftLowerLeg.createVisuals(0x0000ff); // blue - left lower leg
    leftFoot.createVisuals(0xffff00); // yellow - left foot
    rightUpperLeg.createVisuals(0x00ffff); // cyan - right upper leg
    rightLowerLeg.createVisuals(0xff00ff); // magenta - right lower leg
    rightFoot.createVisuals(0xffa500); // orange - right foot

    scene.add(hip.mesh);

    hip.updateTransform();

    setBones({ hip, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot });

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

    // Attach to left upper leg by default and configure axes
    transformControls.attach(leftUpperLeg.mesh);
    const hasX = leftUpperLeg.angles.some(a => a.axis === 'x' || a.axis === '-x');
    const hasY = leftUpperLeg.angles.some(a => a.axis === 'y' || a.axis === '-y');
    const hasZ = leftUpperLeg.angles.some(a => a.axis === 'z' || a.axis === '-z');
    transformControls.showX = hasX;
    transformControls.showY = hasY;
    transformControls.showZ = hasZ;

    console.log('TransformControls created:', transformControls);
    console.log('Is Object3D:', transformControls instanceof THREE.Object3D);
    console.log('Has _root:', '_root' in transformControls);
    console.log('Attached to bone:', leftUpperLeg.mesh.name);

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
      if (attachedBone === leftUpperLeg.mesh) bone = leftUpperLeg;
      else if (attachedBone === leftLowerLeg.mesh) bone = leftLowerLeg;
      else if (attachedBone === leftFoot.mesh) bone = leftFoot;
      else if (attachedBone === rightUpperLeg.mesh) bone = rightUpperLeg;
      else if (attachedBone === rightLowerLeg.mesh) bone = rightLowerLeg;
      else if (attachedBone === rightFoot.mesh) bone = rightFoot;

      if (bone) {
        // Extract euler rotation from the mesh (this was set by the gizmo)
        const euler = attachedBone.rotation;

        // Map euler axes to semantic angles based on axis field
        bone.angles.forEach(angle => {
          const absAxis = angle.axis.replace('-', '') as 'x' | 'y' | 'z';
          const multiplier = angle.axis.startsWith('-') ? -1 : 1;

          let eulerValue = 0;
          if (absAxis === 'x') eulerValue = euler.x;
          else if (absAxis === 'y') eulerValue = euler.y;
          else if (absAxis === 'z') eulerValue = euler.z;

          const degrees = THREE.MathUtils.radToDeg(eulerValue * multiplier);
          angle.value = THREE.MathUtils.clamp(degrees, angle.min, angle.max);
        });

        // Re-apply the clamped angles to the mesh
        bone.updateTransform();

        setUpdateTrigger(prev => prev + 1);
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

      // Enable only the axes that this bone has angles for
      const hasX = bone.angles.some((a: { axis: string }) => a.axis === 'x' || a.axis === '-x');
      const hasY = bone.angles.some((a: { axis: string }) => a.axis === 'y' || a.axis === '-y');
      const hasZ = bone.angles.some((a: { axis: string }) => a.axis === 'z' || a.axis === '-z');
      transformControlsRef.current.showX = hasX;
      transformControlsRef.current.showY = hasY;
      transformControlsRef.current.showZ = hasZ;
    }
  }, [selectedBone, bones]);

  if (!isOpen) return null;

  const handleAngleChange = (boneName: 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot' | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot', angleName: string, value: number) => {
    if (!bones) return;
    bones[boneName].setAngle(angleName, value);
    setUpdateTrigger(prev => prev + 1); // Force re-render
  };

  const currentBone = bones && selectedBone ? bones[selectedBone] : null;
  const angles = currentBone ? currentBone.angles : [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex">
      {/* 3D Canvas */}
      <div ref={containerRef} className="flex-1" />

      {/* Controls Sidebar */}
      <div className="w-80 bg-gray-900 text-white p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">3D Pose Editor (Demo)</h2>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-red-600 rounded hover:bg-red-700"
          >
            Close
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Select Bone</label>
          <div className="space-y-1">
            <button
              onClick={() => setSelectedBone(null)}
              className={`w-full px-3 py-2 rounded text-left text-sm ${
                selectedBone === null ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              None
            </button>

            <div className="text-xs text-gray-500 mt-2 mb-1">Left Leg</div>
            <button
              onClick={() => setSelectedBone('leftUpperLeg')}
              className={`w-full px-3 py-2 rounded text-left text-sm ${
                selectedBone === 'leftUpperLeg' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              🟢 Upper Leg
            </button>
            <button
              onClick={() => setSelectedBone('leftLowerLeg')}
              className={`w-full px-3 py-2 rounded text-left text-sm ${
                selectedBone === 'leftLowerLeg' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              🔵 Lower Leg
            </button>
            <button
              onClick={() => setSelectedBone('leftFoot')}
              className={`w-full px-3 py-2 rounded text-left text-sm ${
                selectedBone === 'leftFoot' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              🟡 Foot
            </button>

            <div className="text-xs text-gray-500 mt-2 mb-1">Right Leg</div>
            <button
              onClick={() => setSelectedBone('rightUpperLeg')}
              className={`w-full px-3 py-2 rounded text-left text-sm ${
                selectedBone === 'rightUpperLeg' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              🔵 Upper Leg
            </button>
            <button
              onClick={() => setSelectedBone('rightLowerLeg')}
              className={`w-full px-3 py-2 rounded text-left text-sm ${
                selectedBone === 'rightLowerLeg' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              🟣 Lower Leg
            </button>
            <button
              onClick={() => setSelectedBone('rightFoot')}
              className={`w-full px-3 py-2 rounded text-left text-sm ${
                selectedBone === 'rightFoot' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              🟠 Foot
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Angles</h3>
          {selectedBone === null ? (
            <p className="text-sm text-gray-400">Select a bone to adjust angles</p>
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
                    handleAngleChange(selectedBone, angle.name, parseFloat(e.target.value))
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
