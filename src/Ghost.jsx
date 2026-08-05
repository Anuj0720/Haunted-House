import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useControls } from "leva";
import { clone } from "three/examples/jsm/utils/SkeletonUtils";
import * as THREE from "three";

const GHOST_COUNT = 4;
const WALK_ACTION_NAME = "Armature|Action_Walk";

function createGhostParams() {
  // Spread hues evenly around the color wheel (with a little jitter) so
  // every ghost gets a visibly distinct color, then shuffle the order.
  const hueStep = 360 / GHOST_COUNT;
  const hues = Array.from(
    { length: GHOST_COUNT },
    (_, i) => (i * hueStep + Math.random() * (hueStep * 0.6)) % 360,
  );
  for (let i = hues.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hues[i], hues[j]] = [hues[j], hues[i]];
  }

  return Array.from({ length: GHOST_COUNT }, (_, i) => ({
    phase: Math.random() * Math.PI * 2,
    radius: 7 + Math.random() * 2,
    speed: 0.25 + Math.random() * 0.16,
    scale: 0.9 + Math.random() * 0.5,
    direction: Math.random() > 0.5 ? 1 : -1,
    // slow, random self-spin speed (radians/sec) — a full 360° turn
    // takes roughly 25–65 seconds depending on the ghost
    spinSpeed: 0.1 + Math.random() * 0.15,
    color: new THREE.Color(`hsl(${hues[i]}, 70%, 60%)`),
  }));
}

// Shared material for all ghosts (reduces draw calls)
const ghostMaterials = new Map();

function getOrCreateGhostMaterial(color) {
  const key = color.getHexString();
  if (!ghostMaterials.has(key)) {
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.95,
      castShadow: false,
    });
    ghostMaterials.set(key, material);
  }
  return ghostMaterials.get(key);
}

function tintMaterial(material, color) {
  if (Array.isArray(material)) {
    return material.map((mat) => tintMaterial(mat, color));
  }
  return getOrCreateGhostMaterial(color);
}

function GhostInstance({
  gltf,
  phase,
  radius,
  speed,
  scale,
  amplitude,
  offsetY,
  direction,
  spinSpeed,
  color,
}) {
  const group = useRef();
  const rotGroup = useRef();
  const { scene, animations } = gltf;

  // Clone the scene AND its materials per-instance so each ghost can have
  // its own color without affecting the shared source model or other ghosts.
  const clonedScene = useMemo(() => {
    const cloned = clone(scene);
    cloned.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = tintMaterial(child.material, color);
      }
    });
    return cloned;
  }, [scene, color]);

  const { actions } = useAnimations(animations, rotGroup);

  useEffect(() => {
    if (!actions) return;

    const walk = actions[WALK_ACTION_NAME];
    if (walk) {
      walk.reset().fadeIn(0.3).play();
    } else {
      console.warn(
        `Ghost: animation "${WALK_ACTION_NAME}" not found. Available actions:`,
        Object.keys(actions),
      );
    }

    return () => {
      walk?.fadeOut(0.3);
    };
  }, [actions]);

  useFrame((state, delta) => {
    if (!group.current || !rotGroup.current) return;
    const elapsed = state.clock.elapsedTime * speed * direction + phase;
    const x = Math.cos(elapsed) * radius;
    const z = Math.sin(elapsed) * radius;
    const y = offsetY + Math.cos(elapsed * 1.4) * amplitude;

    group.current.position.set(x, y, z);

    // Own independent slow spin on the Y axis (no longer tied to
    // facing the direction of travel around the orbit).
    rotGroup.current.rotation.y += spinSpeed * delta;
  });

  return (
    <group ref={group}>
      <group ref={rotGroup} scale={scale}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
}

export default function Ghost() {
  const gltf = useGLTF("/models/ghost2.glb");
  const [ghostParams] = useState(createGhostParams);

  const {
    globalScale,
    baseOffsetY,
    verticalAmplitude,
    positionRadius,
    speedFactor,
  } = useControls("Ghosts", {
    globalScale: { value: 0.75, min: 0.4, max: 3, step: 0.05 },
    baseOffsetY: { value: -0.9, min: -8, max: 8, step: 0.05 },
    verticalAmplitude: { value: 2, min: 0, max: 2, step: 0.05 },
    positionRadius: { value: 8.6, min: 1, max: 15, step: 0.1 },
    speedFactor: { value: 0.75, min: 0.1, max: 2, step: 0.05 },
  });

  const configs = useMemo(
    () =>
      ghostParams.map((params) => ({
        ...params,
        radius: positionRadius + (params.radius - 7),
        scale: params.scale * globalScale,
        amplitude: verticalAmplitude,
        offsetY: baseOffsetY,
        speed: params.speed * speedFactor,
      })),
    [
      ghostParams,
      baseOffsetY,
      verticalAmplitude,
      positionRadius,
      speedFactor,
      globalScale,
    ],
  );

  return (
    <>
      {configs.map((props, index) => (
        <GhostInstance key={index} gltf={gltf} {...props} />
      ))}
    </>
  );
}

useGLTF.preload("/models/ghost2.glb");
