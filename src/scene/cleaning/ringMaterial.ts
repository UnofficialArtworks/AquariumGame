import * as THREE from 'three'

/**
 * Flat marker ring with a dark outline around a bright band, so it reads on
 * pale sand and dark gravel alike (additive rings vanish on bright sand).
 * Works on plain meshes and InstancedMeshes; drawn on top of the gravel.
 */
export function makeRingMaterial(color: THREE.ColorRepresentation, inner: number, outer: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    vertexShader: /* glsl */ `
      uniform float uInner;
      uniform float uOuter;
      varying float vT;
      void main() {
        vT = (length(position.xz) - uInner) / (uOuter - uInner);
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vT;
      void main() {
        float t = clamp(vT, 0.0, 1.0);
        float band = smoothstep(0.22, 0.42, t) * (1.0 - smoothstep(0.58, 0.78, t));
        float shape = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.88, 1.0, t));
        vec3 col = mix(vec3(0.02, 0.05, 0.04), uColor * 1.15, band);
        gl_FragColor = vec4(col, shape * mix(0.45, 0.95, band) * uOpacity);
      }
    `,
  })
}
