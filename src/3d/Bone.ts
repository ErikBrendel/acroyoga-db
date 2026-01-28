import * as THREE from 'three';

export interface SemanticAngle {
  name: string;
  value: number;
  min: number;
  max: number;
  axis: 'x' | '-x' | 'y' | '-y' | 'z' | '-z';
}

export interface BoneConfig {
  name: string;
  length: number;
  angles: SemanticAngle[];
  baseRotation?: THREE.Euler; // Base rotation applied before semantic angles
}

export class Bone {
  name: string;
  parent: Bone | null = null;
  children: Bone[] = [];

  // Local offset from parent (along parent's Y axis typically)
  localOffset: THREE.Vector3;
  length: number;

  // Base rotation applied before semantic angles
  baseRotation: THREE.Euler;

  // Semantic angles (ordered list)
  angles: SemanticAngle[];

  // Three.js objects
  mesh: THREE.Group;
  boneLine?: THREE.Line;
  jointSphere?: THREE.Mesh;

  constructor(config: BoneConfig, localOffset: THREE.Vector3) {
    this.name = config.name;
    this.length = config.length;
    this.localOffset = localOffset;
    this.baseRotation = config.baseRotation ? config.baseRotation.clone() : new THREE.Euler(0, 0, 0);

    this.angles = config.angles.map(angle => ({ ...angle }));

    this.mesh = new THREE.Group();
    this.mesh.name = config.name;
  }

  setAngle(angleName: string, value: number): void {
    const angle = this.angles.find(a => a.name === angleName);
    if (!angle) return;

    angle.value = THREE.MathUtils.clamp(value, angle.min, angle.max);
    this.updateTransform();
  }

  getAngle(angleName: string): number {
    return this.angles.find(a => a.name === angleName)?.value ?? 0;
  }

  updateTransform(): void {
    // Apply local offset
    this.mesh.position.copy(this.localOffset);

    // Start with base rotation
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeRotationFromEuler(this.baseRotation);

    // Apply semantic angles in order on top of base rotation
    this.angles.forEach(angle => {
      const radians = THREE.MathUtils.degToRad(angle.value);
      const absAxis = angle.axis.replace('-', '') as 'x' | 'y' | 'z';
      const multiplier = angle.axis.startsWith('-') ? -1 : 1;

      // Create rotation for this angle
      const axisRotation = new THREE.Matrix4();
      if (absAxis === 'x') {
        axisRotation.makeRotationX(radians * multiplier);
      } else if (absAxis === 'y') {
        axisRotation.makeRotationY(radians * multiplier);
      } else if (absAxis === 'z') {
        axisRotation.makeRotationZ(radians * multiplier);
      }

      // Multiply into combined rotation matrix
      rotationMatrix.multiply(axisRotation);
    });

    // Extract euler angles from the combined rotation matrix
    const euler = new THREE.Euler();
    euler.setFromRotationMatrix(rotationMatrix);
    this.mesh.rotation.copy(euler);

    // Update children
    this.children.forEach(child => child.updateTransform());
  }

  addChild(child: Bone): void {
    this.children.push(child);
    child.parent = this;
    this.mesh.add(child.mesh);
  }

  createVisuals(color: number = 0x00ff00): void {
    // Joint sphere
    const geometry = new THREE.SphereGeometry(0.05, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color });
    this.jointSphere = new THREE.Mesh(geometry, material);
    this.jointSphere.castShadow = true;
    this.mesh.add(this.jointSphere);

    // Bone capsule to end point
    if (this.length > 0) {
      const capsuleGeometry = new THREE.CapsuleGeometry(0.03, this.length - 0.06, 8, 16);
      const capsuleMaterial = new THREE.MeshStandardMaterial({ color });
      const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
      capsule.castShadow = true;

      // Position capsule at center of bone (bone extends along +Y)
      capsule.position.y = this.length / 2;

      this.mesh.add(capsule);
    }
  }

  getWorldPosition(): THREE.Vector3 {
    const worldPos = new THREE.Vector3();
    this.mesh.getWorldPosition(worldPos);
    return worldPos;
  }

  getEndPosition(): THREE.Vector3 {
    const endLocal = new THREE.Vector3(0, this.length, 0);
    return endLocal.applyMatrix4(this.mesh.matrixWorld);
  }
}
