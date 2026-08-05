import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";

export default function Experience() {
  const { scene } = useGLTF("/models/model.glb");

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Enable frustum culling for meshes to skip rendering off-screen objects
        child.frustumCulled = true;
      }
    });
  }, [scene]);

  return <primitive object={scene} scale={1} />;
}

useGLTF.preload("/models/model.glb");
