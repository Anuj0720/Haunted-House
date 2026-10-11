import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useControls } from "leva";
import { clone } from "three/examples/jsm/utils/SkeletonUtils";
import * as THREE from "three";
import {
  detectFrontYaw,
  makeGhostMaterial,
  relativeLuminance,
  wrapAngle,
} from "./helper/ghostUtils.js";

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
    swaySpeed: 0.4 + Math.random() * 0.5,
    swayPhase: Math.random() * Math.PI * 2,
    color: new THREE.Color(`hsl(${hues[i]}, 70%, 60%)`),
  }));
}

function GhostInstance({
  gltf,
  index,
  positionsRef,
  frontOffset,
  phase,
  radius,
  speed,
  scale,
  amplitude,
  offsetY,
  direction,
  swaySpeed,
  swayPhase,
  swayAmount,
  turnSharpness,
  facing,
  glowTarget,
  bodyOpacity,
  minSeparation,
  color,
}) {
  const outerGroup = useRef();
  const spinGroup = useRef();
  const animRoot = useRef();
  // Smoothed heading. null until the first frame so ghosts don't swing round
  // from 0 when they appear.
  const yawRef = useRef(null);
  const { scene, animations } = gltf;

  // Clone + build materials ONCE per ghost. (Before, moving the glow slider
  // rebuilt the whole skinned scene, which also reset the animation mixer.)
  const { object, materials } = useMemo(() => {
    const cloned = clone(scene);
    const list = [];
    cloned.traverse((child) => {
      if (!child.isMesh) return;
      // Skinned meshes are culled using their bind-pose bounds, which makes
      // ghosts blink out near the screen edge. Four ghosts: not worth culling.
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
      const swap = (m) => {
        const next = makeGhostMaterial(m, color);
        list.push(next);
        return next;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(swap)
        : swap(child.material);
    });
    return { object: cloned, materials: list };
  }, [scene, color]);

  // Glow + opacity are plain uniform updates, no re-clone.
  // Emissive intensity is normalised per hue so every ghost crosses the Bloom
  // threshold together (green reads far brighter than blue at equal lightness).
  useLayoutEffect(() => {
    const luminance = Math.max(relativeLuminance(color), 0.05);
    const intensity = THREE.MathUtils.clamp(glowTarget / luminance, 0.25, 4);
    for (const m of materials) {
      if (!m.userData.ghostBody) continue;
      m.emissiveIntensity = intensity;
      m.opacity = bodyOpacity;
      m.transparent = bodyOpacity < 1 || m.userData.srcTransparent;
    }
  }, [materials, color, glowTarget, bodyOpacity]);

  useEffect(
    () => () => {
      for (const m of materials) m.dispose();
    },
    [materials],
  );

  const { actions } = useAnimations(animations, animRoot);

  useEffect(() => {
    if (!actions) return;
    const walk = actions[WALK_ACTION_NAME] ?? Object.values(actions)[0];
    if (!walk) {
      console.warn("Ghost: no animation clips found in the model.");
      return;
    }
    walk.reset().fadeIn(0.3).play();
    // Stagger the walk cycle so the four ghosts don't step in lockstep.
    const duration = walk.getClip().duration || 1;
    walk.time = (index * 0.37 + phase) % duration;
    return () => {
      walk.fadeOut(0.3);
    };
  }, [actions, index, phase]);

  const avoid = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const outer = outerGroup.current;
    if (!outer) return;

    const t = state.clock.elapsedTime;
    const angularSpeed = speed * direction;
    const elapsed = t * angularSpeed + phase;
    let x = Math.cos(elapsed) * radius;
    let z = Math.sin(elapsed) * radius;
    const y = offsetY + Math.cos(elapsed * 1.4) * amplitude;

    const others = positionsRef.current;
    if (others) {
      for (let i = 0; i < others.length; i++) {
        if (i === index) continue;
        const other = others[i];
        if (!other) continue;
        avoid.set(x - other.x, 0, z - other.z);
        const dist = avoid.length();
        if (dist > 1e-4 && dist < minSeparation) {
          avoid.normalize().multiplyScalar((minSeparation - dist) * 0.5);
          x += avoid.x;
          z += avoid.z;
        } else if (dist <= 1e-4) {
          x += minSeparation * 0.5;
        }
      }
      others[index]?.set(x, y, z);
    }

    outer.position.set(x, y, z);

    const spin = spinGroup.current;
    if (!spin) return;

    // --- Heading -----------------------------------------------------------
    // "spin" is the original behaviour (full 360° turn, face hidden half the
    // time). The default now turns the ghost toward the camera and only lets
    // it sway a little, so the face is always on show.
    if (facing === "spin") {
      yawRef.current = null;
      spin.rotation.y = swayPhase + t * swaySpeed;
      return;
    }

    let target;
    if (facing === "travel") {
      const sign = angularSpeed >= 0 ? 1 : -1;
      target =
        Math.atan2(-Math.sin(elapsed) * sign, Math.cos(elapsed) * sign) +
        frontOffset;
    } else {
      const cam = state.camera.position;
      target =
        Math.atan2(cam.x - x, cam.z - z) +
        frontOffset +
        Math.sin(t * swaySpeed + swayPhase) * swayAmount;
    }

    if (yawRef.current === null) {
      yawRef.current = target;
    } else {
      const diff = wrapAngle(target - yawRef.current);
      yawRef.current += diff * (1 - Math.exp(-turnSharpness * Math.min(delta, 0.1)));
    }
    spin.rotation.y = yawRef.current;
  });

  return (
    <group ref={outerGroup}>
      <group ref={spinGroup} scale={scale}>
        <group ref={animRoot}>
          <primitive object={object} />
        </group>
      </group>
    </group>
  );
}

export default function Ghost() {
  const gltf = useGLTF("/models/ghost2.glb");
  const [ghostParams] = useState(createGhostParams);

  const detectedFront = useMemo(() => {
    const yaw = detectFrontYaw(gltf.scene);
    console.info(
      yaw === null
        ? "Ghost: couldn't auto-detect the face direction. Use Ghosts > Model yaw offset in the #debug panel."
        : `Ghost: face direction auto-detected (${THREE.MathUtils.radToDeg(yaw).toFixed(0)}° offset).`,
    );
    return yaw;
  }, [gltf.scene]);

  const {
    globalScale,
    baseOffsetY,
    verticalAmplitude,
    positionRadius,
    speedFactor,
    minSeparation,
    facing,
    frontAxis,
    swayDegrees,
    swaySpeedFactor,
    turnSharpness,
    glowIntensity,
    bodyOpacity,
  } = useControls("Ghosts", {
    globalScale: { value: 0.75, min: 0.4, max: 3, step: 0.05 },
    baseOffsetY: { value: -0.9, min: -8, max: 8, step: 0.05 },
    verticalAmplitude: { value: 2, min: 0, max: 2, step: 0.05 },
    positionRadius: { value: 8.6, min: 1, max: 15, step: 0.1 },
    speedFactor: { value: 0.75, min: 0.1, max: 2, step: 0.05 },
    minSeparation: { value: 3.2, min: 0, max: 8, step: 0.1 },
    facing: {
      value: "camera",
      options: {
        "Face the camera": "camera",
        "Face travel direction": "travel",
        "Spin (original)": "spin",
      },
      label: "Facing",
    },
    frontAxis: {
      value: "auto",
      options: { "Auto-detect": "auto", "0°": 0, "90°": 90, "180°": 180, "270°": 270 },
      label: "Model yaw offset",
    },
    swayDegrees: { value: 25, min: 0, max: 90, step: 1, label: "Sway (deg)" },
    swaySpeedFactor: { value: 1, min: 0, max: 4, step: 0.1, label: "Sway speed" },
    turnSharpness: { value: 3, min: 0.5, max: 10, step: 0.1, label: "Turn response" },
    glowIntensity: { value: 0.55, min: 0.1, max: 1.5, step: 0.05, label: "Glow intensity" },
    bodyOpacity: { value: 1, min: 0.4, max: 1, step: 0.01, label: "Body opacity" },
  });

  const frontOffset =
    frontAxis === "auto"
      ? (detectedFront ?? 0)
      : THREE.MathUtils.degToRad(Number(frontAxis));

  const configs = useMemo(
    () =>
      ghostParams.map((params) => ({
        ...params,
        radius: positionRadius + (params.radius - 7),
        scale: params.scale * globalScale,
        amplitude: verticalAmplitude,
        offsetY: baseOffsetY,
        speed: params.speed * speedFactor,
        // Never fully frozen, even if the slider is dragged to 0.
        swaySpeed: Math.max(0.05, params.swaySpeed * swaySpeedFactor),
      })),
    [
      ghostParams,
      baseOffsetY,
      verticalAmplitude,
      positionRadius,
      speedFactor,
      globalScale,
      swaySpeedFactor,
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
          frontOffset={frontOffset}
          phase={cfg.phase}
          radius={cfg.radius}
          speed={cfg.speed}
          scale={cfg.scale}
          amplitude={cfg.amplitude}
          offsetY={cfg.offsetY}
          direction={cfg.direction}
          swaySpeed={cfg.swaySpeed}
          swayPhase={cfg.swayPhase}
          swayAmount={THREE.MathUtils.degToRad(swayDegrees)}
          turnSharpness={turnSharpness}
          facing={facing}
          glowTarget={glowIntensity}
          bodyOpacity={bodyOpacity}
          minSeparation={minSeparation}
          color={cfg.color}
        />
      ))}
    </>
  );
}

useGLTF.preload("/models/ghost2.glb");
