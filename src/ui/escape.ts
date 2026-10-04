import { useEffect, useRef } from 'react'

// Escape closes whatever is on top: relax mode, then a pop-up, then the fish
// card, then an open drawer. Each window registers with a layer; the highest
// layer closes first (and within a layer, the newest).

export const ESCAPE_LAYER = { drawer: 1, card: 2, modal: 3, relax: 4 } as const

interface Entry {
  layer: number
  close: { current: () => void }
}

const entries: Entry[] = []

function isTextField(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && (el.isContentEditable || el.matches('input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select'))
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
  // The first press just leaves a text box (a search box clears itself first).
  if (isTextField(e.target)) {
    if (!(e.target instanceof HTMLInputElement && e.target.type === 'search' && e.target.value)) e.target.blur()
    return
  }
  let top: Entry | undefined
  for (const entry of entries) if (!top || entry.layer >= top.layer) top = entry
  if (!top) return
  e.preventDefault()
  top.close.current()
}

/** Let Escape close this window while it's `active`. */
export function useEscape(close: () => void, layer: number, active = true) {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!active) return
    const entry: Entry = { layer, close: latest }
    if (entries.length === 0) window.addEventListener('keydown', onKey)
    entries.push(entry)
    return () => {
      entries.splice(entries.indexOf(entry), 1)
      if (entries.length === 0) window.removeEventListener('keydown', onKey)
    }
  }, [layer, active])
}
