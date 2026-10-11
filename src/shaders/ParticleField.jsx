import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const COUNT = 650;
const HEIGHT = 18; // particles rise through this band, then wrap
const INNER = 2.5;
const OUTER = 22;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uScale;

  // x: phase, y: speed, z: size, w: kind (>0.85 = slow cool wisp)
  attribute vec4 aSeed;

  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    float wisp = step(0.93, aSeed.w);
    vec3 p = position;

    // Rise and wrap. Wisps drift slower than the embers.
    float rise = (0.45 + aSeed.y * 0.9) * mix(1.0, 0.35, wisp);
    p.y = mod(p.y + uTime * rise, ${HEIGHT.toFixed(1)});

    // Slow orbit around the house, direction chosen per particle.
    float ang = uTime * (0.05 + aSeed.y * 0.12) * (aSeed.x > 0.5 ? 1.0 : -1.0);
    float c = cos(ang);
    float s = sin(ang);
    p.xz = mat2(c, -s, s, c) * p.xz;

    // Gentle sway.
    p.x += sin(uTime * 0.9 + aSeed.x * 6.2831 + p.y * 0.4) * 1.1;
    p.z += cos(uTime * 0.8 + aSeed.y * 6.2831 + p.y * 0.4) * 1.1;

    float life = p.y / ${HEIGHT.toFixed(1)};
    float fade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.7, 1.0, life));
    float twinkle = 0.65 + 0.35 * sin(uTime * (1.5 + aSeed.y * 2.5) + aSeed.x * 40.0);

    // On start the field spreads outward from the house instead of popping in.
    float dist = length(position.xz);
    float edge = uStrength * 34.0;
    float reveal = 1.0 - smoothstep(edge - 8.0, edge, dist);

    vAlpha = fade * twinkle * reveal * smoothstep(0.0, 0.2, uStrength);

    vec3 ember = mix(vec3(1.0, 0.62, 0.24), vec3(1.0, 0.82, 0.45), aSeed.x);
    vec3 spirit = vec3(0.58, 0.64, 1.0);
    vColor = mix(ember, spirit, wisp);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = aSeed.z * mix(0.8, 2.6, wisp);
    gl_PointSize = clamp(size * uScale / -mv.z, 1.5, 72.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float a = pow(core, 2.2) * vAlpha;
    if (a < 0.004) discard;
    // Colour above 1.0 so the bloom pass picks the bright centres up.
    gl_FragColor = vec4(vColor * (1.4 + 1.6 * core), a);
  }
`;

function buildGeometry() {
  const position = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    const r = Math.sqrt(INNER * INNER + Math.random() * (OUTER * OUTER - INNER * INNER));
    const theta = Math.random() * Math.PI * 2;
    position[i * 3] = Math.cos(theta) * r;
    position[i * 3 + 1] = Math.random() * HEIGHT;
    position[i * 3 + 2] = Math.sin(theta) * r;
    seed[i * 4] = Math.random();
    seed[i * 4 + 1] = Math.random();
    seed[i * 4 + 2] = 0.5 + Math.random() * 0.9;
    seed[i * 4 + 3] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  return geometry;
}

// Ember and spirit particles drifting around the house. Fades in when `active`
// turns on and fades back out when it turns off; hidden entirely once faded.
export default function ParticleField({ active }) {
  const points = useRef(null);
  const level = useRef(0);

  const geometry = useMemo(buildGeometry, []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uScale: { value: 140 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const target = active ? 1 : 0;
    level.current = THREE.MathUtils.damp(level.current, target, active ? 1.1 : 2.4, delta);
    if (!active && level.current < 0.003) level.current = 0;

    const obj = points.current;
    if (!obj) return;
    obj.visible = level.current > 0;
    if (!obj.visible) return;

    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uStrength.value = level.current;
    // Keep on-screen size consistent across pixel ratios and window heights.
    uniforms.uScale.value = state.size.height * state.gl.getPixelRatio() * 0.2;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
