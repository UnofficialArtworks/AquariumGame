import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { AQUA_GLSL_COMMON, aquaUniforms } from './materials/aquaShader'
import { getBackgroundDef } from './backgrounds'
import { GLASS_THICKNESS, HALF_DEPTH, TANK_BOTTOM_Y, TANK_HEIGHT, TANK_WIDTH } from './TankBounds'

const PLANE_W = TANK_WIDTH + 0.1
const PLANE_H = TANK_HEIGHT - TANK_BOTTOM_Y + 0.1

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const fragmentShader = /* glsl */ `
  ${AQUA_GLSL_COMMON}
  uniform int uStyle;
  uniform float uAspect;
  varying vec2 vUv;
  varying vec3 vWorld;

  // GLSL smoothstep requires ascending edges. Invert the result for fades.
  float fade(float low, float high, float value) {
    return 1.0 - smoothstep(low, high, value);
  }

  float h1(float n) { return fract(sin(n) * 43758.5453); }
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p *= 2.02; a *= 0.5; }
    return s;
  }
  vec3 hex(float r, float g, float b) { return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }

  // Soft sunbeams fanning down from the top.
  float beams(vec2 p, float t) {
    float b = 0.0;
    b += pow(max(0.0, sin(p.x * 2.3 + p.y * 0.6 + sin(t * 0.2) * 0.5)), 12.0);
    b += pow(max(0.0, sin(p.x * 3.7 - p.y * 0.4 + 1.7 + sin(t * 0.17) * 0.4)), 16.0) * 0.7;
    return b * smoothstep(0.1, 1.0, p.y);
  }

  // Twinkling point lights in a grid of random cells.
  float sparkles(vec2 p, float scale, float t, float density) {
    vec2 g = floor(p * scale);
    vec2 f = fract(p * scale);
    float r = h21(g);
    if (r > density) return 0.0;
    vec2 c = vec2(h21(g + 3.1), h21(g + 7.7)) * 0.8 + 0.1;
    float d = length(f - c);
    float tw = 0.5 + 0.5 * sin(t * (1.0 + r * 4.0) + r * 60.0);
    return fade(0.0, 0.12, d) * tw;
  }

  vec3 ocean(vec2 p, vec2 uv, float t) {
    vec3 col = mix(hex(8.0, 48.0, 92.0), hex(52.0, 150.0, 205.0), pow(uv.y, 1.3));
    col += beams(p, t) * hex(120.0, 210.0, 255.0) * 0.35;
    float far = 0.28 + fbm(vec2(p.x * 0.8, 1.0)) * 0.22;
    col = mix(col, hex(20.0, 80.0, 125.0), fade(far - 0.01, far + 0.01, uv.y) * 0.8);
    float near = 0.16 + fbm(vec2(p.x * 1.4 + 9.0, 3.0)) * 0.18;
    col = mix(col, hex(12.0, 52.0, 88.0), fade(near - 0.01, near + 0.01, uv.y));
    return col;
  }

  vec3 reef(vec2 p, vec2 uv, float t) {
    vec3 col = mix(hex(10.0, 70.0, 130.0), hex(60.0, 195.0, 230.0), pow(uv.y, 1.1));
    col += beams(p, t) * hex(160.0, 235.0, 255.0) * 0.3;
    for (int layer = 0; layer < 3; layer++) {
      float fl = float(layer);
      float base = 0.42 - fl * 0.12;
      float h = base + (fbm(vec2(p.x * (2.0 + fl), fl * 7.0)) - 0.5) * 0.25
        + pow(fbm(vec2(p.x * 9.0 + fl * 3.0, fl)), 3.0) * 0.35;
      float mask = fade(h - 0.008, h + 0.008, uv.y);
      float hue = fbm(vec2(p.x * 1.3 + fl * 5.0, 2.0));
      vec3 coral = mix(hex(230.0, 90.0, 140.0), hex(255.0, 150.0, 80.0), smoothstep(0.35, 0.65, hue));
      coral = mix(coral, hex(150.0, 100.0, 220.0), smoothstep(0.6, 0.8, hue));
      coral *= 0.45 + fl * 0.25 + fbm(p * 14.0) * 0.3;
      col = mix(col, mix(coral, col, 0.55 - fl * 0.2), mask);
    }
    return col;
  }

  vec3 kelp(vec2 p, vec2 uv, float t) {
    vec3 col = mix(hex(10.0, 45.0, 35.0), hex(90.0, 190.0, 160.0), pow(uv.y, 1.2));
    col += beams(p, t) * hex(200.0, 255.0, 200.0) * 0.25;
    for (int layer = 0; layer < 2; layer++) {
      float fl = float(layer);
      float cols = 5.0 + fl * 3.0;
      float x = p.x * cols / uAspect * 1.6 + fl * 0.37;
      float id = floor(x);
      float fx = fract(x) - 0.5;
      float sway = sin(uv.y * 4.0 + t * (0.6 + h1(id) * 0.5) + id) * 0.18 * uv.y;
      float w = (0.07 + h1(id + 2.0) * 0.05) * (1.0 - uv.y * 0.4);
      float stalk = fade(w * 0.6, w, abs(fx - sway));
      float blades = fade(0.0, 0.25, abs(fx - sway - sin(uv.y * 30.0 + id) * 0.18)) * step(0.15, uv.y);
      float m = max(stalk, blades * 0.6) * step(uv.y, 0.95 - h1(id + 5.0) * 0.25);
      vec3 k = mix(hex(40.0, 110.0, 60.0), hex(15.0, 60.0, 30.0), fl);
      col = mix(col, k, m * (0.55 + fl * 0.35));
    }
    return col;
  }

  vec3 abyss(vec2 p, vec2 uv, float t) {
    vec3 col = mix(hex(1.0, 3.0, 10.0), hex(6.0, 20.0, 55.0), pow(uv.y, 1.8));
    col += hex(20.0, 60.0, 120.0) * fbm(p * 1.5 + t * 0.02) * 0.25;
    float s1 = sparkles(p + vec2(0.0, t * 0.01), 14.0, t, 0.35);
    float s2 = sparkles(p + vec2(t * 0.008, 0.0), 26.0, t * 1.3, 0.25);
    col += s1 * hex(80.0, 230.0, 255.0) * 2.5 + s2 * hex(200.0, 100.0, 255.0) * 1.8;
    return col;
  }

  vec3 sunset(vec2 p, vec2 uv, float t) {
    vec3 top = hex(255.0, 170.0, 95.0);
    vec3 mid = hex(210.0, 80.0, 120.0);
    vec3 bot = hex(55.0, 25.0, 95.0);
    vec3 col = mix(bot, mid, smoothstep(0.0, 0.55, uv.y));
    col = mix(col, top, smoothstep(0.5, 1.0, uv.y));
    vec2 sunC = vec2(uAspect * 0.62, 0.78);
    float d = length(p - sunC);
    col += hex(255.0, 220.0, 150.0) * fade(0.14, 0.16, d) * 1.4;
    col += hex(255.0, 150.0, 90.0) * exp(-d * 4.0) * 0.6;
    float bands = smoothstep(0.92, 1.0, sin(uv.y * 90.0 + sin(p.x * 3.0 + t * 0.5) * 2.0));
    col += bands * hex(255.0, 190.0, 120.0) * 0.25 * fade(0.2, 0.7, uv.y);
    float dunes = 0.12 + fbm(vec2(p.x * 1.2, 5.0)) * 0.12;
    col = mix(col, hex(40.0, 15.0, 55.0), fade(dunes - 0.01, dunes + 0.01, uv.y));
    return col;
  }

  vec3 space(vec2 p, vec2 uv, float t) {
    vec3 col = mix(hex(3.0, 2.0, 12.0), hex(30.0, 12.0, 70.0), uv.y);
    float neb = fbm(p * 1.3 + vec2(t * 0.01, 0.0));
    col += hex(220.0, 60.0, 170.0) * pow(neb, 3.0) * 1.2;
    col += hex(50.0, 120.0, 255.0) * pow(fbm(p * 2.1 + 7.0), 3.0) * 0.9;
    col += sparkles(p, 40.0, t * 2.0, 0.5) * vec3(1.8);
    col += sparkles(p + 3.3, 18.0, t, 0.22) * hex(255.0, 240.0, 200.0) * 2.5;
    vec2 pc = vec2(uAspect * 0.25, 0.68);
    vec2 q = p - pc;
    float pd = length(q);
    vec3 planet = mix(hex(255.0, 140.0, 70.0), hex(180.0, 60.0, 120.0), smoothstep(-0.15, 0.2, q.y + q.x * 0.3));
    planet *= 0.4 + 0.6 * fade(-0.1, 0.2, q.x + q.y);
    col = mix(col, planet, fade(0.195, 0.205, pd));
    vec2 rq = vec2(q.x, (q.y + q.x * 0.35) * 4.0);
    float ring = fade(0.0, 0.02, abs(length(rq) - 0.32)) * step(0.0, pd - 0.2 + step(0.0, rq.y) * 0.3);
    col += ring * hex(255.0, 210.0, 170.0) * 0.8;
    return col;
  }

  vec3 bubblegum(vec2 p, vec2 uv, float t) {
    vec3 col = mix(hex(170.0, 240.0, 225.0), hex(255.0, 190.0, 225.0), smoothstep(0.0, 0.7, uv.y));
    col = mix(col, hex(205.0, 180.0, 255.0), smoothstep(0.65, 1.0, uv.y));
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 q = p * (3.0 + fi * 2.0) + vec2(fi * 7.1, -t * (0.05 + fi * 0.03));
      vec2 g = floor(q);
      vec2 f = fract(q) - 0.5;
      float r = h21(g + fi);
      vec2 o = vec2(h21(g + 1.7), h21(g + 4.2)) - 0.5;
      float d = length(f - o * 0.4);
      float size = 0.12 + r * 0.22;
      float ring = fade(size - 0.03, size, d) - fade(size - 0.08, size - 0.03, d) * 0.7;
      col += ring * step(0.45, r) * vec3(1.0) * (0.25 - fi * 0.05);
    }
    col += sparkles(p, 22.0, t * 1.5, 0.2) * vec3(1.2, 1.1, 1.3);
    return col;
  }

  vec3 volcano(vec2 p, vec2 uv, float t) {
    vec3 col = mix(hex(20.0, 6.0, 5.0), hex(90.0, 30.0, 18.0), pow(uv.y, 0.9));
    float ridge = 0.35 + (fbm(vec2(p.x * 1.1, 2.0)) - 0.5) * 0.4 + max(0.0, 0.35 - abs(p.x - uAspect * 0.5)) * 1.2;
    float rock = fade(ridge - 0.01, ridge + 0.01, uv.y);
    vec3 rockCol = hex(30.0, 18.0, 16.0) * (0.6 + fbm(p * 8.0) * 0.6);
    float cracks = fade(0.0, 0.035, abs(fbm(p * 3.0 + vec2(0.0, t * 0.03)) - 0.5));
    vec3 lava = hex(255.0, 110.0, 20.0) * (2.5 + sin(t * 2.0 + p.x * 3.0) * 0.8);
    rockCol += lava * cracks * rock;
    col = mix(col, rockCol, rock);
    col += hex(255.0, 90.0, 30.0) * exp(-abs(uv.y - ridge) * 8.0) * 0.25;
    col += sparkles(p + vec2(0.0, -t * 0.08), 20.0, t * 3.0, 0.18) * hex(255.0, 150.0, 60.0) * 3.0 * (1.0 - rock);
    return col;
  }

  void main() {
    vec2 uv = clamp(vUv, 0.0, 1.0);
    vec2 p = vec2(uv.x * uAspect, uv.y);
    float t = uAquaTime;
    vec3 col;
    if (uStyle == 1) col = reef(p, uv, t);
    else if (uStyle == 2) col = kelp(p, uv, t);
    else if (uStyle == 3) col = abyss(p, uv, t);
    else if (uStyle == 4) col = sunset(p, uv, t);
    else if (uStyle == 5) col = space(p, uv, t);
    else if (uStyle == 6) col = bubblegum(p, uv, t);
    else if (uStyle == 7) col = volcano(p, uv, t);
    else col = ocean(p, uv, t);
    col = aquaApplyWater(col, vWorld);
    if (any(isnan(col))) col = vec3(0.0);
    gl_FragColor = vec4(clamp(col, 0.0, 48.0), 1.0);
  }
`

/** Printed-style scenic backdrop stuck to the outside of the back glass. */
export function Background({ backgroundId }: { backgroundId: string }) {
  const def = getBackgroundDef(backgroundId)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          ...aquaUniforms,
          uStyle: { value: def.style },
          uAspect: { value: PLANE_W / PLANE_H },
        },
      }),
    [def.style],
  )

  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh
      position={[0, TANK_BOTTOM_Y + PLANE_H / 2 - 0.05, -HALF_DEPTH - GLASS_THICKNESS / 2 - 0.02]}
      material={material}
    >
      <planeGeometry args={[PLANE_W, PLANE_H]} />
    </mesh>
  )
}
