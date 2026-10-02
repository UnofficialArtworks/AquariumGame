import { requestPhoto } from '../scene/RenderBudget'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'

/** Snap the tank and download it as a PNG. */
export async function savePhoto() {
  const pushToast = useUIStore.getState().pushToast
  const dataUrl = await requestPhoto()
  if (!dataUrl) {
    pushToast('Could not save the aquarium photo', 'warn', '📸')
    return
  }
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `my-aquarium-${new Date().toISOString().slice(0, 10)}.png`
  link.click()
  useGameStore.getState().noteStat('photos')
  pushToast('Aquarium photo saved!', 'success', '📸')
}
