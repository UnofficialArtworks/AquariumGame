import { useEffect, useRef, type CSSProperties } from 'react'
import { useGameStore } from '../../state/useGameStore'
import { useUIStore, type DockTab } from '../../state/useUIStore'
import { ESCAPE_LAYER, useEscape } from '../escape'
import { algaeCoverage } from '../../sim/algae'
import { levelFromXp } from '../../state/progression'
import { newShopCount } from '../../state/rules'
import { CleanDrawer, DecorateDrawer, FeedDrawer, ShopDrawer, WatchDrawer } from './drawers'
import { screenInsets } from '../screenInsets'

const TABS: Array<{ id: DockTab; icon: string; label: string }> = [
  { id: 'view', icon: '👀', label: 'Watch' },
  { id: 'feed', icon: '🍤', label: 'Feed' },
  { id: 'clean', icon: '🧽', label: 'Clean' },
  { id: 'decorate', icon: '🪸', label: 'Decorate' },
  { id: 'shop', icon: '🛍️', label: 'Shop' },
]

function DrawerContent({ tab }: { tab: DockTab }) {
  switch (tab) {
    case 'feed':
      return <FeedDrawer />
    case 'clean':
      return <CleanDrawer />
    case 'decorate':
      return <DecorateDrawer />
    case 'shop':
      return <ShopDrawer />
    default:
      return <WatchDrawer />
  }
}

/** Little count / alert bubbles on the dock buttons. */
function useBadges() {
  const hungry = useGameStore((s) => {
    let n = 0
    for (const f of s.ownedFish) if (f.habitat === 'main' && (s.fishVitals[f.id]?.hunger ?? 0) > 0.65) n++
    return n
  })
  const dirty = useGameStore((s) => s.murk > 0.4 || s.waste.length >= 6 || algaeCoverage() > 0.4)
  // Things unlocked since the player last browsed the shop.
  const fresh = useGameStore((s) => newShopCount(s.seen.shopLevel, levelFromXp(s.xp).level))
  return {
    feed: hungry > 0 ? String(hungry) : null,
    clean: dirty ? '!' : null,
    shop: fresh > 0 ? (fresh > 9 ? '9+' : String(fresh)) : null,
  } as Partial<Record<DockTab, string | null>>
}

/**
 * The bottom dock: five big buttons, each with its own drawer that slides up
 * above the bar like a folder tab. Tapping the active button (or Hide) tucks
 * the drawer away to give the tank the whole screen.
 */
export function Dock() {
  const dock = useUIStore((s) => s.dock)
  const trayOpen = useUIStore((s) => s.trayOpen)
  const openDock = useUIStore((s) => s.openDock)
  const setTrayOpen = useUIStore((s) => s.setTrayOpen)
  // Get the drawer out of the way while a decoration is being dragged.
  const dragging = useUIStore((s) => s.draggingId !== null)
  const badges = useBadges()
  const open = trayOpen && !dragging
  useEscape(() => setTrayOpen(false), ESCAPE_LAYER.drawer, open)
  const index = Math.max(0, TABS.findIndex((t) => t.id === dock))
  const active = TABS[index]
  const dockRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLElement>(null)

  // Tell the camera how much of the screen the dock covers right now.
  useEffect(() => {
    const dockEl = dockRef.current
    const barEl = barRef.current
    if (!dockEl || !barEl) return
    const measure = () => {
      const gap = window.innerHeight - dockEl.getBoundingClientRect().bottom
      screenInsets.bottom = dockEl.offsetHeight + gap
      screenInsets.bar = barEl.offsetHeight + gap
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(dockEl)
    observer.observe(barEl)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={dockRef} className={`dock ${open ? 'is-open' : ''}`} data-tab={dock} style={{ '--tab-index': index, '--tab-count': TABS.length } as CSSProperties}>
      <div className="drawer-shell" aria-hidden={!open} inert={!open}>
        <section className="drawer" aria-label={`${active.label} panel`}>
          <button className="drawer-hide" onClick={() => setTrayOpen(false)} aria-label="Hide panel">
            Hide <span aria-hidden>▾</span>
          </button>
          <div className="drawer-scroll">
            <DrawerContent tab={dock} />
          </div>
        </section>
      </div>
      <nav ref={barRef} className="dock-bar" aria-label="Game modes">
        {TABS.map((tab) => {
          const isActive = tab.id === dock
          const badge = badges[tab.id]
          return (
            <button
              key={tab.id}
              className={`dock-btn ${isActive ? 'is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-expanded={isActive ? open : undefined}
              onClick={() => openDock(tab.id)}
              title={isActive ? (open ? `Hide ${tab.label}` : `Show ${tab.label}`) : tab.label}
            >
              <span className="dock-icon" aria-hidden>
                {tab.icon}
              </span>
              <span className="dock-label">{tab.label}</span>
              {isActive && <span className="dock-caret" aria-hidden>{open ? '▾' : '▴'}</span>}
              {badge && <span className={`dock-badge ${badge === '!' ? 'is-alert' : ''}`}>{badge}</span>}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
