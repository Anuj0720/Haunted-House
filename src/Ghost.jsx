import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useControls } from "leva";
import { clone } from "three/examples/jsm/utils/SkeletonUtils";
import * as THREE from "three";

const GHOST_COUNT = 4;
const WALK_ACTION_NAME = "Armature|Action_Walk";

function createGhostParams() {

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

    spinSpeed: 0.4 + Math.random() * 0.5,
    spinPhase: Math.random() * Math.PI * 2,
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
  index,
  positionsRef,
  phase,
  radius,
  speed,
  scale,
  amplitude,
  offsetY,
  direction,
  spinSpeed,
  spinPhase,
  minSeparation,
  color,
}) {

  const outerGroup = useRef();
  const spinGroup = useRef();
  const animRoot = useRef();
  const { scene, animations } = gltf;

  
  const clonedScene = useMemo(() => {
    const cloned = clone(scene);
    cloned.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = tintMaterial(child.material, color);
      }
    });
    return cloned;
  }, [scene, color]);

  const { actions } = useAnimations(animations, animRoot);

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

  const avoidVector = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!outerGroup.current) return;

    const t = state.clock.elapsedTime;
    const elapsed = t * speed * direction + phase;
    let x = Math.cos(elapsed) * radius;
    let z = Math.sin(elapsed) * radius;
    const y = offsetY + Math.cos(elapsed * 1.4) * amplitude;

    if (positionsRef?.current) {
      positionsRef.current.forEach((otherPos, otherIndex) => {
        if (otherIndex === index || !otherPos) return;
        avoidVector.set(x - otherPos.x, 0, z - otherPos.z);
        const dist = avoidVector.length();
        const minDist = minSeparation;
        if (dist > 1e-4 && dist < minDist) {
          const push = (minDist - dist) * 0.5;
          avoidVector.normalize().multiplyScalar(push);
          x += avoidVector.x;
          z += avoidVector.z;
        } else if (dist <= 1e-4) {
          x += minDist * 0.5;
        }
      });
    }

    outerGroup.current.position.set(x, y, z);

    if (positionsRef?.current?.[index]) {
      positionsRef.current[index].set(x, y, z);
    }

    if (spinGroup.current) {
      const angle = spinPhase + t * spinSpeed;
      if (Number.isFinite(angle)) spinGroup.current.rotation.y = angle;
    }
  });

  return (
    <group ref={outerGroup}>
      <group ref={spinGroup} scale={scale}>
        <group ref={animRoot}>
          <primitive object={clonedScene} />
        </group>
      </group>
    </group>
  );
}

export default function Ghost() {
  const gltf = useGLTF("/models/ghost2.glb");
  const [ghostParams] = useState(createGhostParams);


  useEffect(() => {
    console.log(
      "Ghost model animations:",
      gltf.animations.map((clip) => clip.name),
    );
  }, [gltf]);

  const {
    globalScale,
    baseOffsetY,
    verticalAmplitude,
    positionRadius,
    speedFactor,
    minSeparation,
    spinSpeedFactor,
  } = useControls("Ghosts", {
    globalScale: { value: 0.75, min: 0.4, max: 3, step: 0.05 },
    baseOffsetY: { value: -0.9, min: -8, max: 8, step: 0.05 },
    verticalAmplitude: { value: 2, min: 0, max: 2, step: 0.05 },
    positionRadius: { value: 8.6, min: 1, max: 15, step: 0.1 },
    speedFactor: { value: 0.75, min: 0.1, max: 2, step: 0.05 },

    minSeparation: { value: 3.2, min: 0, max: 8, step: 0.1 },
    spinSpeedFactor: { value: 1, min: 0, max: 4, step: 0.1 },
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
        spinSpeed: params.spinSpeed * spinSpeedFactor,
      })),
    [
      ghostParams,
      baseOffsetY,
      verticalAmplitude,
      positionRadius,
      speedFactor,
      globalScale,
      spinSpeedFactor,
    ],
  );


  const positionsRef = useRef(
    configs.map((cfg) => {
      const x = Math.cos(cfg.phase) * cfg.radius;
      const z = Math.sin(cfg.phase) * cfg.radius;
      return new THREE.Vector3(x, cfg.offsetY, z);
    }),
  );

  return (
    <>
      {configs.map((cfg, index) => (
        <GhostInstance
          key={index}
          index={index}
          gltf={gltf}
          positionsRef={positionsRef}
          phase={cfg.phase}
          radius={cfg.radius}
          speed={cfg.speed}
          scale={cfg.scale}
          amplitude={cfg.amplitude}
          offsetY={cfg.offsetY}
          direction={cfg.direction}
          spinSpeed={cfg.spinSpeed}
          spinPhase={cfg.spinPhase}
          minSeparation={minSeparation}
          color={cfg.color}
        />
      ))}
    </>
  );
}

useGLTF.preload("/models/ghost2.glb");
