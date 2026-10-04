import { create } from 'zustand'
import { DECORATION_CATALOG } from '../scene/decorations/decorationDefinitions'
import { FISH_CATALOG } from '../scene/fish/fishDefinitions'
import type { MorphId, PatternType } from './types'

export type PreviewKind = 'decoration' | 'fish' | 'visitor'

export interface PreviewTarget {
  key: string
  kind: PreviewKind
  /** Catalog id (a visitor's id for visitors). */
  defId: string
  /** Fish only: render in a rare morph's colours. */
  morph?: MorphId
  /** Fish only: render wearing this pattern. */
  pattern?: PatternType
  /** Fish only: its own colours instead of its species' usual ones. */
  palette?: FishPalette
  /** Fish only: a side-on portrait (for creatures swimming across a scene) instead of the shop's three-quarter view. */
  view?: 'side'
}

export interface FishPalette {
  color: string
  color2: string
  color3?: string
}

/** Thumbnail key for a visitor. */
export function visitorPreviewKey(id: string): string {
  return `visitor~${id}`
}

/** Thumbnail key for a species, one of its morphs or patterns, or a fish in its own colours. */
export function fishPreviewKey(defId: string, morph?: MorphId, pattern?: PatternType, palette?: FishPalette): string {
  // A morph's colours cover the palette, so it doesn't change the picture.
  const colours = palette && !morph ? `~c-${palette.color}${palette.color2}${palette.color3 ?? ''}`.replace(/#/g, '') : ''
  return `${defId}${morph ? `~${morph}` : ''}${pattern ? `~p-${pattern}` : ''}${colours}`
}

function buildQueue(): PreviewTarget[] {
  return [
    ...DECORATION_CATALOG.map((d): PreviewTarget => ({ key: d.id, kind: 'decoration', defId: d.id })),
    ...FISH_CATALOG.map((f): PreviewTarget => ({ key: f.id, kind: 'fish', defId: f.id })),
  ]
}

interface PreviewState {
  images: Record<string, string>
  queue: PreviewTarget[]
  setImage: (key: string, dataUrl: string) => void
  advanceQueue: () => void
  /** Queue extra thumbnails (e.g. morphs for the Fishpedia) unless already made or queued; `first` puts them next in line. */
  requestPreviews: (targets: PreviewTarget[], first?: boolean) => void
}

/**
 * Non-persisted, in-memory cache of one small snapshot PNG per shop item,
 * rendered once per session by ItemPreviewGenerator. Regenerating each load
 * is cheap (a couple dozen tiny offscreen renders) so nothing here is saved
 * to localStorage.
 */
export const usePreviewStore = create<PreviewState>()((set) => ({
  images: {},
  queue: buildQueue(),
  setImage: (key, dataUrl) => set((s) => ({ images: { ...s.images, [key]: dataUrl } })),
  advanceQueue: () => set((s) => ({ queue: s.queue.slice(1) })),
  requestPreviews: (targets, first = false) =>
    set((s) => {
      const queued = new Set(s.queue.map((t) => t.key))
      const fresh = targets.filter((t) => !s.images[t.key] && !queued.has(t.key))
      if (!fresh.length) return s
      // The head of the queue may be mid-capture, so jump in just behind it.
      return { queue: first ? [...s.queue.slice(0, 1), ...fresh, ...s.queue.slice(1)] : [...s.queue, ...fresh] }
    }),
}))
