import { Color } from 'three'

/**
 * Lightens (positive amount) or darkens (negative amount) a color in HSL
 * space, by `amount` of lightness (0..1). Used to fake shading/two-tone
 * detail (a lighter belly, a darker crevice) without needing any textures.
 */
export function shade(hex: string, amount: number): string {
  const color = new Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  color.setHSL(hsl.h, hsl.s, clamp01(hsl.l + amount))
  return `#${color.getHexString()}`
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
