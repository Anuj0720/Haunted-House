import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Effect, BlendFunction, EffectAttribute } from "postprocessing";
import * as THREE from "three";

// Comic / graphic-novel look, done as one full-screen pass so it covers every
// material in the scene (house, ghosts, bats) without touching them:
//   - multi-tonal cel bands with purple shadows and warm highlights
//   - ink outlines from depth and luminance edges
//   - crosshatch lines in the shadow bands (two directions, denser when darker)
//   - saturated, bright pixels are left un-banded so they stay neon and bloom
const fragmentShader = /* glsl */ `
  uniform float uIntensity;
  uniform float uTheme; // 0 = blood-moon look, 1 = moonlit dream

  float lumaOf(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    vec3 src = max(inputColor.rgb, 0.0);
    float l = lumaOf(src);

    // Keep line weights steady across screen sizes and pixel ratios.
    float sc = max(1.0, 1.0 / (texelSize.y * 720.0));
    vec2 px = texelSize * 1.5 * sc;
    float geo = 1.0 - step(0.9999, depth);

    // ---- Ink outline ----
    float lL = lumaOf(texture2D(inputBuffer, uv - vec2(px.x, 0.0)).rgb);
    float lR = lumaOf(texture2D(inputBuffer, uv + vec2(px.x, 0.0)).rgb);
    float lD = lumaOf(texture2D(inputBuffer, uv - vec2(0.0, px.y)).rgb);
    float lU = lumaOf(texture2D(inputBuffer, uv + vec2(0.0, px.y)).rgb);
    float gl = (abs(lR - lL) + abs(lU - lD)) / (l + 0.12);

    float z0 = abs(getViewZ(depth));
    float zL = abs(getViewZ(readDepth(uv - vec2(px.x, 0.0))));
    float zR = abs(getViewZ(readDepth(uv + vec2(px.x, 0.0))));
    float zD = abs(getViewZ(readDepth(uv - vec2(0.0, px.y))));
    float zU = abs(getViewZ(readDepth(uv + vec2(0.0, px.y))));
    float gz = (abs(zR - zL) + abs(zU - zD)) / max(z0, 0.001);

    float edge = max(smoothstep(0.015, 0.05, gz), smoothstep(0.55, 1.2, gl) * geo);

    // ---- Cel bands (banded in a gamma-ish space, then back to linear) ----
    float sat = max(max(src.r, src.g), src.b) - min(min(src.r, src.g), src.b);
    float peak = max(max(src.r, src.g), src.b);
    vec3 boosted = mix(vec3(l), src, mix(1.35, 1.65, uTheme));

    float lg = sqrt(clamp(l, 0.0, 2.0));
    float b = lg * 5.0;
    float q = (floor(b) + smoothstep(0.38, 0.62, fract(b))) / 5.0;
    float tone = max(q, 0.05);
    vec3 hue = clamp(boosted / max(l, 1e-4), 0.0, 3.0);
    vec3 cel = hue * tone * tone * 1.25;

    float shadow = 1.0 - smoothstep(0.30, 0.52, lg);
    cel *= mix(vec3(1.0), mix(vec3(0.78, 0.86, 1.15), vec3(0.62, 0.84, 1.30), uTheme), shadow); // cool shadows
    cel *= mix(vec3(1.0), vec3(1.10, 1.0, 0.86), smoothstep(0.7, 1.0, lg)); // warm highlights

    // ---- Crosshatch in the shadows ----
    vec2 pc = (uv / texelSize) / sc;
    float spacing = 6.0;
    float h1 = 1.0 - smoothstep(0.30, 0.42, fract((pc.x + pc.y) / spacing));
    float h2 = 1.0 - smoothstep(0.30, 0.42, fract((pc.x - pc.y) / spacing));
    float m1 = 1.0 - smoothstep(0.26, 0.40, lg);
    float m2 = 1.0 - smoothstep(0.12, 0.24, lg);
    float hatch = max(h1 * m1, h2 * m2) * geo;

    vec3 ink = mix(vec3(0.020, 0.010, 0.040), vec3(0.006, 0.010, 0.030), uTheme);
    // (crosshatch removed: it read as a checked pattern over the model)

    // ---- Neon: bright + saturated pixels skip the banding and get pushed ----
    float neon = smoothstep(0.55, 1.0, peak) * smoothstep(0.30, 0.65, sat / max(peak, 1e-4));
    cel = mix(cel, boosted * 1.3, neon);

    // Dream theme: a thin teal glow hugging silhouette edges, like the lit rock in the reference.
    float rim = smoothstep(0.015, 0.06, gz) * geo;
    cel += vec3(0.020, 0.150, 0.170) * rim * uTheme * (0.4 + 0.6 * smoothstep(0.0, 0.5, lg));

    // The sky (moon, stars, mist) stays painterly: only the scene geometry is banded.
    vec3 skyCol = mix(vec3(l), src, 1.12);
    cel = mix(skyCol, cel, geo);

    // ---- Ink on top ----
    cel = mix(cel, ink, edge * (1.0 - neon * 0.6));

    // Print-style halftone over the whole frame (visible in the mist and sky).
    vec2 hp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * pc / 3.0;
    float dotMask = smoothstep(0.30, 0.50, length(fract(hp) - 0.5));
    cel *= 1.0 - 0.11 * dotMask * (1.0 - smoothstep(0.0, 0.6, lg)) * (1.0 - geo); // backdrop only, never on the model

    outputColor = vec4(mix(inputColor.rgb, cel, uIntensity), inputColor.a);
  }
`;

class ToonEffectImpl extends Effect {
  constructor() {
    super("ToonEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ["uIntensity", new THREE.Uniform(0)],
        ["uTheme", new THREE.Uniform(0)],
      ]),
    });
  }
}

// Must be a child of <EffectComposer>. Eases in when `active` is true, eases
// out when false, then calls onHidden so the parent can drop the pass.
export default function ToonEffect({ active, dream = false, onHidden }) {
  const effect = useMemo(() => new ToonEffectImpl(), []);
  const level = useRef(0);
  const theme = useRef(dream ? 1 : 0);

  useFrame((_, delta) => {
    level.current = THREE.MathUtils.damp(level.current, active ? 1 : 0, 2.4, delta);
    effect.uniforms.get("uIntensity").value = level.current;
    theme.current = level.current < 0.02 ? (dream ? 1 : 0) : THREE.MathUtils.damp(theme.current, dream ? 1 : 0, 1.6, delta);
    effect.uniforms.get("uTheme").value = theme.current;
    if (!active && level.current < 0.004) onHidden?.();
  });

  return <primitive object={effect} dispose={null} />;
}
