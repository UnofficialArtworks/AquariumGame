import { requestPhoto } from '../scene/RenderBudget'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { beautyOf } from '../state/beauty'

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

function download(dataUrl: string, name: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name
  link.click()
}

/** A framed photo with the tank's name, beauty stars and headcount underneath, for sharing. */
export async function savePhotoCard() {
  const pushToast = useUIStore.getState().pushToast
  const shot = await requestPhoto()
  const img = new Image()
  if (shot) img.src = shot
  const ok = shot && (await img.decode().then(() => true, () => false))
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')
  if (!ok || !g) {
    pushToast('Could not make the photo card', 'warn', '🖼️')
    return
  }
  const s = useGameStore.getState()
  const scale = Math.min(1, 1600 / img.width)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const pad = Math.round(w * 0.025)
  const band = Math.round(w * 0.11)
  canvas.width = w + pad * 2
  canvas.height = h + pad * 2 + band
  const bg = g.createLinearGradient(0, 0, 0, canvas.height)
  bg.addColorStop(0, '#0f4a6b')
  bg.addColorStop(1, '#071d33')
  g.fillStyle = bg
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.save()
  g.beginPath()
  g.roundRect(pad, pad, w, h, pad * 0.8)
  g.clip()
  g.drawImage(img, pad, pad, w, h)
  g.restore()
  const font = getComputedStyle(document.body).fontFamily
  const stars = beautyOf(s.placedDecorations).stars
  const fish = s.ownedFish.filter((f) => f.habitat === 'main').length
  const y = h + pad + band * 0.48
  g.fillStyle = '#ffffff'
  g.textBaseline = 'middle'
  g.font = `900 ${Math.round(band * 0.36)}px ${font}`
  g.fillText(s.aquariumName, pad * 1.4, y)
  g.font = `800 ${Math.round(band * 0.22)}px ${font}`
  g.fillStyle = 'rgba(236, 251, 255, 0.75)'
  g.fillText(`${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}  ·  ${fish} fish  ·  ${s.placedDecorations.length} decorations`, pad * 1.4, y + band * 0.34)
  g.textAlign = 'right'
  g.fillText('🐠 Aquarium', w + pad * 0.6, y)
  download(canvas.toDataURL('image/png'), `${s.aquariumName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'my-aquarium'}-card.png`)
  s.noteStat('photos')
  pushToast('Photo card saved!', 'success', '🖼️')
}
