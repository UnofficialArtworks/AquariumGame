import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { currentTrackName, nextTrack, subscribeMusic } from '../audio/music'
import { useGameStore } from '../state/useGameStore'
import { useUIStore, type DockTab } from '../state/useUIStore'
import { levelFromXp, MAX_LEVEL } from '../state/progression'
import { getFishDef } from '../scene/fish/fishDefinitions'
import { inheritedDefinition } from '../state/nursery'
import { firstNewShopCategory, friendshipReady, newHatchlings, transferProblem } from '../state/rules'
import { getMorph, speciesLabel } from '../state/morphs'
import { getFoodDef } from '../scene/food/foodDefinitions'
import { getDecorationDef } from '../scene/decorations/decorationDefinitions'
import type { FishInstance } from '../state/types'
import { algaeCoverage } from '../sim/algae'
import { savePhoto } from './photo'
import { Button } from './components/Button'
import { getVisitor, visitorName } from '../state/visitors'
import { ShareTank } from './ShareTank'
import { hasFavorite, hasPersonality, personalityOf, SCHOOL_SIZE, schoolSize, TRAITS } from '../state/personality'
import { beautyOf } from '../state/beauty'
import { endVisit } from '../app/visit'
import { Coin, CoinText, Glyph } from './Coin'
import { Modal } from './components/Modal'
import { Dock } from './dock/Dock'
import { Fishpedia } from './Fishpedia'
import { Goals } from './Goals'
import { claimableCount } from '../state/goals'
import { screenInsets } from './screenInsets'

/** Open a dock tab and make sure its drawer is showing. */
function showDock(tab: DockTab) {
  const ui = useUIStore.getState()
  if (ui.dock === tab) ui.setTrayOpen(true)
  else ui.openDock(tab)
}

// --- top bar ---------------------------------------------------------------------

function AquariumName() {
  const aquariumName = useGameStore((s) => s.aquariumName)
  const renameAquarium = useGameStore((s) => s.renameAquarium)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(aquariumName)
  const cancelBlur = useRef(false)
  const save = () => {
    renameAquarium(draft)
    setEditing(false)
  }
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        🐠
      </span>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <input
            autoFocus
            aria-label="Aquarium name"
            maxLength={28}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (cancelBlur.current) cancelBlur.current = false
              else save()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                cancelBlur.current = true
                setDraft(aquariumName)
                setEditing(false)
              }
            }}
          />
        </form>
      ) : (
        <button
          className="brand-name"
          title="Rename your aquarium"
          onClick={() => {
            cancelBlur.current = false
            setDraft(aquariumName)
            setEditing(true)
          }}
        >
          <strong>{aquariumName || 'My Aquarium'}</strong>
          <span className="brand-edit" aria-hidden>
            ✎
          </span>
        </button>
      )}
    </div>
  )
}

function TankSwitch() {
  const activeTank = useUIStore((s) => s.activeTank)
  const eggs = useGameStore((s) => s.nurseryEggs.length)
  const hatchlings = useGameStore(newHatchlings)
  const ready = useGameStore(friendshipReady)
  // Looking in the nursery counts as having seen its new babies.
  useEffect(() => {
    if (activeTank === 'nursery') useGameStore.getState().markNurserySeen()
  }, [activeTank, hatchlings])
  const go = (tank: 'main' | 'nursery') => {
    const ui = useUIStore.getState()
    if (ui.activeTank === tank) return
    ui.setActiveTank(tank)
    // The nursery's controls live in the Watch drawer, so show it.
    ui.setTrayOpen(tank === 'nursery')
  }
  return (
    <div className="tank-switch" role="tablist" aria-label="Which tank">
      <button role="tab" aria-selected={activeTank === 'main'} className={activeTank === 'main' ? 'is-active' : ''} onClick={() => go('main')}>
        <span aria-hidden>🐠</span> Aquarium
      </button>
      <button role="tab" aria-selected={activeTank === 'nursery'} className={activeTank === 'nursery' ? 'is-active' : ''} onClick={() => go('nursery')}>
        <span aria-hidden>🫧</span> Nursery
        {hatchlings > 0 ? (
          <em className="pip is-new" title={`${hatchlings} new hatchling${hatchlings === 1 ? '' : 's'}`}>{hatchlings}</em>
        ) : ready && activeTank !== 'nursery' ? (
          <em className="pip is-ready" title="Two grown fish are ready to become friends">♥</em>
        ) : (
          eggs > 0 && <em className="pip" title={`${eggs} egg${eggs === 1 ? '' : 's'}`}>{eggs}</em>
        )}
      </button>
    </div>
  )
}

let gainSeq = 0

function Coins() {
  const coins = useGameStore((s) => Math.floor(s.currency))
  // Every coin sound ends up here, so the wallet shows a "+N" for whatever just came in.
  const [seen, setSeen] = useState(coins)
  const [gain, setGain] = useState<{ id: number; amount: number } | null>(null)
  if (coins !== seen) {
    // Skip the jump when the save loads in.
    if (coins > seen && performance.now() > 2500) setGain({ id: ++gainSeq, amount: (gain?.amount ?? 0) + coins - seen })
    setSeen(coins)
  }
  return (
    <div className={`stat-pill coins ${gain ? 'is-gaining' : ''}`} title="Coins">
      <Coin className="coin" />
      {/* Re-keyed so the number gives a little hop whenever it changes. */}
      <strong key={coins}>{coins.toLocaleString()}</strong>
      {gain && (
        <span key={gain.id} className="coin-gain" aria-hidden onAnimationEnd={() => setGain(null)}>
          +{gain.amount.toLocaleString()}
        </span>
      )}
    </div>
  )
}

function Level() {
  const xp = useGameStore((s) => s.xp)
  const p = levelFromXp(xp)
  const pct = p.level === MAX_LEVEL ? 1 : p.into / p.needed
  return (
    <div className="stat-pill level" title={p.level === MAX_LEVEL ? 'Max level!' : `${p.into} / ${p.needed} XP to level ${p.level + 1}`}>
      <span className="level-ring" style={{ '--p': pct } as CSSProperties}>
        <b>{p.level}</b>
      </span>
      <span className="level-label">Level</span>
    </div>
  )
}

/** Music and sound effects, each with its own switch. */
function SoundMenu() {
  const { sound, music } = useGameStore((s) => s.settings)
  const setSetting = useGameStore((s) => s.setSetting)
  const [open, setOpen] = useState(false)
  const trackName = useSyncExternalStore(subscribeMusic, currentTrackName)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="sound-menu" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="Music and sound">
        {sound || music ? '🔊' : '🔇'}
      </button>
      {open && (
        <div className="sound-pop" role="menu">
          <label className="switch-row">
            <span>🎵 Music</span>
            <input type="checkbox" role="switch" checked={music} onChange={() => setSetting('music', !music)} />
          </label>
          {music && (
            <div className="now-playing">
              <span>
                <small>Now playing</small>
                {trackName}
              </span>
              <button className="icon-btn icon-btn-sm" onClick={nextTrack} title="Next track" aria-label="Next track">
                ⏭
              </button>
            </div>
          )}
          <label className="switch-row">
            <span>🔔 Sound effects</span>
            <input type="checkbox" role="switch" checked={sound} onChange={() => setSetting('sound', !sound)} />
          </label>
        </div>
      )}
    </div>
  )
}

function TopActions() {
  const night = useUIStore((s) => s.night)
  const toggleNight = useUIStore((s) => s.toggleNight)
  const news = useUIStore((s) => s.fishpediaNews)
  const goals = useGameStore(claimableCount) + useUIStore((s) => s.goalsNews)
  return (
    <div className="icon-group">
      <button className="icon-btn" onClick={() => useUIStore.getState().openFishpedia()} title="Fishpedia: your collection book">
        📖
        {news > 0 && <span className="icon-badge">{news > 9 ? '9+' : news}</span>}
      </button>
      <button className="icon-btn" onClick={() => useUIStore.getState().openGoals()} title="Goals: today's wishes and your trophies">
        ⭐{goals > 0 && <span className="icon-badge">{goals > 9 ? '9+' : goals}</span>}
      </button>
      <button className="icon-btn" onClick={toggleNight} aria-pressed={night} title={night ? 'Lights on (until the clock reaches morning or evening)' : 'Lights down for the night (until the clock reaches morning or evening)'}>
        {night ? '☀️' : '🌙'}
      </button>
      <SoundMenu />
      <button className="icon-btn photo-btn" onClick={savePhoto} title="Save a photo of your aquarium">
        📸
      </button>
    </div>
  )
}

function TopBar() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      screenInsets.top = el.offsetHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <header ref={ref} className="topbar">
      <AquariumName />
      <TankSwitch />
      <div className="topbar-right">
        <Coins />
        <Level />
        <TopActions />
      </div>
    </header>
  )
}

// --- tank health gauges ----------------------------------------------------------

function Gauge({ icon, label, text, value, onClick }: { icon: string; label: string; text: string; value: number; onClick: () => void }) {
  const v = Math.max(0, Math.min(1, value))
  const tone = v > 0.65 ? 'bad' : v > 0.35 ? 'warn' : 'good'
  return (
    <button className={`gauge gauge-${tone}`} onClick={onClick} title={`${label}: ${text}`} style={{ '--v': v } as CSSProperties}>
      <span className="gauge-ring">
        <span aria-hidden>{icon}</span>
      </span>
      <span className="gauge-copy">
        <small>{label}</small>
        <strong>{text}</strong>
      </span>
    </button>
  )
}

/** At-a-glance tank health. Each gauge jumps straight to the fix. */
function CareGauges() {
  const total = useGameStore((s) => s.ownedFish.filter((f) => f.habitat === 'main').length)
  const hungry = useGameStore((s) => {
    let n = 0
    for (const f of s.ownedFish) if (f.habitat === 'main' && (s.fishVitals[f.id]?.hunger ?? 0) > 0.65) n++
    return n
  })
  const murk = useGameStore((s) => s.murk)
  const waste = useGameStore((s) => s.waste.length)
  // Algae lives outside the store; murk changes every tick, which refreshes this.
  const algae = algaeCoverage()
  const clean = (tool: 'sponge' | 'vacuum' | null) => {
    if (tool) useUIStore.getState().setCleanTool(tool)
    showDock('clean')
  }
  return (
    <div className="gauges" aria-label="Tank health">
      <Gauge icon="🍽️" label="Hungry" text={`${hungry}/${total}`} value={total ? hungry / total : 0} onClick={() => showDock('feed')} />
      <Gauge icon="🌿" label="Algae" text={`${Math.round(algae * 100)}%`} value={algae} onClick={() => clean('sponge')} />
      <Gauge icon="💧" label="Murk" text={`${Math.round(murk * 100)}%`} value={murk} onClick={() => clean(null)} />
      <Gauge icon="🟤" label="Waste" text={String(waste)} value={Math.min(1, waste / 12)} onClick={() => clean('vacuum')} />
    </div>
  )
}

// --- selected fish -----------------------------------------------------------------

/** Trait, favourites and school: what makes this fish itself. */
function FishCharacter({ fish }: { fish: FishInstance }) {
  const c = personalityOf(fish.id)
  const trait = TRAITS[c.trait]
  const hasFav = useGameStore((s) => hasFavorite(fish.id, s.placedDecorations))
  const school = useGameStore((s) => schoolSize(fish, s.ownedFish))
  return (
    <div className="pop-character">
      <p>
        <span className="trait-chip">
          {trait.icon} {trait.name}
        </span>{' '}
        {trait.text}
      </p>
      <p className={hasFav ? 'is-happy' : ''}>
        💗 Loves the <strong>{getDecorationDef(c.favoriteDecor)?.name}</strong>
        {hasFav ? ' and has one to visit! (+10% coins)' : '. Add one and watch it visit.'}
      </p>
      <p>
        🍬 Favourite treat: <strong>{getFoodDef(c.favoriteTreat).name}</strong>
      </p>
      {school !== null && (
        <p className={school >= SCHOOL_SIZE ? 'is-happy' : ''}>
          🐟{' '}
          {school >= SCHOOL_SIZE
            ? `A happy school of ${school}! (+15% coins)`
            : `Happier in a school of ${SCHOOL_SIZE}. Add ${SCHOOL_SIZE - school} more of its kind.`}
        </p>
      )}
    </div>
  )
}

function FishInfoCard() {
  const selectedFishId = useUIStore((s) => s.selectedFishId)
  const selectFish = useUIStore((s) => s.selectFish)
  const followFish = useUIStore((s) => s.followFish)
  const setFollowFish = useUIStore((s) => s.setFollowFish)
  const pushToast = useUIStore((s) => s.pushToast)
  const fish = useGameStore((s) => s.ownedFish.find((f) => f.id === selectedFishId))
  const vitals = useGameStore((s) => (selectedFishId ? s.fishVitals[selectedFishId] : undefined))
  const renameFish = useGameStore((s) => s.renameFish)
  const transferFish = useGameStore((s) => s.transferFish)
  const sellFish = useGameStore((s) => s.sellFish)
  const salePrice = useGameStore((s) => s.salePrice)
  const busy = useGameStore((s) => (selectedFishId ? s.nurserySession?.parentIds.includes(selectedFishId) ?? false : false))
  const [name, setName] = useState(fish?.name ?? '')
  const [confirmSell, setConfirmSell] = useState(false)
  if (!fish) return null
  const species = getFishDef(fish.defId)
  const def = inheritedDefinition(fish)
  if (!species || !def) return null
  const morph = getMorph(fish.inheritance?.morph)
  const hunger = vitals?.hunger ?? 0
  const growth = vitals?.growth ?? 0
  const destination = fish.habitat === 'nursery' ? 'main' : 'nursery'
  const price = salePrice(fish.id)
  return (
    <aside className="fish-pop glass" aria-label={`${fish.name} information`}>
      <div className="pop-head">
        <span
          className="fish-dot fish-dot-lg"
          style={{ background: `radial-gradient(circle at 35% 30%, ${def.color2}, ${def.color})` }}
        />
        <div className="pop-title">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              renameFish(fish.id, name)
            }}
          >
            <input aria-label="Fish name" maxLength={18} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => renameFish(fish.id, name)} />
          </form>
          <span>
            <button className="link-btn" onClick={() => useUIStore.getState().openFishpedia(fish.defId)} title="Open in the Fishpedia">
              {speciesLabel(species, morph?.id)}
            </button>{' '}
            <span className={`rarity rarity-${def.rarity}`}>{def.rarity}</span>
            {morph && <span className="rarity rarity-morph">{morph.icon} rare morph</span>}
          </span>
        </div>
        <button className="icon-btn icon-btn-sm" onClick={() => selectFish(null)} aria-label="Close">
          ✕
        </button>
      </div>
      {fish.inheritance && (
        <p className="pop-note">
          🌈 Shape from {fish.inheritance.bodyParentName} · colours from {fish.inheritance.colorParentName}
        </p>
      )}
      <p className="pop-desc">{def.description}</p>
      {fish.habitat === 'main' && hasPersonality(species) && <FishCharacter fish={fish} />}
      {def.appetite > 0 && (
        <div className="pop-meter">
          <span>Tummy</span>
          <strong>{hunger < 0.35 ? 'Happy' : hunger < 0.7 ? 'Peckish' : 'Hungry'}</strong>
          <span className={`bar ${hunger > 0.65 ? 'bar-bad' : hunger > 0.35 ? 'bar-warn' : 'bar-good'}`}>
            <span style={{ width: `${Math.round((1 - hunger) * 100)}%` }} />
          </span>
        </div>
      )}
      <div className="pop-meter">
        <span>Growth</span>
        <strong>{Math.round(growth * 100)}%</strong>
        <span className="bar">
          <span style={{ width: `${Math.round(growth * 100)}%` }} />
        </span>
      </div>
      <div className="pop-actions">
        <Button variant={followFish ? 'primary' : 'secondary'} onClick={() => setFollowFish(!followFish)}>
          {followFish ? '✓ Following' : '🎥 Follow'}
        </Button>
        <Button
          disabled={busy}
          title={busy ? 'Wait for this friendship visit to finish' : undefined}
          onClick={() => {
            const problem = transferProblem(useGameStore.getState(), fish.id, destination)
            if (problem) pushToast(problem, 'warn')
            else if (transferFish(fish.id, destination)) {
              selectFish(null)
              pushToast(`${fish.name} moved to ${destination === 'nursery' ? 'the nursery' : 'your aquarium'}`, 'success', '🐠')
            }
          }}
        >
          {destination === 'nursery' ? '🫧 Nursery' : '🐠 Aquarium'}
        </Button>
        <Button variant="danger" onClick={() => setConfirmSell(true)}>
          Sell · <Coin /> {price}
        </Button>
      </div>
      {confirmSell && (
        <div className="pop-confirm">
          <p>
            Sell {fish.name} for <Coin /> {price}? This little fish will leave your tanks.{busy ? ' Their friendship visit will end.' : ''}
          </p>
          <div>
            <Button onClick={() => setConfirmSell(false)}>Keep</Button>
            <Button
              variant="danger"
              onClick={() => {
                const coins = sellFish(fish.id)
                if (coins > 0) {
                  selectFish(null)
                  pushToast(`${fish.name} sold for ${coins} coins`, 'reward', '🪙')
                } else {
                  setConfirmSell(false)
                  pushToast('Sale unavailable', 'warn')
                }
              }}
            >
              Sell fish
            </Button>
          </div>
        </div>
      )}
    </aside>
  )
}

// --- toasts and reward popups --------------------------------------------------------

function Toasts() {
  const toasts = useUIStore((s) => s.toasts)
  const dismissToast = useUIStore((s) => s.dismissToast)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} className={`toast toast-${toast.tone}`} onClick={() => dismissToast(toast.id)}>
          {toast.icon && <span className="toast-icon"><Glyph icon={toast.icon} /></span>}
          <span><CoinText text={toast.text} /></span>
        </button>
      ))}
    </div>
  )
}

/** "🐚 a Hermit Crab and 🫧 a Bubble Goby": who came by while you were away. */
function listVisitors(ids: string[]): string {
  const names = [...new Set(ids)].map((id) => getVisitor(id)).filter((v) => v !== undefined).map((v) => `${v.icon} ${visitorName(v)}`)
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function RewardModals() {
  const levelUp = useUIStore((s) => s.levelUp)
  const setLevelUp = useUIStore((s) => s.setLevelUp)
  const welcomeBack = useUIStore((s) => s.welcomeBack)
  const setWelcomeBack = useUIStore((s) => s.setWelcomeBack)
  return (
    <>
      {levelUp && (
        <Modal title={`Level ${levelUp.level}!`} onClose={() => setLevelUp(null)}>
          <div className="reward">
            <div className="reward-icon">🌟</div>
            <p>
              Your aquarium is growing! You earned <strong><Coin /> {levelUp.coins}</strong>.
            </p>
            {levelUp.treats.length > 0 && <p>Bonus treats: {levelUp.treats.map((t) => `${getFoodDef(t.id).name} ×${t.count}`).join(', ')}</p>}
            {levelUp.unlocks.length > 0 && (
              <>
                <h3>New in the shop</h3>
                <p>{levelUp.unlocks.join(' · ')}</p>
              </>
            )}
            <div className="reward-actions">
              {levelUp.unlocks.length > 0 && (
                <Button
                  onClick={() => {
                    setLevelUp(null)
                    useUIStore.getState().openShop(firstNewShopCategory(useGameStore.getState().seen.shopLevel, levelUp.level))
                  }}
                >
                  🛍️ Visit shop
                </Button>
              )}
              <Button variant="primary" onClick={() => setLevelUp(null)}>
                Keep playing
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {welcomeBack && (
        <Modal title="Welcome back!" onClose={() => setWelcomeBack(null)}>
          <div className="reward">
            <div className="reward-icon">🐠</div>
            <p>Your aquarium kept swimming while you were away for {welcomeBack.minutesAway} minutes.</p>
            <p>
              <strong><Coin /> +{welcomeBack.coins}</strong> coins earned
            </p>
            {welcomeBack.visitors && welcomeBack.visitors.length > 0 && (
              <p>
                🎁 {listVisitors(welcomeBack.visitors)} stopped by and left {welcomeBack.visitors.length === 1 ? 'a gift' : 'gifts'} on the gravel. Tap to open!
              </p>
            )}
            {welcomeBack.hungryFish > 0 && <p>{welcomeBack.hungryFish} fish could use a snack.</p>}
            {welcomeBack.murkPercent > 20 && <p>The water is {welcomeBack.murkPercent}% murky. Time for a clean?</p>}
            <div className="reward-actions">
              <Button variant="primary" onClick={() => setWelcomeBack(null)}>
                Dive in
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

/** Shown instead of the usual controls while looking at a friend's shared tank. */
function VisitBar() {
  const visiting = useUIStore((s) => s.visiting)!
  const stars = useGameStore((s) => beautyOf(s.placedDecorations).stars)
  return (
    <header className="topbar visit-bar">
      <div className="visit-title">
        {visiting.status === 'broken' ? (
          <>
            <strong>That tank link didn't work</strong>
            <small>It may have been cut short when it was copied. Ask your friend to send it again.</small>
          </>
        ) : (
          <>
            <small>👀 Visiting</small>
            <strong>{visiting.status === 'loading' ? '…' : visiting.name}</strong>
            {visiting.status === 'ready' && (
              <small>
                {'★'.repeat(stars)}
                {'☆'.repeat(5 - stars)} · {visiting.fish} fish · look only
              </small>
            )}
          </>
        )}
      </div>
      <div className="visit-actions">
        {visiting.status === 'ready' && (
          <>
            <button className="icon-btn photo-btn" onClick={savePhoto} title="Save a photo of this aquarium">
              📸
            </button>
            <button className="icon-btn" onClick={() => useUIStore.getState().setRelax(true)} title="Relax: hide the buttons and let the camera wander">
              😌
            </button>
          </>
        )}
        <Button variant="primary" onClick={endVisit}>
          🏠 Back to my tank
        </Button>
      </div>
    </header>
  )
}

export function HUD() {
  const activeTank = useUIStore((s) => s.activeTank)
  const selectedFishId = useUIStore((s) => s.selectedFishId)
  const visiting = useUIStore((s) => s.visiting !== null)
  if (visiting) {
    return (
      <div className="hud">
        <VisitBar />
        <Toasts />
      </div>
    )
  }
  return (
    <div className="hud">
      <TopBar />
      {activeTank === 'main' && <CareGauges />}
      {selectedFishId && <FishInfoCard key={selectedFishId} />}
      <Toasts />
      <Dock />
      <RewardModals />
      <Fishpedia />
      <Goals />
      <ShareTank />
    </div>
  )
}
