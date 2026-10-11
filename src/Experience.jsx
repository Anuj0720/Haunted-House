import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const TEXTURE_SLOTS = [
  "map",
  "emissiveMap",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
];

export default function Experience() {
  const { scene } = useGLTF("/models/model.glb");
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());

  useLayoutEffect(() => {
    if (!scene) return;
    const anisotropy = Math.min(4, maxAnisotropy);

    scene.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    scene.traverse((child) => {
      if (!child.isMesh) return;
      box.setFromObject(child).getSize(size);
      const biggest = Math.max(size.x, size.y, size.z);
      if (biggest > 60) {
        child.visible = false;
        console.warn(
          `[Experience] hid oversized mesh "${child.name || child.uuid}" (${biggest.toFixed(0)} units) - it was covering the sky.`,
        );
      }
    });

    scene.traverse((child) => {
      if (!child.isMesh) return;
      // No lights in this scene cast shadows, so these flags only added shader variants.
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
      // The house never moves relative to its parent (<Float> moves the parent),
      // so stop re-computing every mesh matrix each frame.
      child.matrixAutoUpdate = false;
      child.updateMatrix();

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const slot of TEXTURE_SLOTS) {
          if (mat[slot]) mat[slot].anisotropy = anisotropy;
        }
      }
    });
  }, [scene, maxAnisotropy]);

  return <primitive object={scene} scale={1} />;
}

useGLTF.preload("/models/model.glb");
