import * as THREE from 'three';
import { Bone, createBones } from './Bone';
import { Palette, buildFoot, buildHand, buildHead, buildSkinnedBody } from './bodyMesh';
import { HumanPose, neutralPose } from './humanPose';
import { BoneKey, boneKey } from './skeleton';

const HIGHLIGHT = new THREE.Color(0xffe066);
const HIGHLIGHT_SHARE = 0.55;

export interface Hit {
  key: BoneKey;
  point: THREE.Vector3;
  distance: number;
}

export class Human {
  readonly bones: Record<BoneKey, Bone>;
  readonly object = new THREE.Group();
  private readonly body: THREE.SkinnedMesh;
  private readonly faceBones: BoneKey[];
  private readonly baseColors: Float32Array;
  private readonly rigidParts: THREE.Mesh[] = [];
  // Twist each shin by the foot's turn, see buildSkinnedBody
  private readonly shinTwists = (['left', 'right'] as const).map(side => ({
    twist: new THREE.Bone(),
    knee: boneKey('knee', side),
    ankle: boneKey('ankle', side),
  }));

  constructor(palette: Palette) {
    this.bones = createBones();
    for (const bone of Object.values(this.bones)) bone.parent?.node.add(bone.node);
    this.object.add(this.bones.root.node);
    for (const { twist, knee } of this.shinTwists) this.bones[knee].node.add(twist);

    this.apply(neutralPose());
    this.object.updateMatrixWorld(true);
    const twists = Object.fromEntries(this.shinTwists.map(({ twist, knee }) => [knee, twist]));
    const { mesh, faceBones, baseColors } = buildSkinnedBody(this.bones, twists, palette);
    this.body = mesh;
    this.faceBones = faceBones;
    this.baseColors = baseColors;
    this.object.add(mesh);

    this.attachRigid(this.bones.neck, buildHead());
    for (const side of ['left', 'right'] as const) {
      this.attachRigid(this.bones[boneKey('wrist', side)], buildHand());
      this.attachRigid(this.bones[boneKey('ankle', side)], buildFoot());
    }
  }

  apply(pose: HumanPose): void {
    this.bones.root.node.position.set(...pose.position);
    for (const bone of Object.values(this.bones)) {
      bone.applyAngles(pose.angles[bone.key], bone.parent ? pose.angles[bone.parent.key] : undefined);
    }
    for (const { twist, ankle } of this.shinTwists) {
      twist.quaternion.copy(this.bones[ankle].firstAngleRotation(pose.angles[ankle].turn));
    }
  }

  pick(raycaster: THREE.Raycaster): Hit | null {
    // Bounds of a skinned mesh are computed once and go stale as soon as the pose changes
    this.body.computeBoundingSphere();
    this.body.computeBoundingBox();
    const hit = raycaster.intersectObject(this.object, true)[0];
    if (!hit) return null;
    const key: BoneKey | undefined = hit.object === this.body ? this.faceBones[hit.faceIndex!] : hit.object.userData.boneKey;
    return key ? { key, point: hit.point, distance: hit.distance } : null;
  }

  setHighlighted(keys: BoneKey[]): void {
    const colors = this.body.geometry.getAttribute('color') as THREE.BufferAttribute;
    const color = new THREE.Color();
    this.faceBones.forEach((key, face) => {
      for (let v = face * 3; v < face * 3 + 3; v++) {
        color.fromArray(this.baseColors, v * 3);
        if (keys.includes(key)) color.lerp(HIGHLIGHT, HIGHLIGHT_SHARE);
        colors.setXYZ(v, color.r, color.g, color.b);
      }
    });
    colors.needsUpdate = true;
    for (const part of this.rigidParts) {
      const emissive = keys.includes(part.userData.boneKey) ? HIGHLIGHT.clone().multiplyScalar(0.35) : new THREE.Color(0);
      (part.material as THREE.MeshStandardMaterial).emissive.copy(emissive);
    }
  }

  // Root height at which the lowest point of the body, apart from `ignored` bones, touches the floor
  groundedRootHeight(pose: HumanPose, ignored: BoneKey[] = []): number {
    this.apply(pose);
    this.object.updateMatrixWorld(true);
    let lowest = Infinity;
    const vertex = new THREE.Vector3();
    const vertexCount = this.body.geometry.getAttribute('position').count;
    for (let i = 0; i < vertexCount; i++) {
      if (ignored.includes(this.faceBones[Math.floor(i / 3)])) continue;
      lowest = Math.min(lowest, this.body.getVertexPosition(i, vertex).applyMatrix4(this.body.matrixWorld).y);
    }
    for (const part of this.rigidParts.filter(p => !ignored.includes(p.userData.boneKey))) {
      lowest = Math.min(lowest, new THREE.Box3().setFromObject(part, true).min.y);
    }
    return pose.position[1] - lowest;
  }

  dispose(): void {
    this.object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    });
  }

  // Rigid parts are modelled for the left side; the right side gets a mirrored copy
  private attachRigid(bone: Bone, part: THREE.Object3D): void {
    if (bone.side === 'right') part.scale.x *= -1;
    part.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.userData.boneKey = bone.key;
      this.rigidParts.push(child);
    });
    bone.node.add(part);
  }
}
