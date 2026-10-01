import * as THREE from 'three'
import { makeAqua } from './aquaShader'

// Plants sway in the "current": displacement grows with height above the
// decoration's base, and each placed plant gets its own phase from its world
// position so a row of plants doesn't move in lockstep.
const SWAY_VERTEX = /* glsl */ `
  vec3 aquaObj = modelMatrix[3].xyz;
  float aquaPh = aquaObj.x * 1.7 + aquaObj.z * 2.3;
  float aquaH = max(transformed.y, 0.0);
  float aquaAmp = 0.055 * pow(aquaH, 1.35);
  transformed.x += sin(uAquaTime * 1.1 + aquaPh + aquaH * 1.4) * aquaAmp;
  transformed.z += cos(uAquaTime * 0.8 + aquaPh * 1.3 + aquaH * 1.1) * aquaAmp * 0.6;
`

const TENTACLE_VERTEX = /* glsl */ `
  vec3 tObj = modelMatrix[3].xyz;
  float tPh = tObj.x * 2.1 + tObj.z * 1.7;
  float tH = max(transformed.y - 0.12, 0.0);
  transformed.x += sin(uAquaTime * 2.2 + transformed.x * 9.0 + transformed.z * 7.0 + tPh) * 0.12 * tH;
  transformed.z += cos(uAquaTime * 1.9 + transformed.z * 8.0 + transformed.x * 5.0 + tPh) * 0.12 * tH;
`

/**
 * Shared vertex-colored materials. Decorations bake their colors into
 * vertex colors (see MeshBuilder), so nearly every static decoration in the
 * tank can share one of these few materials — fewer shader programs, less
 * GPU state switching, and caustics/water tint applied consistently.
 */
export const decorMaterials = {
  matte: makeAqua(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), {}, 'aqua-matte'),
  satin: makeAqua(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 }), {}, 'aqua-satin'),
  glossy: makeAqua(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.05 }), {}, 'aqua-glossy'),
  metal: makeAqua(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9 }), {}, 'aqua-metal'),
  /** Emits its vertex color: subtle by day, blooming at night (uGlowBoost). */
  glow: makeAqua(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 }),
    { glowFromVertexColor: 0.6 },
    'aqua-glow',
  ),
  /** Stronger emitter for lava, lanterns and lights that should always shine. */
  lamp: makeAqua(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 }),
    { glowFromVertexColor: 1.5 },
    'aqua-lamp',
  ),
  /** Anemone tentacles: wiggle from their own height, not just the base. */
  tentacle: makeAqua(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 }),
    { vertexHook: TENTACLE_VERTEX, glowFromVertexColor: 0.15 },
    'aqua-tentacle',
  ),
  /** Double-sided variant for thin sails/fins/shells. */
  thin: makeAqua(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide }),
    {},
    'aqua-thin',
  ),
  /** Swaying plant material (single-sided stems, bulbs). */
  sway: makeAqua(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0 }),
    { vertexHook: SWAY_VERTEX },
    'aqua-sway',
  ),
  /** Swaying, double-sided leaves and ribbons. */
  swayLeaf: makeAqua(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }),
    { vertexHook: SWAY_VERTEX },
    'aqua-sway-leaf',
  ),
  /** Swaying + glowing (anemone tips, glow plants). */
  swayGlow: makeAqua(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 }),
    { vertexHook: SWAY_VERTEX, glowFromVertexColor: 1.2 },
    'aqua-sway-glow',
  ),
}

export type DecorMaterialKind = keyof typeof decorMaterials
