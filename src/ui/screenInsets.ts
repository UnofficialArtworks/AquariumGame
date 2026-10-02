/**
 * How much of the screen the HUD covers, in CSS pixels. The dock writes it as
 * its drawer opens and closes; the camera reads it to keep the tank framed in
 * the space that's still visible.
 */
export const screenInsets = {
  top: 64,
  /** Dock height including an open drawer. */
  bottom: 84,
  /** Dock height with the drawer closed (the default framing). */
  bar: 84,
}
