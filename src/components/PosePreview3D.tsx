import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AcroPose, ROLES, Role } from '../3d/acroPose';
import { lerpHumanPose } from '../3d/humanPose';
import { DISPLAY_PALETTES } from '../3d/bodyMesh';
import { Human } from '../3d/Human';
import { Pose3d, loadPose3d } from '../3d/pose3dData';
import { Pose } from '../types/data';

const BACKGROUND = 0xf8f8f6;
// Seen from the front left and a little above
const VIEW_DIRECTION = new THREE.Vector3(1.6, 0.9, 2.2).normalize();

export function PosePreview3D({ pose }: { pose: Pose }) {
  // The previous pose stays until the next one is loaded; without 3D data the view is only hidden, so it
  // keeps its camera and moves on from there
  const [data, setData] = useState<Pose3d | null>(null);

  useEffect(() => {
    let current = true;
    loadPose3d(pose).then(loaded => current && setData(loaded), () => current && setData(null));
    return () => { current = false; };
  }, [pose]);

  const [shown, setShown] = useState<AcroPose | null>(null);
  if (data && data.pose !== shown) setShown(data.pose);
  if (!shown) return null;

  return (
    <div className={`relative mb-4 aspect-[4/3] rounded overflow-hidden border border-gray-200 ${data ? '' : 'hidden'}`}>
      <Scene pose={shown} />
      {data?.isDraft && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/40 text-white text-xs pointer-events-none">
          AI draft, not reviewed
        </div>
      )}
    </div>
  );
}

const MOVE_MILLISECONDS = 600;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

function Scene({ pose }: { pose: AcroPose }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const moveToRef = useRef<((pose: AcroPose) => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd6d3cc, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 6, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 6;
    Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5 });
    scene.add(sun);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const humans = Object.fromEntries(ROLES.map(role => {
      const human = new Human(DISPLAY_PALETTES[role]);
      human.apply(pose[role]);
      scene.add(human.object);
      return [role, human];
    })) as Record<Role, Human>;

    // Framed once so that both people fit from any direction, then left to the viewer
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    ROLES.forEach(role => bounds.expandByObject(humans[role].object, true));
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.05, 50);
    const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, distance);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.copy(sphere.center);
    orbit.enableZoom = false;
    orbit.enablePan = false;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.update();

    const render = () => renderer.render(scene, camera);
    const resize = () => {
      if (!container.clientWidth) return;
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      render();
    };
    orbit.addEventListener('change', render);
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let shown = pose;
    let frame = 0;
    moveToRef.current = target => {
      cancelAnimationFrame(frame);
      const from = shown;
      const start = performance.now();
      const step = (now: number) => {
        const t = easeInOut(Math.min(1, (now - start) / MOVE_MILLISECONDS));
        shown = { ...target, base: lerpHumanPose(from.base, target.base, t), flyer: lerpHumanPose(from.flyer, target.flyer, t) };
        ROLES.forEach(role => humans[role].apply(shown[role]));
        render();
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      orbit.dispose();
      ROLES.forEach(role => humans[role].dispose());
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    moveToRef.current?.(pose);
  }, [pose]);

  return <div ref={containerRef} className="absolute inset-0 cursor-grab" />;
}
