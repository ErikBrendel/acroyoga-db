import * as THREE from 'three';
import { Bone, createBones } from './Bone';
import { HumanPose } from './humanPose';
import { BoneKey, CONTACT_POINTS, JOINTS, JointId, Side, boneKey } from './skeleton';

const SIDE_COLORS: Record<Side | 'center', number> = { left: 0x4f8ef7, right: 0xf59e42, center: 0xb0bec5 };
const SKIN = 0xf5cba7;
const DARK = 0x2a1f1a;
const HIGHLIGHT = new THREE.Color(0x6b5a00);

export class Human {
  readonly bones: Record<BoneKey, Bone>;
  readonly object: THREE.Object3D;
  private readonly materials = new Map<BoneKey, THREE.MeshStandardMaterial[]>();

  constructor() {
    this.bones = createBones();

    for (const bone of Object.values(this.bones)) {
      const parent = JOINTS[bone.joint].parent;
      if (parent) {
        this.bones[boneKey(parent, JOINTS[parent].paired ? bone.side : null)].node.add(bone.node);
      }
      this.buildVisual(bone);
    }
    this.object = this.bones.root.node;
  }

  apply(pose: HumanPose): void {
    this.object.position.set(...pose.position);
    for (const bone of Object.values(this.bones)) {
      bone.applyAngles(pose.angles[bone.key]);
    }
  }

  pick(raycaster: THREE.Raycaster): BoneKey | null {
    const hit = raycaster.intersectObject(this.object, true).find(h => h.object.userData.boneKey);
    return hit ? hit.object.userData.boneKey : null;
  }

  setHighlighted(keys: BoneKey[]): void {
    for (const [key, materials] of this.materials) {
      materials.forEach(m => m.emissive.copy(keys.includes(key) ? HIGHLIGHT : new THREE.Color(0)));
    }
  }

  // Root height at which the lowest point of the body touches the floor
  groundedRootHeight(pose: HumanPose): number {
    this.apply(pose);
    this.object.updateMatrixWorld(true);
    return pose.position[1] - new THREE.Box3().setFromObject(this.object, true).min.y;
  }

  dispose(): void {
    this.object.traverse(child => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    for (const materials of this.materials.values()) materials.forEach(m => m.dispose());
  }

  private buildVisual(bone: Bone): void {
    const color = SIDE_COLORS[bone.side ?? 'center'];
    const material = (c: number) => {
      const m = new THREE.MeshStandardMaterial({ color: c });
      this.materials.set(bone.key, [...(this.materials.get(bone.key) ?? []), m]);
      return m;
    };

    // Visuals are modelled for the left side; the right side gets a mirrored copy
    const visual = new THREE.Group();
    if (bone.side === 'right') visual.scale.x = -1;
    bone.node.add(visual);

    VISUAL_BUILDERS[bone.joint](visual, bone, color, material);

    visual.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.userData.boneKey = bone.key;
    });
  }
}

type MaterialFactory = (color: number) => THREE.MeshStandardMaterial;
type VisualBuilder = (visual: THREE.Group, bone: Bone, color: number, material: MaterialFactory) => void;

function addLimb(visual: THREE.Group, bone: Bone, color: number, material: MaterialFactory): void {
  const { radius } = JOINTS[bone.joint];
  const mat = material(color);
  visual.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.1, 16, 12), mat));
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(bone.length - 2 * radius, 0.001), 6, 16), mat);
  capsule.position.y = bone.length / 2;
  visual.add(capsule);
}

function addHorizontalBar(visual: THREE.Group, halfWidth: number, y: number, radius: number, mat: THREE.Material): void {
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(radius, halfWidth * 2, 6, 16), mat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = y;
  visual.add(bar);
}

// Palm normal is local +X (facing the body in the standing pose), fingers along +Y, thumb towards +Z
function addHand(visual: THREE.Group, _bone: Bone, color: number, material: MaterialFactory): void {
  const back = material(color);
  const palm = material(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.6).getHex());
  visual.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), back));
  const [palmSurface, palmCentre] = CONTACT_POINTS.wrist;
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  const hand = new THREE.Mesh(new THREE.BoxGeometry(2 * palmSurface, 2 * palmCentre, 0.08), [palm, back, back, back, back, back]);
  hand.position.y = palmCentre;
  visual.add(hand);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.05, 4, 8), back);
  thumb.position.set(0.01, 0.03, 0.052);
  thumb.rotation.x = Math.PI / 5;
  visual.add(thumb);
}

function addHead(visual: THREE.Group, _bone: Bone, _color: number, material: MaterialFactory): void {
  const skin = material(SKIN);
  const dark = material(DARK);

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.04, 4, 12), skin);
  neck.position.y = 0.02;
  visual.add(neck);

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.22, 0.17), skin);
  skull.position.y = 0.14;
  visual.add(skull);

  const eyeGeo = new THREE.SphereGeometry(0.026, 12, 12);
  for (const x of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.position.set(x, 0.17, 0.086);
    visual.add(eye);
  }

  // Nose: 3-segment cone (triangle) pointing forward
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.03, 3), skin);
  nose.position.set(0, 0.125, 0.09);
  nose.rotation.x = Math.PI / 2;
  visual.add(nose);

  // Smile: tube along a downward arc
  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.042, 0.078, 0.087),
    new THREE.Vector3(-0.02, 0.062, 0.091),
    new THREE.Vector3(0, 0.057, 0.092),
    new THREE.Vector3(0.02, 0.062, 0.091),
    new THREE.Vector3(0.042, 0.078, 0.087),
  ]);
  visual.add(new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 12, 0.006, 6, false), dark));
}

const VISUAL_BUILDERS: Record<JointId, VisualBuilder> = {
  root: (visual, _bone, color, material) => {
    const { offset } = JOINTS.hip;
    addHorizontalBar(visual, offset![0], offset![1], JOINTS.root.radius, material(color));
  },
  waist: addLimb,
  chest: (visual, bone, color, material) => {
    addLimb(visual, bone, color, material);
    const [x, y] = JOINTS.shoulder.offset!;
    addHorizontalBar(visual, x, y, 0.05, material(color));
  },
  neck: addHead,
  hip: addLimb,
  knee: addLimb,
  ankle: addLimb,
  shoulder: addLimb,
  elbow: addLimb,
  wrist: addHand,
};
