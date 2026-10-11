import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Effect, BlendFunction, EffectAttribute } from "postprocessing";
import * as THREE from "three";

// The whole night look - navy sky, red halo, stars, sparkles, blood moon and the
// lavender / sea-green mist - painted as ONE full-screen post-processing pass.
//
// Why a post pass and not scene meshes: a pass can't be hidden by render order,
// depth, visibility flags or anything baked into the model. Wherever nothing
// solid was drawn (depth == 1) it paints the sky behind it; the mist is blended
// in front of anything that is farther away than the fog floor.

// Two looks share this pass, blended by uTheme:
//   0 = blood moon (maroon halo, red moon, lavender mist)
//   1 = moonlit dream (silver cratered moon, indigo sky, dense stars,
//       dark cloud banks, bright teal / purple cloud sea)

const MOON_RADIUS = 58;
const MOON_DIST = 320;
const MOON_ANG = Math.asin(MOON_RADIUS / MOON_DIST);
// Direction of the moon: behind and above the house from the start view.
const MOON_DIR = new THREE.Vector3(-0.9314, 0.1802, 0.3165).normalize();
const FLOOR_Y = -2.5;

const SPARK_POOL = 120; // candidate sparkle directions on the sky
const SPARK_SLOTS = 12; // how many can be drawn at once (must match #define below)

const fragmentShader = /* glsl */ `
  #define SPARK_N 12

  uniform float uStrength;
  uniform float uTheme;
  uniform float uTime;
  uniform mat4 uCamWorld;
  uniform mat4 uProjInv;
  uniform vec3 uCamPos;
  uniform vec3 uMoonDir;
  uniform float uMoonAng;
  uniform float uMoonPx;
  uniform float uScale;
  uniform float uPxAng;
  uniform vec3 uSpark[SPARK_N]; // xy: pixel position, z: size in px (0 = unused)

  /* ---------------- noise ---------------- */
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i).x, hash3(i + vec3(1, 0, 0)).x, f.x), mix(hash3(i + vec3(0, 1, 0)).x, hash3(i + vec3(1, 1, 0)).x, f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)).x, hash3(i + vec3(1, 0, 1)).x, f.x), mix(hash3(i + vec3(0, 1, 1)).x, hash3(i + vec3(1, 1, 1)).x, f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 4; i++) {
      s += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return s;
  }

  float craters(vec3 p) {
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    float m = 1.0;
    for (int x = -1; x <= 1; x++)
      for (int y = -1; y <= 1; y++)
        for (int z = -1; z <= 1; z++) {
          vec3 g = vec3(float(x), float(y), float(z));
          vec3 r = g + hash3(ip + g) - fp;
          m = min(m, dot(r, r));
        }
    return m;
  }

  float mHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float mNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(mHash(i), mHash(i + vec3(1, 0, 0)), f.x), mix(mHash(i + vec3(0, 1, 0)), mHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(mHash(i + vec3(0, 0, 1)), mHash(i + vec3(1, 0, 1)), f.x), mix(mHash(i + vec3(0, 1, 1)), mHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float mFbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
      s += a * mNoise(p);
      p = p * 2.02 + 3.1;
      a *= 0.5;
    }
    return s;
  }

  /* ---------------- moon ---------------- */
  // Blood-moon palette, linear RGB, fitted to the clean part of the reference disc.
  vec3 moonRamp(float t) {
    vec3 c = mix(vec3(0.0060, 0.0010, 0.0006), vec3(0.0300, 0.0028, 0.0017), smoothstep(0.00, 0.14, t));
    c = mix(c, vec3(0.1000, 0.0065, 0.0044), smoothstep(0.14, 0.345, t));
    c = mix(c, vec3(0.3000, 0.0165, 0.0085), smoothstep(0.345, 0.50, t));
    c = mix(c, vec3(0.4200, 0.0400, 0.0210), smoothstep(0.50, 0.655, t));
    c = mix(c, vec3(0.5800, 0.0950, 0.0520), smoothstep(0.655, 0.86, t));
    c = mix(c, vec3(0.6800, 0.1500, 0.0800), smoothstep(0.86, 0.99, t));
    return c;
  }

  // Silver moon: cool grey maria, pale highlands, near-white bright patches.
  vec3 silverRamp(float t) {
    vec3 c = mix(vec3(0.060, 0.068, 0.095), vec3(0.200, 0.215, 0.260), smoothstep(0.00, 0.30, t));
    c = mix(c, vec3(0.520, 0.540, 0.600), smoothstep(0.30, 0.55, t));
    c = mix(c, vec3(0.820, 0.830, 0.850), smoothstep(0.55, 0.80, t));
    c = mix(c, vec3(1.000, 0.985, 0.940), smoothstep(0.80, 1.00, t));
    return c;
  }

  // Returns rgb = moon colour, a = coverage (0 outside the disc).
  vec4 moon(vec3 d) {
    float cosA = dot(d, uMoonDir);
    if (cosA < 0.0) return vec4(0.0);
    float sinM = sin(uMoonAng);
    float sinA = sqrt(max(1.0 - cosA * cosA, 0.0));
    float r = sinA / sinM;                       // 0 centre -> 1 limb, in moon radii
    float edgePx = (1.0 - r) * uMoonPx;
    if (edgePx < -1.0) return vec4(0.0);

    vec3 A = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
    vec3 B = cross(uMoonDir, A);
    float nx = dot(d, A) / sinM;
    float ny = dot(d, B) / sinM;
    float nz = sqrt(max(1.0 - nx * nx - ny * ny, 0.0));
    // Screen-right is -A here, so flip x to keep the lit side on the right.
    vec3 p = vec3(-nx, ny, nz);
    // The moon turns slowly, so its surface drifts across the disc.
    float spin = uTime * 0.035;
    p.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * p.xz;

    float m1 = fbm(p * 2.4 + 1.7 + fbm(p * 1.3) * 0.8);
    float m2 = fbm(p * 6.5 + 9.1);
    float m3 = fbm(p * 22.0);
    float c = craters(p * 5.5);
    float bowl = smoothstep(0.10, 0.0, c);
    float rim = smoothstep(0.05, 0.11, c) * (1.0 - smoothstep(0.11, 0.2, c));

    float t = 0.44 + (m1 - 0.5) * 2.5 + (m2 - 0.5) * 0.80 + (m3 - 0.5) * 0.35;
    t += rim * 0.06 - bowl * 0.05;
    t += nx * -0.20 - ny * 0.02; // light side stays fixed on screen while the surface turns
    t += (smoothstep(0.55, 1.0, min(r, 1.0)) - 0.25) * 0.14;
    // The silver moon is brighter overall, so shift its tone up a little.
    vec3 col = mix(moonRamp(clamp(t, 0.0, 1.0)), silverRamp(clamp(t + 0.12, 0.0, 1.0)), uTheme);
    col *= (0.93 + 0.07 * sin(uTime * 0.7)) * mix(1.0, 1.15, uTheme);   // slow breathing glow

    // ~2px dark-brown ink line around the disc.
    vec3 inkCol = mix(vec3(0.040, 0.0012, 0.0007), vec3(0.006, 0.010, 0.032), uTheme);
    col = mix(inkCol, col, smoothstep(0.3, 2.0 * uScale, edgePx));
    return vec4(col, clamp(edgePx + 0.5, 0.0, 1.0));
  }

  /* ---------------- sky ---------------- */
  vec3 stars(vec3 d) {
    vec3 col = vec3(0.0);
    if (d.y < -0.08) return col;
    // The whole star field turns very slowly around the sky.
    float rot = uTime * 0.006;
    d = vec3(d.x * cos(rot) - d.z * sin(rot), d.y, d.x * sin(rot) + d.z * cos(rot));
    for (int i = 0; i < 2; i++) {
      float N = i == 0 ? 90.0 : 170.0;
      float prob = (i == 0 ? 0.085 : 0.030) * (1.0 + 1.7 * uTheme);
      vec3 ip = floor(d * N);
      vec3 h = hash3(ip);
      vec3 h2 = hash3(ip + 17.3);
      if (h2.z > prob) continue;
      vec3 s = normalize(ip + 0.15 + 0.7 * h);
      float rad = uPxAng * (1.1 + 1.6 * h.x * h.x);
      float a = smoothstep(rad, 0.0, length(d - s));
      float b = 0.30 + 0.70 * h2.x * h2.x;
      float tw = 0.40 + 0.60 * sin(uTime * (1.0 + 2.6 * h.y) + h.z * 60.0);
      tw = max(tw, 0.12);
      vec3 tint = h2.y < 0.7 ? vec3(1.0, 0.97, 0.92) : (h2.y < 0.9 ? vec3(0.65, 0.78, 1.0) : vec3(1.0, 0.72, 0.5));
      col += tint * a * b * tw * (0.9 + 0.5 * uTheme);
    }
    return col;
  }

  vec3 sparkles(vec2 frag) {
    vec3 col = vec3(0.0);
    for (int i = 0; i < SPARK_N; i++) {
      float sz = uSpark[i].z;
      if (sz <= 0.0) continue;
      vec2 q = (frag - uSpark[i].xy) / sz;
      float h = exp(-abs(q.y) * 80.0) * exp(-abs(q.x) * 4.2);
      float v = exp(-abs(q.x) * 80.0) * exp(-abs(q.y) * 4.2);
      float core = exp(-length(q) * 30.0) + 0.25 * exp(-length(q) * 9.0);
      float ph = sin(uTime * (0.9 + float(i) * 0.17) + float(i) * 7.0);
      float tw = 0.45 + 0.55 * ph * ph;
      col += vec3(0.74, 0.87, 1.0) * 1.5 * clamp(h + v + core, 0.0, 1.0) * tw;
    }
    return col;
  }

  vec3 skyBase(vec3 d) {
    float h = clamp(d.y, -0.2, 1.0);
    vec3 horizon = vec3(0.0036, 0.0036, 0.0140);
    vec3 mid = vec3(0.0021, 0.0033, 0.0090);
    vec3 zenith = vec3(0.0018, 0.0032, 0.0084);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.35, h));
    col = mix(col, zenith, smoothstep(0.3, 0.95, h));

    // Wide maroon halo around the moon.
    float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
    float rr = ang / uMoonAng;
    float halo = exp(-max(rr - 1.0, 0.0) * 3.4) * (1.0 - smoothstep(1.6, 2.1, rr));
    col += vec3(0.036, 0.0027, 0.0034) * halo * (0.88 + 0.12 * sin(uTime * 0.7 + 0.6));

    // Dream theme: deep indigo overhead, lighter blue-violet near the horizon,
    // and a wide cool glow around the silver moon.
    vec3 dHorizon = vec3(0.006, 0.010, 0.046);
    vec3 dZenith = vec3(0.0016, 0.0030, 0.0150);
    vec3 dcol = mix(dHorizon, dZenith, smoothstep(0.0, 0.7, h));
    float dh = exp(-max(rr - 1.0, 0.0) * 1.9) * (1.0 - smoothstep(2.4, 3.4, rr));
    dcol += vec3(0.034, 0.050, 0.115) * dh * (0.9 + 0.1 * sin(uTime * 0.7 + 0.6));
    col = mix(col, dcol, uTheme);

    return mix(vec3(0.006, 0.0045, 0.014), col, smoothstep(-0.25, 0.03, d.y));
  }

  /* ---------------- horizon cloud banks (dream theme) ---------------- */
  // Dark navy clouds with pale blue rims that pile up around the horizon and
  // sit partly in front of the moon. rgb = colour, a = opacity.
  vec4 skyClouds(vec3 d) {
    float h = d.y;
    float band = smoothstep(-0.12, 0.02, h) * (1.0 - smoothstep(0.12, 0.46, h));
    vec3 p = vec3(d.x * 3.4, h * 8.0, d.z * 3.4) + vec3(uTime * 0.012, 0.0, 0.0) + 41.0;
    float n = mFbm(p);
    float a = smoothstep(0.40, 0.62, n) * band;
    float towardMoon = pow(max(dot(d, uMoonDir), 0.0), 4.0);
    float body = smoothstep(0.50, 0.82, n);
    vec3 dark = vec3(0.003, 0.004, 0.016);
    vec3 rim = vec3(0.060, 0.100, 0.260);
    vec3 col = mix(dark, rim, body * 0.45 + towardMoon * 0.7 * body);
    col += vec3(0.020, 0.010, 0.050) * (1.0 - smoothstep(0.0, 0.3, h)); // violet glow low down
    return vec4(col, a * 0.92);
  }

  /* ---------------- mist (floor fog) ---------------- */
  // rgb = colour, a = opacity.
  vec4 mist(vec3 wp, float dcam) {
    vec3 p = vec3(wp.x * 0.030, wp.y * 0.14, wp.z * 0.030) + 23.0;
    p.x += uTime * 0.010 * 3.3;
    float warp = mFbm(p * 1.4 + uTime * 0.008);
    float n = mFbm(p + warp * 1.1);
    float nn = clamp((n - 0.5) * 2.2 + 0.5, 0.0, 1.0);

    float r = length(wp.xz);
    float haze = 0.06 + 0.94 * (1.0 - smoothstep(24.0, 48.0, dcam));
    haze *= mix(0.55, 1.0, smoothstep(18.0, 30.0, dcam));
    float band = (1.0 - smoothstep(mix(55.0, 90.0, uTheme), mix(95.0, 150.0, uTheme), r)) * haze;
    float a = smoothstep(mix(0.15, 0.08, uTheme), mix(0.50, 0.40, uTheme), nn) * band;

    vec3 purple = mix(vec3(0.078, 0.044, 0.115), vec3(0.110, 0.060, 0.230), uTheme);
    vec3 teal = mix(vec3(0.040, 0.078, 0.075), vec3(0.030, 0.230, 0.250), uTheme);
    float g = smoothstep(0.50, 0.64, mFbm(p * 2.6 + 7.0 - uTime * 0.006));
    g += clamp(-wp.z * 0.012, -0.35, 0.35);
    g += (1.0 - smoothstep(14.0, 30.0, dcam)) * 0.55;
    g = clamp(g, 0.0, 1.0);
    vec3 col = mix(purple, teal, g) * (mix(0.35, 0.16, uTheme) + mix(1.3, 1.25, uTheme) * nn);
    // Dream theme: the cloud tops catch moonlight (cool blue-white).
    col += vec3(0.012, 0.028, 0.060) * uTheme * smoothstep(0.62, 0.95, nn);
    return vec4(col, a * mix(0.9, 0.97, uTheme));
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    if (uStrength < 0.001) {
      outputColor = inputColor;
      return;
    }

    // World-space direction of this pixel's view ray.
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec3 vd = normalize(v.xyz / v.w);
    vec3 d = normalize((uCamWorld * vec4(vd, 0.0)).xyz);

    vec3 col = inputColor.rgb;
    bool background = depth >= 0.9999;

    if (background) {
      vec3 sky = skyBase(d) + stars(d);
      vec4 m = moon(d);
      sky = mix(sky, m.rgb, m.a);
      vec4 cl = skyClouds(d);
      sky = mix(sky, cl.rgb, cl.a * uTheme * (1.0 - m.a * 0.6));
      sky += sparkles(uv * resolution) * (1.0 + 0.4 * uTheme);

      // Soft clouds already drawn over black count as partly covering the sky.
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      float cover = clamp(lum / 0.08, 0.0, 1.0) * 0.85;
      col += sky * uStrength * (1.0 - cover);
    }

    // Fog floor, drawn in front of everything farther away than the fog.
    if (d.y < -0.0005) {
      float t = (${FLOOR_Y.toFixed(1)} - uCamPos.y) / d.y;
      if (t > 0.0) {
        float zFloor = t * -vd.z;
        float zGeo = background ? 1e9 : abs(getViewZ(depth));
        if (zFloor < zGeo) {
          vec3 wp = uCamPos + d * t;
          vec4 mc = mist(wp, length(wp.xz - uCamPos.xz));
          col = mix(col, mc.rgb, mc.a * uStrength);
        }
      }
    }

    // A shooting star streaks across the sky every few seconds.
    if (background) {
      float cyc = 9.0;
      float k = floor(uTime / cyc);
      float tt = (uTime - k * cyc) / 1.1;
      if (tt >= 0.0 && tt < 1.0) {
        vec3 hs = hash3(vec3(k, 3.7, 9.1));
        vec2 p0 = vec2(0.10 + 0.55 * hs.x, 0.62 + 0.30 * hs.y);
        vec2 dir = normalize(vec2(0.8, -0.45 - 0.3 * hs.z));
        vec2 head = p0 + dir * tt * 0.45;
        vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
        vec2 rel = (uv - head) * aspect;
        vec2 dn = normalize(dir * aspect);
        float al = dot(rel, dn);
        float across = length(rel - dn * al);
        float trail = smoothstep(0.0, -0.08, al) * step(al, 0.0);
        float streak = exp(-across * 450.0) * (trail + exp(-length(rel) * 220.0) * 2.0);
        col += vec3(0.8, 0.9, 1.0) * streak * sin(tt * 3.14159) * 1.0 * uStrength;
      }
    }

    outputColor = vec4(col, inputColor.a);
  }
`;

class SkyEffectImpl extends Effect {
  constructor() {
    const spark = Array.from({ length: SPARK_SLOTS }, () => new THREE.Vector3(0, 0, 0));
    super("SkyEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ["uStrength", new THREE.Uniform(0)],
        ["uTheme", new THREE.Uniform(0)],
        ["uTime", new THREE.Uniform(0)],
        ["uCamWorld", new THREE.Uniform(new THREE.Matrix4())],
        ["uProjInv", new THREE.Uniform(new THREE.Matrix4())],
        ["uCamPos", new THREE.Uniform(new THREE.Vector3())],
        ["uMoonDir", new THREE.Uniform(MOON_DIR.clone())],
        ["uMoonAng", new THREE.Uniform(MOON_ANG)],
        ["uMoonPx", new THREE.Uniform(200)],
        ["uScale", new THREE.Uniform(1)],
        ["uPxAng", new THREE.Uniform(0.001)],
        ["uSpark", new THREE.Uniform(spark)],
      ]),
    });
  }
}

// Candidate sparkle directions, fixed for the session.
function makeSparkDirs() {
  const dirs = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const y = 0.12 + Math.random() * 0.88;
    const t = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    dirs.push({
      dir: new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r),
      size: 24 + Math.random() * 28,
    });
  }
  return dirs;
}

// Must be a child of <EffectComposer>. Fades the sky in when `active` is true and
// back out when false.
export default function SkyEffect({ active, dream = false }) {
  const effect = useMemo(() => new SkyEffectImpl(), []);
  const sparks = useMemo(makeSparkDirs, []);
  const level = useMemo(() => ({ v: 0, theme: 0, logged: false }), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const { camera, size, gl } = state;
    level.v = THREE.MathUtils.damp(level.v, active ? 1 : 0, active ? 2.5 : 2.4, delta);
    if (!active && level.v < 0.003) level.v = 0;

    const u = effect.uniforms;
    u.get("uStrength").value = level.v;
    // Crossfade between the two looks while visible; snap while hidden so a look
    // never visibly morphs during fade-in / fade-out.
    level.theme = level.v < 0.02 ? (dream ? 1 : 0) : THREE.MathUtils.damp(level.theme, dream ? 1 : 0, 1.6, delta);
    u.get("uTheme").value = level.theme;
    if (level.v <= 0) return;
    if (!level.logged) {
      level.logged = true;
      console.info("[SkyEffect] running");
    }

    camera.updateMatrixWorld();
    const dpr = gl.getPixelRatio();
    const viewScale = dpr * Math.max(0.85, size.height / 944);
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;

    u.get("uTime").value = state.clock.elapsedTime;
    u.get("uCamWorld").value.copy(camera.matrixWorld);
    u.get("uProjInv").value.copy(camera.projectionMatrixInverse);
    u.get("uCamPos").value.copy(camera.position);
    u.get("uScale").value = viewScale;
    u.get("uPxAng").value = (2 * Math.tan(halfFov)) / (size.height * dpr);
    u.get("uMoonPx").value = (Math.tan(MOON_ANG) / Math.tan(halfFov)) * (size.height / 2) * dpr;

    // Project the sparkle directions to screen pixels; keep the ones in view.
    const slots = u.get("uSpark").value;
    let n = 0;
    for (const s of sparks) {
      if (n >= SPARK_SLOTS) break;
      tmp.copy(s.dir).multiplyScalar(100).add(camera.position).project(camera);
      if (tmp.z > 1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05) continue;
      slots[n].set(((tmp.x + 1) / 2) * size.width * dpr, ((tmp.y + 1) / 2) * size.height * dpr, s.size * viewScale);
      n++;
    }
    for (; n < SPARK_SLOTS; n++) slots[n].set(0, 0, 0);
  });

  return <primitive object={effect} dispose={null} />;
}
