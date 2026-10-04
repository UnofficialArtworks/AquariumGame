// Fingers on the screen right now. Two at once means "move the camera", so
// tools, food and dragging all stand down while a second finger is down.
// Listening on the window's capture phase keeps the count up to date before
// any canvas or 3D handler sees the same touch.

const active = new Set<number>()
const listeners = new Set<(count: number) => void>()

export const touches = {
  get count() {
    return active.size
  },
}

/** Hear about fingers landing and lifting. Returns an unsubscribe. */
export function onTouchCount(listener: (count: number) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener(active.size)
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return
      active.add(e.pointerId)
      notify()
    },
    true,
  )
  const lift = (e: PointerEvent) => {
    if (active.delete(e.pointerId)) notify()
  }
  window.addEventListener('pointerup', lift, true)
  window.addEventListener('pointercancel', lift, true)
}
