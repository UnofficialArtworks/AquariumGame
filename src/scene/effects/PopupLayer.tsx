import { Html } from '@react-three/drei'
import { usePopupStore } from '../../sim/popups'

/** Floating "+5" / "Rainbow!" labels anchored in the tank; CSS handles the float-and-fade. */
export function PopupLayer() {
  const popups = usePopupStore((s) => s.popups)
  return (
    <>
      {popups.map((p) => (
        <Html key={p.id} position={p.position} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <div className={`popup ${p.big ? 'popup-big' : ''}`} style={{ color: p.color }}>
            {p.text}
          </div>
        </Html>
      ))}
    </>
  )
}
