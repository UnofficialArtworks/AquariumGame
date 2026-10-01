import { create } from 'zustand'

export interface Popup {
  id: number
  position: [number, number, number]
  text: string
  color: string
  big: boolean
}

interface PopupState {
  popups: Popup[]
  spawn: (position: [number, number, number], text: string, color?: string, big?: boolean) => void
  remove: (id: number) => void
}

let seq = 1
const MAX_POPUPS = 14

/** Floating "+5" style labels anchored to spots in the tank. */
export const usePopupStore = create<PopupState>()((set, get) => ({
  popups: [],
  spawn: (position, text, color = '#ffe066', big = false) => {
    const id = seq++
    set({ popups: [...get().popups.slice(-(MAX_POPUPS - 1)), { id, position, text, color, big }] })
    setTimeout(() => get().remove(id), 1500)
  },
  remove: (id) => set({ popups: get().popups.filter((p) => p.id !== id) }),
}))

export function spawnPopup(position: { x: number; y: number; z: number }, text: string, color?: string, big?: boolean) {
  usePopupStore.getState().spawn([position.x, position.y, position.z], text, color, big)
}
