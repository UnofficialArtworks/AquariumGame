import { Fragment } from 'react'
import coinUrl from '../assets/coin.svg'

/** The game's gold coin. Emoji coins look different on every device (silver on some), so money always uses this. */
export function Coin({ className = '' }: { className?: string }) {
  return <img className={`coin-icon ${className}`} src={coinUrl} alt="" aria-hidden draggable={false} />
}

/** An icon glyph that swaps the 🪙 emoji for the game's own coin. */
export function Glyph({ icon }: { icon: string }) {
  return icon === '🪙' ? <Coin /> : <>{icon}</>
}

/** Text with every 🪙 drawn as the game's own coin. */
export function CoinText({ text }: { text: string }) {
  const parts = text.split('🪙')
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <Coin />}
          {part}
        </Fragment>
      ))}
    </>
  )
}
