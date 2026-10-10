import * as THREE from 'three';
import { HumanPose, neutralPose, withAngle } from './humanPose';
import { ALL_BONES, BoneKey, JOINTS } from './skeleton';
import { worldMatrix } from './ik';

export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

// Random angles within the inner `share` of each joint's range
export function randomAngles(pose: HumanPose, keys: BoneKey[], random: () => number, share = 0.8): HumanPose {
  return keys.reduce((result, key) => JOINTS[ALL_BONES.find(b => b.key === key)!.joint].angles.reduce((r, angle) => {
    const middle = (angle.min + angle.max) / 2;
    const half = ((angle.max - angle.min) / 2) * share;
    return withAngle(r, key, angle.name, middle + (random() * 2 - 1) * half);
  }, result), pose);
}

export const randomPose = (random: () => number) => randomAngles(neutralPose(), ALL_BONES.map(b => b.key), random);

export const jointPosition = (pose: HumanPose, key: BoneKey) => new THREE.Vector3().setFromMatrixPosition(worldMatrix(pose, key));

export function boneEnd(pose: HumanPose, key: BoneKey): THREE.Vector3 {
  const length = JOINTS[ALL_BONES.find(b => b.key === key)!.joint].length;
  return new THREE.Vector3(0, length, 0).applyMatrix4(worldMatrix(pose, key));
}

export function worldDirection(pose: HumanPose, key: BoneKey, local: [number, number, number]): THREE.Vector3 {
  const quaternion = new THREE.Quaternion();
  worldMatrix(pose, key).decompose(new THREE.Vector3(), quaternion, new THREE.Vector3());
  return new THREE.Vector3(...local).applyQuaternion(quaternion);
}
