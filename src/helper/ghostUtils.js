import * as THREE from "three";

// Linear-space luminance below which an untextured material is treated as a
// facial feature (eyes / mouth) rather than part of the ghost's body.
const FEATURE_LUMA = 0.05;

export const relativeLuminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function isFeatureMaterial(m) {
  return !!m && !m.map && !!m.color && relativeLuminance(m.color) < FEATURE_LUMA;
}

/**
 * Builds the material a ghost mesh should use.
 *
 * The old code replaced EVERY material on the model with one flat, fully
 * emissive colour. That erased the face twice over: eyes/mouth (usually their
 * own dark material, or part of a texture) became the same colour as the body,
 * and the emissive colour lit every pixel at full strength, so even real
 * geometry detail had no shading left to show.
 *
 * Now:
 *  - dark untextured materials (eyes, mouth) are kept as they were,
 *  - body materials keep their textures, and the glow is multiplied by the
 *    texture (emissiveMap) so painted-on faces stay dark.
 */
export function makeGhostMaterial(src, tint) {
  if (isFeatureMaterial(src)) {
    const m = src.clone();
    // Sit on top of the body surface instead of z-fighting with it.
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    m.userData = { ...m.userData, ghostFeature: true };
    return m;
  }

  const m = new THREE.MeshStandardMaterial({
    color: tint.clone(),
    map: src.map ?? null,
    normalMap: src.normalMap ?? null,
    aoMap: src.aoMap ?? null,
    alphaMap: src.alphaMap ?? null,
    alphaTest: src.alphaTest ?? 0,
    side: src.side ?? THREE.FrontSide,
    vertexColors: src.vertexColors ?? false,
    roughness: 0.85,
    metalness: 0,
    emissive: tint.clone(),
    emissiveMap: src.map ?? null,
    emissiveIntensity: 1,
  });
  m.transparent = !!src.transparent;
  if (src.transparent) {
    // Face decals are usually transparent planes sitting just off the body.
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
  m.userData = { ghostBody: true, srcTransparent: !!src.transparent };
  return m;
}

/**
 * Works out which way the model's face points, so "face the camera" really
 * shows the face. Looks for dark, untextured feature meshes (eyes) and checks
 * which side of the body they sit on.
 *
 * Returns a yaw offset in radians to ADD to the desired heading, or null when
 * it can't tell (e.g. the face is painted into a texture). Pick the offset
 * by hand in the Leva "Ghosts" panel (#debug) in that case.
 */
export function detectFrontYaw(root) {
  root.updateMatrixWorld(true);

  const body = new THREE.Box3();
  const face = new THREE.Box3();
  const tmp = new THREE.Box3();
  let hasBody = false;
  let hasFace = false;

  root.traverse((o) => {
    if (!o.isMesh) return;
    tmp.setFromObject(o);
    if (tmp.isEmpty()) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const featureOnly = mats.length > 0 && mats.every(isFeatureMaterial);
    if (featureOnly) {
      face.union(tmp);
      hasFace = true;
    } else {
      body.union(tmp);
      hasBody = true;
    }
  });

  if (!hasBody || !hasFace) return null;

  const bodySize = body.getSize(new THREE.Vector3());
  const faceSize = face.getSize(new THREE.Vector3());
  const volume = (s) => s.x * s.y * s.z;
  // A "dark feature" as big as the body is just a dark ghost, not a face.
  if (volume(faceSize) > 0.35 * volume(bodySize)) return null;

  const bodyC = body.getCenter(new THREE.Vector3());
  const faceC = face.getCenter(new THREE.Vector3());
  const dx = faceC.x - bodyC.x;
  const dz = faceC.z - bodyC.z;
  // Features centred on the body (symmetrical dark parts) say nothing about "front".
  if (Math.hypot(dx, dz) < 0.04 * Math.max(bodySize.x, bodySize.z)) return null;

  // Front direction is atan2(dx, dz); rotating by -front puts it on +Z.
  return -Math.atan2(dx, dz);
}
