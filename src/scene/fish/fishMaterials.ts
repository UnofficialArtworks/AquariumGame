import * as THREE from 'three'
import type { FishDefinition, PatternType } from '../../state/types'
import { patchAquaShader } from '../materials/aquaShader'
import { hashString } from '../../utils/rng'
import { FISH_CATALOG } from './fishDefinitions'

const PATTERN_INDEX: Record<PatternType, number> = {
  solid: 0,
  bands: 1,
  stripe: 2,
  spots: 3,
  gradient: 4,
  calico: 5,
  neon: 6,
  tiger: 7,
  scales: 8,
}

/** Per-species pattern tuning: (count, width, offset, outline). */
function patternParams(def: FishDefinition): THREE.Vector4 {
  // Species tuning only fits the species' own pattern; a bred pattern uses the defaults.
  const own = FISH_CATALOG.find((f) => f.id === def.id)?.pattern === def.pattern
  switch (own ? def.id : '') {
    case 'clownfish':
      return new THREE.Vector4(3, 0.3, -0.25, 1)
    case 'angelfish':
      return new THREE.Vector4(4, 0.14, -0.2, 0)
    case 'lionfish':
      return new THREE.Vector4(10, 0.42, 0, 0)
    case 'zebra-danio':
      return new THREE.Vector4(5, 0.36, 0.25, 0)
    case 'swordtail':
      return new THREE.Vector4(1, 0.14, 0.5, 0)
    case 'molly':
      return new THREE.Vector4(9, 0.3, 0, 0)
    case 'cory-catfish':
      return new THREE.Vector4(14, 0.22, 0, 0)
    case 'pufferfish':
      return new THREE.Vector4(11, 0.24, 0, 0)
    default:
      return new THREE.Vector4(8, 0.28, 0, 0)
  }
}

const COMMON_PARS = /* glsl */ `
  uniform float uRainbow;
  uniform float uGolden;
  uniform float uGlowFx;
  float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), u.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  vec3 fHsv(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }
`

const BODY_VERTEX_PARS = /* glsl */ `
  uniform float uHalfLen;
  uniform float uSwimPhase;
  uniform float uSwimAmp;
  uniform float uPuff;
  uniform float uGulp;
  uniform float uBend;
  varying vec3 vFishPos;
`

const BODY_VERTEX_HOOK = /* glsl */ `
  vFishPos = position;
  float su = clamp((uHalfLen - position.x) / (2.0 * uHalfLen), 0.0, 1.0);
  transformed.z += sin(uSwimPhase - su * 3.2) * uSwimAmp * su * su;
  // Curl into turns: the tail sweeps toward the inside of the curve.
  transformed.z += uBend * su * su * uHalfLen * 0.9;
  float bulge = 1.0 + uPuff * 0.8 * max(0.0, 1.0 - pow(abs(su - 0.45) * 2.0, 2.0));
  transformed.y *= bulge;
  transformed.z *= mix(1.0, bulge * 1.3, uPuff);
  transformed *= 1.0 + uGulp * 0.14 * (1.0 - su);
`

const BODY_FRAGMENT_PARS = /* glsl */ `
  ${COMMON_PARS}
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform int uPattern;
  uniform float uHalfLen;
  uniform float uHalfHeight;
  uniform vec4 uPatternParams;
  uniform float uSeed;
  uniform float uNeonGlow;
  uniform float uPale;
  varying vec3 vFishPos;

  float fCells(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float m = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = vec2(fHash(n + g), fHash(n + g + 17.0)) * 0.8 + 0.1;
        vec2 r = g + o - f;
        m = min(m, dot(r, r));
      }
    }
    return sqrt(m);
  }
`

const BODY_FRAGMENT_HOOK = /* glsl */ `
  {
    vec3 fp = vFishPos;
    float fu = clamp((uHalfLen - fp.x) / (2.0 * uHalfLen), 0.0, 1.0);
    float fv = clamp(fp.y / uHalfHeight, -1.0, 1.0);
    vec3 fcol = uColor1;
    if (uPattern == 1) {
      float x = fu * uPatternParams.x + uPatternParams.z;
      float f = abs(fract(x) - 0.5) * 2.0;
      float band = smoothstep(uPatternParams.y + 0.05, uPatternParams.y - 0.05, f);
      float edge = uPatternParams.w * smoothstep(uPatternParams.y + 0.16, uPatternParams.y + 0.07, f) * (1.0 - band);
      fcol = mix(fcol, uColor2, band);
      fcol = mix(fcol, uColor3, edge);
    } else if (uPattern == 2) {
      float y = fv * uPatternParams.x * 0.5 + uPatternParams.z;
      float f = abs(fract(y) - 0.5) * 2.0;
      float stripe = smoothstep(uPatternParams.y + 0.06, uPatternParams.y - 0.06, f) * smoothstep(0.98, 0.85, fu) * smoothstep(0.02, 0.12, fu);
      fcol = mix(fcol, uColor2, stripe);
    } else if (uPattern == 3) {
      float c = fCells(vec2(fp.x, fp.y + fp.z * 0.6) * uPatternParams.x + uSeed);
      float spot = smoothstep(uPatternParams.y, uPatternParams.y - 0.08, c);
      fcol = mix(fcol, uColor2, spot * smoothstep(-0.9, -0.3, fv));
    } else if (uPattern == 4) {
      fcol = mix(uColor1, uColor2, smoothstep(0.2, 0.95, fu));
    } else if (uPattern == 5) {
      vec2 q = vec2(fp.x, fp.y + fp.z * 0.8) * 7.0 + uSeed;
      float n = fNoise(q) * 0.65 + fNoise(q * 2.3) * 0.35;
      fcol = mix(uColor1, uColor2, smoothstep(0.5, 0.56, n));
      float blk = fNoise(q * 1.9 + 9.0);
      fcol = mix(fcol, uColor3, smoothstep(0.74, 0.78, blk));
    } else if (uPattern == 6) {
      float stripe = smoothstep(0.16, 0.06, abs(fv - 0.12)) * smoothstep(0.04, 0.14, fu) * smoothstep(0.92, 0.72, fu);
      float lower = smoothstep(0.05, -0.25, fv) * smoothstep(0.35, 0.55, fu);
      fcol = mix(uColor1, vec3(0.75, 0.8, 0.85), smoothstep(-0.05, -0.55, fv));
      fcol = mix(fcol, uColor2, lower);
      fcol = mix(fcol, uColor3, stripe);
      totalEmissiveRadiance += uColor3 * stripe * uNeonGlow * uGlowBoost;
    } else if (uPattern == 7) {
      float w = sin(fu * 24.0 + sin(fv * 5.0 + uSeed) * 2.5 + fNoise(vec2(fu, fv) * 5.0 + uSeed) * 3.0);
      fcol = mix(uColor1, uColor2, smoothstep(0.1, 0.5, w));
    } else if (uPattern == 8) {
      vec2 q = vec2(fu * 26.0, fv * 7.0);
      q.x += mod(floor(q.y), 2.0) * 0.5;
      vec2 f = fract(q) - 0.5;
      float d = length(f * vec2(1.0, 1.3));
      float edge = smoothstep(0.3, 0.5, d);
      fcol = mix(uColor1, uColor2, smoothstep(0.0, 1.0, fu) * 0.55 + smoothstep(0.1, -0.8, fv) * 0.45);
      fcol *= 1.0 - edge * 0.3;
      fcol += edge * 0.05;
    }
    // Countershading: lighter belly, slightly darker back.
    fcol = mix(fcol, mix(fcol, vec3(1.0), 0.4), smoothstep(-0.25, -0.9, fv));
    fcol *= mix(1.0, 0.8, smoothstep(0.45, 1.0, fv));
    float gray = dot(fcol, vec3(0.299, 0.587, 0.114));
    fcol = mix(fcol, vec3(gray) * 0.9, uPale * 0.55);
    vec3 rainbow = fHsv(vec3(fract(fu * 1.2 + fv * 0.3 - uAquaTime * 0.35), 0.8, 1.0));
    fcol = mix(fcol, rainbow, uRainbow * 0.85);
    fcol = mix(fcol, vec3(1.0, 0.72, 0.18), uGolden * 0.85);
    metalnessFactor = mix(metalnessFactor, 0.95, uGolden);
    roughnessFactor = mix(roughnessFactor, 0.2, uGolden);
    diffuseColor.rgb = fcol;
    totalEmissiveRadiance += fcol * uGlowFx * 0.9 * uGlowBoost;
  }
`

const FIN_VERTEX_PARS = /* glsl */ `
  uniform float uSwimPhase;
  uniform float uFinFlow;
`

const FIN_VERTEX_HOOK = /* glsl */ `
  float fr = length(position.xy);
  transformed.z += sin(uSwimPhase * 1.1 - fr * 11.0) * uFinFlow * fr;
`

const FIN_FRAGMENT_PARS = /* glsl */ `
  ${COMMON_PARS}
  uniform float uFinGlow;
`

const FIN_FRAGMENT_HOOK = /* glsl */ `
  {
    vec3 rainbow = fHsv(vec3(fract(vAquaWorldPos.x * 0.8 + vAquaWorldPos.y * 0.6 - uAquaTime * 0.4), 0.75, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, rainbow, uRainbow * 0.85);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.75, 0.2), uGolden * 0.85);
    totalEmissiveRadiance += diffuseColor.rgb * (uGlowFx * 0.9 + uFinGlow) * uGlowBoost;
  }
`

export interface FishMaterialSet {
  body: THREE.MeshStandardMaterial
  fin: THREE.MeshStandardMaterial
  uniforms: {
    uSwimPhase: THREE.IUniform<number>
    uSwimAmp: THREE.IUniform<number>
    uPuff: THREE.IUniform<number>
    uGulp: THREE.IUniform<number>
    uBend: THREE.IUniform<number>
    uRainbow: THREE.IUniform<number>
    uGolden: THREE.IUniform<number>
    uGlowFx: THREE.IUniform<number>
    uPale: THREE.IUniform<number>
    uFinFlow: THREE.IUniform<number>
  }
}

/** Fin color: most species show their second color in the fins. */
export function finColorFor(def: FishDefinition): string {
  switch (def.pattern) {
    case 'gradient':
    case 'scales':
      return def.color2
    case 'neon':
      return def.id === 'glowfin' ? def.color3 ?? def.color2 : '#cfe7f5'
    case 'bands':
      return def.id === 'clownfish' ? def.color : def.color2
    case 'calico':
      return def.color
    default:
      return def.color
  }
}

/** Build the unique materials for one fish (each needs its own animation uniforms). */
export function createFishMaterials(def: FishDefinition, seedKey: string): FishMaterialSet {
  const uniforms = {
    uSwimPhase: { value: 0 },
    uSwimAmp: { value: def.bodyLength * 0.06 },
    uPuff: { value: 0 },
    uGulp: { value: 0 },
    uBend: { value: 0 },
    uRainbow: { value: 0 },
    uGolden: { value: 0 },
    uGlowFx: { value: 0 },
    uPale: { value: 0 },
    uFinFlow: { value: def.finStyle === 'veil' ? 0.22 : def.finStyle === 'fan' ? 0.14 : 0.07 },
  }
  const bodyUniforms = {
    ...uniforms,
    uColor1: { value: new THREE.Color(def.color) },
    uColor2: { value: new THREE.Color(def.color2) },
    uColor3: { value: new THREE.Color(def.color3 ?? def.color2) },
    uPattern: { value: PATTERN_INDEX[def.pattern] },
    uHalfLen: { value: def.bodyLength / 2 },
    uHalfHeight: { value: def.bodyHeight / 2 },
    uPatternParams: { value: patternParams(def) },
    uSeed: { value: (hashString(seedKey) % 1000) / 37 },
    uNeonGlow: { value: def.glow ? 1.4 : 0 },
  }
  const metallic = def.id === 'arowana' ? 0.55 : def.pattern === 'scales' ? 0.25 : 0.05
  const body = new THREE.MeshStandardMaterial({ roughness: 0.34, metalness: metallic })
  body.onBeforeCompile = (shader) =>
    patchAquaShader(shader, {
      uniforms: bodyUniforms,
      vertexPars: BODY_VERTEX_PARS,
      vertexHook: BODY_VERTEX_HOOK,
      fragmentPars: BODY_FRAGMENT_PARS,
      fragmentColorHook: BODY_FRAGMENT_HOOK,
    })
  body.customProgramCacheKey = () => 'fish-body'

  const finUniforms = { ...uniforms, uFinGlow: { value: def.glow ? 0.5 : 0 } }
  const fin = new THREE.MeshStandardMaterial({
    color: finColorFor(def),
    roughness: 0.45,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: def.finStyle === 'veil' || def.finStyle === 'fan' ? 0.82 : 0.92,
  })
  fin.onBeforeCompile = (shader) =>
    patchAquaShader(shader, {
      uniforms: finUniforms,
      vertexPars: FIN_VERTEX_PARS,
      vertexHook: FIN_VERTEX_HOOK,
      fragmentPars: FIN_FRAGMENT_PARS,
      fragmentColorHook: FIN_FRAGMENT_HOOK,
    })
  fin.customProgramCacheKey = () => 'fish-fin'

  return { body, fin, uniforms }
}
