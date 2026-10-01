import * as THREE from 'three'

export type StatusIcon = 'hungry' | 'sleep' | 'love' | 'starving'

const cache = new Map<StatusIcon, THREE.CanvasTexture>()

const EMOJI: Record<StatusIcon, string> = {
  hungry: '🍤',
  starving: '🍤',
  sleep: '💤',
  love: '💖',
}

/** Little thought-bubble icons drawn once into canvas textures and shared by every fish. */
export function statusTexture(icon: StatusIcon): THREE.CanvasTexture {
  const existing = cache.get(icon)
  if (existing) return existing
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  if (icon !== 'sleep' && icon !== 'love') {
    ctx.fillStyle = icon === 'starving' ? 'rgba(255, 120, 110, 0.95)' : 'rgba(255, 255, 255, 0.92)'
    ctx.beginPath()
    ctx.arc(64, 56, 44, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(48, 92)
    ctx.lineTo(40, 118)
    ctx.lineTo(66, 98)
    ctx.fill()
  }
  ctx.font = '56px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(EMOJI[icon], 64, icon === 'sleep' || icon === 'love' ? 64 : 58)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  cache.set(icon, texture)
  return texture
}
