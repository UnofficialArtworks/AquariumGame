import { useRef, useState, type PointerEvent } from 'react'
import { cameraBridge } from '../scene/CameraRig'

/** Radians of turn per pixel dragged. */
const TURN_SPEED = 0.008

/**
 * On touch screens: a round pad above the dock that turns the camera when
 * dragged, whatever tool or food is in hand, and glides back to the starting
 * view when tapped.
 */
export function CameraPad() {
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const [active, setActive] = useState(false)

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    setActive(true)
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    // The same way round as dragging the tank itself.
    cameraBridge.orbit(-dx * TURN_SPEED, -dy * TURN_SPEED)
    d.x = e.clientX
    d.y = e.clientY
  }
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.moved) cameraBridge.home()
    drag.current = null
    setActive(false)
  }

  return (
    <button
      className={`camera-pad ${active ? 'is-active' : ''}`}
      aria-label="Camera: drag to look around the tank, tap to reset the view"
      title="Drag to look around · tap to reset"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => e.detail === 0 && cameraBridge.home()}
    >
      <svg viewBox="0 0 32 32" aria-hidden>
        <ellipse cx="16" cy="16" rx="12.5" ry="5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="30 6" />
        <path d="M26.5 9.6 l2.4 2.2 -3.1 1.1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 22.4 l-2.4 -2.2 3.1 -1.1" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="16" r="4.2" fill="currentColor" />
      </svg>
    </button>
  )
}
