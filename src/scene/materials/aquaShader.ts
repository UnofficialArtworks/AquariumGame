import * as THREE from 'three'
import { FLOOR_Y, HALF_DEPTH, HALF_WIDTH, onTankResize, WATER_LINE_Y } from '../TankBounds'

/**
 * Uniforms shared (by reference) with every "aqua" material in the scene.
 * Updating a value here once per frame updates caustics/water tint on all
 * fish, decorations and gravel at the same time.
 */
export const aquaUniforms = {
  uAquaTime: { value: 0 },
  uCausticStrength: { value: 1 },
  uWaterColor: { value: new THREE.Color('#1d7fa6') },
  uWaterDensity: { value: 0.1 },
  uWaterBoxMin: { value: new THREE.Vector3(-HALF_WIDTH, FLOOR_Y - 0.6, -HALF_DEPTH) },
  uWaterBoxMax: { value: new THREE.Vector3(HALF_WIDTH, WATER_LINE_Y, HALF_DEPTH) },
  /** Multiplier for emissive "glow" parts — boosted at night. */
  uGlowBoost: { value: 1 },
}

/** Fit the water box back to the glass (after a resize, or when the Koi Pond's wider box is put away). */
export function resetWaterBox() {
  aquaUniforms.uWaterBoxMin.value.set(-HALF_WIDTH, aquaUniforms.uWaterBoxMin.value.y, -HALF_DEPTH)
  aquaUniforms.uWaterBoxMax.value.set(HALF_WIDTH, aquaUniforms.uWaterBoxMax.value.y, HALF_DEPTH)
}

onTankResize(resetWaterBox)

/** GLSL helpers shared by patched materials and hand-written tank shaders. */
export const AQUA_GLSL_COMMON = /* glsl */ `
uniform float uAquaTime;
uniform float uCausticStrength;
uniform vec3 uWaterColor;
uniform float uWaterDensity;
uniform vec3 uWaterBoxMin;
uniform vec3 uWaterBoxMax;
uniform float uGlowBoost;

vec2 aquaHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Distance between the nearest and second-nearest animated cell points:
// ~0 along cell borders, which become the bright caustic filaments.
float aquaCellEdge(vec2 p, float t) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = aquaHash2(n + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return sqrt(f2) - sqrt(f1);
}

float aquaCaustics(vec3 wp) {
  if (wp.y > uWaterBoxMax.y) return 0.0;
  float t = uAquaTime;
  vec2 p = wp.xz * 1.35 + vec2(wp.y * 0.35, -wp.y * 0.2);
  // Gentle domain warp makes the cell borders curvy like real caustics.
  p += 0.28 * vec2(sin(p.y * 1.7 + t * 0.8), cos(p.x * 1.5 - t * 0.7));
  float e1 = aquaCellEdge(p, t * 0.9);
  float e2 = aquaCellEdge(p * 1.6 + 7.3, -t * 0.75);
  float c = pow(1.0 - smoothstep(0.0, 0.28, e1), 3.0);
  c += 0.7 * pow(1.0 - smoothstep(0.0, 0.22, e2), 3.0);
  return c;
}

// Length of the camera ray that travels through water before reaching wp.
float aquaWaterPath(vec3 wp) {
  vec3 ro = cameraPosition;
  vec3 d = wp - ro;
  float tFrag = length(d);
  vec3 rd = d / max(tFrag, 1e-4);
  vec3 safeRd = mix(rd, vec3(1e-5), step(abs(rd), vec3(1e-5)));
  vec3 inv = 1.0 / safeRd;
  vec3 t0 = (uWaterBoxMin - ro) * inv;
  vec3 t1 = (uWaterBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tEnter = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
  float tExit = min(min(min(tmax.x, tmax.y), tmax.z), tFrag);
  return max(tExit - tEnter, 0.0);
}

vec3 aquaApplyWater(vec3 col, vec3 wp) {
  float path = aquaWaterPath(wp);
  float absorb = 1.0 - exp(-path * uWaterDensity);
  // Water eats red light first, so distant things drift toward blue-green.
  col *= mix(vec3(1.0), vec3(0.72, 0.93, 1.0), clamp(path * 0.22, 0.0, 1.0));
  return mix(col, uWaterColor, absorb);
}
`

const VERTEX_WORLDPOS = /* glsl */ `
{
  vec4 aquaWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    aquaWp = instanceMatrix * aquaWp;
  #endif
  vAquaWorldPos = (modelMatrix * aquaWp).xyz;
}
`

// HDR safety net for every built-in material. A razor-thin specular glint
// (sun on glass, an eye, a coin) can overflow the half-float frame buffer to
// Inf; the mipmap bloom then smears that one pixel across the whole screen
// and the frame flashes black. Scrub NaN and cap brightness at the source.
const HDR_GUARD = `
if (any(isnan(gl_FragColor.rgb))) gl_FragColor.rgb = vec3(0.0);
gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 48.0);
`
if (!THREE.ShaderChunk.opaque_fragment.includes('isnan(gl_FragColor')) {
  THREE.ShaderChunk.opaque_fragment = `${THREE.ShaderChunk.opaque_fragment}\n${HDR_GUARD}`
}

// Caustics modulate the directional (sun) light only, so they're naturally
// masked by shadows and by surfaces facing away from the light.
const LIGHTS_BEGIN_WITH_CAUSTICS = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= aquaCausticFactor;',
)

export interface AquaPatchOptions {
  /** Treat vertex colors as emissive light (used for glowing crystals, lamps...). */
  glowFromVertexColor?: number
  /** Extra GLSL inserted right before lighting runs (diffuseColor is available). */
  fragmentColorHook?: string
  /** Extra uniform/function declarations for the fragment shader. */
  fragmentPars?: string
  /** Extra uniform/function declarations for the vertex shader. */
  vertexPars?: string
  /** GLSL run after begin_vertex; may modify `transformed`. */
  vertexHook?: string
  uniforms?: Record<string, THREE.IUniform>
  /** Only light upward-facing surfaces with caustics (steep pond banks would show long stretched streaks). */
  causticsFacingUp?: boolean
}

/**
 * onBeforeCompile patch that gives a standard material underwater caustics
 * and depth-based water absorption. Hooks let callers add their own tweaks
 * (fish patterns, swaying plants) on top of the same patch.
 */
export function patchAquaShader(shader: THREE.WebGLProgramParametersWithUniforms, options: AquaPatchOptions = {}) {
  Object.assign(shader.uniforms, aquaUniforms, options.uniforms ?? {})

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>\nvarying vec3 vAquaWorldPos;\nuniform float uAquaTime;\n${options.vertexPars ?? ''}`,
    )
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${options.vertexHook ?? ''}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_WORLDPOS}`)

  const glow =
    options.glowFromVertexColor !== undefined
      ? `\n#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\ntotalEmissiveRadiance += vColor.rgb * ${options.glowFromVertexColor.toFixed(3)} * uGlowBoost;\n#endif\n`
      : ''

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>\nvarying vec3 vAquaWorldPos;\n${AQUA_GLSL_COMMON}\n${options.fragmentPars ?? ''}`,
    )
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${glow}\n${options.fragmentColorHook ?? ''}`)
    .replace(
      '#include <lights_fragment_begin>',
      `float aquaCausticStrength = uCausticStrength${options.causticsFacingUp ? ' * smoothstep(0.35, 0.8, inverseTransformDirection(normal, viewMatrix).y)' : ''};\nfloat aquaCausticFactor = mix(1.0, 0.62 + aquaCaustics(vAquaWorldPos) * 1.9, aquaCausticStrength);\n${LIGHTS_BEGIN_WITH_CAUSTICS}`,
    )
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>\ngl_FragColor.rgb = aquaApplyWater(gl_FragColor.rgb, vAquaWorldPos);\n${HDR_GUARD}`)
}

/** Convenience: make a material "aqua" in place and return it. */
export function makeAqua<T extends THREE.Material>(material: T, options: AquaPatchOptions = {}, cacheKey = 'aqua'): T {
  material.onBeforeCompile = (shader) => patchAquaShader(shader, options)
  material.customProgramCacheKey = () => cacheKey
  return material
}
