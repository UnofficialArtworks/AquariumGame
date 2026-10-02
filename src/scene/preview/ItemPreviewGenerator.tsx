import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { usePreviewStore, type PreviewKind } from '../../state/usePreviewStore'
import { getDecorationDef } from '../decorations/decorationDefinitions'
import { DecorationVisual } from '../decorations/DecorationVisual'
import { getFishDef } from '../fish/fishDefinitions'
import { FishBody } from '../fish/FishBody'
import { JellyfishVisual } from '../creatures/Jellyfish'
import { SeahorseVisual } from '../creatures/Seahorse'
import { AxolotlVisual } from '../creatures/Axolotl'
import { SnailVisual } from '../creatures/Snail'
import { ShrimpVisual } from '../creatures/Shrimp'
import { OctopusVisual } from '../creatures/Octopus'
import { MantaRayVisual } from '../creatures/MantaRay'
import { SeaTurtleVisual } from '../creatures/SeaTurtle'
import { PreviewContext } from '../decorations/decorationHooks'
import { aquaUniforms } from '../materials/aquaShader'
import { morphedDefinition } from '../../state/morphs'
import type { MorphId, PatternType } from '../../state/types'
import { getVisitor } from '../../state/visitors'
import { VisitorVisual } from '../visitors/VisitorVisual'

const PREVIEW_PIXELS = 160
const VIEW_DIRECTION = new THREE.Vector3(0.6, 0.55, 1).normalize()

function TargetContent({ defId, kind, morph, pattern }: { defId: string; kind: PreviewKind; morph?: MorphId; pattern?: PatternType }) {
  if (kind === 'visitor') {
    const visitor = getVisitor(defId)
    return visitor ? <VisitorVisual visitor={visitor} /> : null
  }
  if (kind === 'fish') {
    const species = getFishDef(defId)
    if (!species) return null
    const def = morphedDefinition(pattern ? { ...species, pattern } : species, morph)
    if (def.kind === 'jellyfish') return <JellyfishVisual def={def} />
    if (def.kind === 'seahorse') return <SeahorseVisual def={def} />
    if (def.kind === 'axolotl') return <AxolotlVisual def={def} />
    if (def.kind === 'snail') return <SnailVisual def={def} />
    if (def.kind === 'shrimp') return <ShrimpVisual def={def} />
    if (def.kind === 'octopus') return <OctopusVisual def={def} />
    if (def.kind === 'ray') return <MantaRayVisual def={def} />
    if (def.kind === 'turtle') return <SeaTurtleVisual def={def} />
    return <FishBody def={def} />
  }
  const def = getDecorationDef(defId)
  if (!def) return null
  return <DecorationVisual def={def} />
}

/** Frame and capture a thumbnail with isolated lighting, then restore tank uniforms. */
function CaptureRig({ defId, kind, morph, pattern, onCaptured }: { defId: string; kind: PreviewKind; morph?: MorphId; pattern?: PatternType; onCaptured: (dataUrl: string) => void }) {
  const contentRef = useRef<THREE.Group>(null)
  const captured = useRef(false)
  const { gl, camera, scene } = useThree()

  // A positive priority owns this canvas's render, so the uniform override is
  // restored synchronously before the main tank can render another frame.
  useFrame(() => {
    const group = contentRef.current
    if (captured.current || !group) return
    const box = new THREE.Box3().setFromObject(group)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const persp = camera as THREE.PerspectiveCamera
    const distance = Math.max((sphere.radius / Math.sin((persp.fov * Math.PI) / 360)) * 1.45, 0.4)
    camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, distance)
    camera.lookAt(sphere.center)
    persp.updateProjectionMatrix()
    const density = aquaUniforms.uWaterDensity.value
    const caustics = aquaUniforms.uCausticStrength.value
    const glow = aquaUniforms.uGlowBoost.value
    let dataUrl: string
    try {
      aquaUniforms.uWaterDensity.value = 0
      aquaUniforms.uCausticStrength.value = 0
      aquaUniforms.uGlowBoost.value = 1
      gl.render(scene, camera)
      dataUrl = gl.domElement.toDataURL('image/png')
    } finally {
      aquaUniforms.uWaterDensity.value = density
      aquaUniforms.uCausticStrength.value = caustics
      aquaUniforms.uGlowBoost.value = glow
    }
    captured.current = true
    onCaptured(dataUrl)
  }, 1)

  return <group ref={contentRef}><TargetContent defId={defId} kind={kind} morph={morph} pattern={pattern} /></group>
}

function PreviewScene() {
  const queue = usePreviewStore((s) => s.queue)
  const setImage = usePreviewStore((s) => s.setImage)
  const advanceQueue = usePreviewStore((s) => s.advanceQueue)
  const current = queue[0]

  if (!current) return null

  return (
    <>
      <hemisphereLight args={['#dfeff5', '#44607a', 1.1]} />
      <directionalLight position={[2, 3, 2]} intensity={1.2} />
      <CaptureRig
        key={current.key}
        defId={current.defId}
        kind={current.kind}
        morph={current.morph}
        pattern={current.pattern}
        onCaptured={(dataUrl) => {
          setImage(current.key, dataUrl)
          advanceQueue()
        }}
      />
    </>
  )
}

/**
 * Mounted once near the app root. Renders each shop catalog item off-screen,
 * one at a time, into a hidden canvas and caches a snapshot PNG for
 * ShopItemCard to use — static images instead of live 3D previews, so the
 * shop stays cheap to render once everything's captured. Unmounts its own
 * canvas (freeing the extra WebGL context) once the queue is empty.
 */
export function ItemPreviewGenerator() {
  const hasPending = usePreviewStore((s) => s.queue.length > 0)

  if (!hasPending) return null

  return (
    <div style={{ position: 'fixed', left: '-9999px', top: 0, width: PREVIEW_PIXELS, height: PREVIEW_PIXELS }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true, toneMapping: THREE.NeutralToneMapping }}
        camera={{ fov: 32 }}
      >
        <PreviewContext.Provider value={true}>
          <PreviewScene />
        </PreviewContext.Provider>
      </Canvas>
    </div>
  )
}
