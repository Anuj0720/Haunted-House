import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useControls } from "leva";
import { clone } from "three/examples/jsm/utils/SkeletonUtils";
import * as THREE from "three";

const BAT_COUNT = 4;

function createBatParams() {
  return Array.from({ length: BAT_COUNT }, () => ({
    phase: Math.random() * Math.PI * 2,
    baseYOffset: Math.random() * 1.6,
    radius: 8 + Math.random() * 2,
    speed: 0.35 + Math.random() * 0.15,
    scale: 1.5 + Math.random() * 0.4,
  }));
}

function BatInstance({ gltf, phase, baseY, radius, speed, scale, amplitude }) {
  const group = useRef();
  const { scene, animations } = gltf;
  const clonedScene = useMemo(() => {
    const cloned = clone(scene);
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = true;
      }
    });
    return cloned;
  }, [scene]);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    if (!actions) return;
    Object.values(actions).forEach((action) => action.play());
  }, [actions]);

  useFrame((state) => {
    if (!group.current) return;
    const elapsed = state.clock.elapsedTime * speed + phase;
    const x = Math.cos(elapsed) * radius;
    const z = Math.sin(elapsed) * radius;
    const y = baseY + Math.cos(elapsed * 1.3) * amplitude;

    group.current.position.set(x, y, z);

    const target = new THREE.Vector3(
      Math.cos(elapsed + 0.01) * radius,
      y,
      Math.sin(elapsed + 0.01) * radius,
    );

    group.current.lookAt(target);
  });

  return (
    <group ref={group} scale={scale}>
      <primitive object={clonedScene} />
    </group>
  );
}

export default function Bat() {
  const gltf = useGLTF("/models/bat.glb");
  const [batParams] = useState(createBatParams);

  const { globalScale, baseYOffset, verticalAmplitude } = useControls("Bats", {
    globalScale: { value: 1.4, min: 0.4, max: 3, step: 0.05 },
    baseYOffset: { value: 10, min: -2, max: 15, step: 0.05 },
    verticalAmplitude: { value: 1.3, min: 0, max: 1.5, step: 0.05 },
  });

  const batConfigs = useMemo(
    () =>
      batParams.map((params) => ({
        ...params,
        baseY: 1.8 + params.baseYOffset + baseYOffset,
        scale: params.scale * globalScale,
        amplitude: verticalAmplitude,
      })),
    [batParams, baseYOffset, globalScale, verticalAmplitude],
  );

  return (
    <>
      {batConfigs.map((props, index) => (
        <BatInstance key={index} gltf={gltf} {...props} />
      ))}
    </>
  );
}

useGLTF.preload("/models/bat.glb");
