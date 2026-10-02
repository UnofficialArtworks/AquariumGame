import { useState } from 'react'
import { useGameStore } from '../../state/useGameStore'
import { useUIStore, type ShopTab } from '../../state/useUIStore'
import { levelFromXp } from '../../state/progression'
import { getFishDef, FISH_CATALOG, MAX_OWNED_FISH } from '../../scene/fish/fishDefinitions'
import { speciesLabel } from '../../state/morphs'
import { FOOD_CATALOG, getFoodDef } from '../../scene/food/foodDefinitions'
import { DECORATION_CATALOG, getDecorationDef } from '../../scene/decorations/decorationDefinitions'
import { BACKGROUND_CATALOG } from '../../scene/backgrounds'
import { SUBSTRATE_CATALOG } from '../../scene/substrates'
import { STAND_CATALOG } from '../../scene/stands/standDefinitions'
import { getGlassTool, getGravelTool, TOOL_CATALOG, type CleaningToolDef } from '../../scene/cleaning/toolDefinitions'
import { algaeCoverage } from '../../sim/algae'
import { startWaterChange, waterChange } from '../../sim/waterChange'
import { FRIENDSHIP_SECONDS, NURSERY_CAPACITY } from '../../state/economy'
import { getEggCountRange, inheritedDefinition } from '../../state/nursery'
import { ShopItemCard } from '../ShopItemCard'
import { ItemThumbnail } from '../ItemThumbnail'
import { Button } from '../components/Button'

// --- shared bits --------------------------------------------------------------

export function DrawerHead({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="drawer-head">
      <div className="drawer-title">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {children && <div className="drawer-tools">{children}</div>}
    </div>
  )
}

function Bar({ value, tone }: { value: number; tone?: 'warn' | 'bad' | 'good' }) {
  return (
    <span className={`bar ${tone ? `bar-${tone}` : ''}`}>
      <span style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </span>
  )
}

function toneFor(value: number): 'good' | 'warn' | 'bad' {
  return value > 0.65 ? 'bad' : value > 0.35 ? 'warn' : 'good'
}

function countdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return hours ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}:${String(secs).padStart(2, '0')}`
}

// --- Watch: your fish (or the nursery) ------------------------------------------

function FishCard({ fishId, destination }: { fishId: string; destination: 'main' | 'nursery' }) {
  const fish = useGameStore((s) => s.ownedFish.find((f) => f.id === fishId))
  const hunger = useGameStore((s) => Math.round((s.fishVitals[fishId]?.hunger ?? 0) * 20) / 20)
  const growth = useGameStore((s) => Math.round((s.fishVitals[fishId]?.growth ?? 0) * 100))
  const busy = useGameStore((s) => s.nurserySession?.parentIds.includes(fishId) ?? false)
  const transferFish = useGameStore((s) => s.transferFish)
  const selected = useUIStore((s) => s.selectedFishId === fishId)
  const pushToast = useUIStore((s) => s.pushToast)
  if (!fish) return null
  const species = getFishDef(fish.defId)
  const def = inheritedDefinition(fish)
  const morph = fish.inheritance?.morph
  const color = def?.color ?? '#7fd'
  const color2 = def?.color2 ?? '#fff'
  const where = destination === 'nursery' ? 'the nursery' : 'your aquarium'
  return (
    <div className={`fish-card ${selected ? 'is-selected' : ''}`}>
      <button
        className="fish-card-main"
        onClick={() => {
          const ui = useUIStore.getState()
          ui.selectFish(fishId)
          ui.setFollowFish(true)
        }}
        title={`Visit ${fish.name}`}
      >
        <span className="fish-dot" style={{ background: `radial-gradient(circle at 35% 30%, ${color2}, ${color})` }} />
        <span className="fish-card-copy">
          <strong>{fish.name}</strong>
          <small>{morph && '✨ '}{species ? speciesLabel(species, morph) : 'Fish'} · {growth < 100 ? `${growth}% grown` : 'grown up'}</small>
          {(def?.appetite ?? 0) > 0 && <Bar value={1 - hunger} tone={hunger > 0.65 ? 'bad' : hunger > 0.35 ? 'warn' : 'good'} />}
        </span>
      </button>
      <button
        className="fish-card-move"
        disabled={busy}
        title={busy ? 'Wait for the friendship visit to finish' : `Move ${fish.name} to ${where}`}
        aria-label={`Move ${fish.name} to ${where}`}
        onClick={() => {
          if (transferFish(fishId, destination)) pushToast(`${fish.name} moved to ${where}`, 'success', '🐠')
          else pushToast('No room there right now', 'warn')
        }}
      >
        {destination === 'nursery' ? '🫧' : '🐠'}
      </button>
    </div>
  )
}

function FishGrid({ habitat }: { habitat: 'main' | 'nursery' }) {
  const ids = useGameStore((s) => s.ownedFish.filter((f) => f.habitat === habitat).map((f) => f.id).join(','))
  const list = ids ? ids.split(',') : []
  if (!list.length) {
    return <p className="empty-note">{habitat === 'nursery' ? 'Send a fish from your aquarium to begin.' : 'Your tank is waiting for a fish! Visit the Shop to adopt one.'}</p>
  }
  return (
    <div className="fish-grid">
      {list.map((id) => (
        <FishCard key={id} fishId={id} destination={habitat === 'nursery' ? 'main' : 'nursery'} />
      ))}
    </div>
  )
}

function NurseryContent() {
  const fish = useGameStore((s) => s.ownedFish)
  const eggs = useGameStore((s) => s.nurseryEggs)
  const vitals = useGameStore((s) => s.fishVitals)
  const session = useGameStore((s) => s.nurserySession)
  const startFriendship = useGameStore((s) => s.startFriendship)
  const pushToast = useUIStore((s) => s.pushToast)
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const nurseryFish = fish.filter((f) => f.habitat === 'nursery')
  const grown = nurseryFish.filter((f) => (vitals[f.id]?.growth ?? 0) >= 1)
  const occupied = nurseryFish.length + eggs.length + (session?.eggCount ?? 0)
  const firstFriend = grown.find((f) => f.id === first)
  const clutch = firstFriend ? getEggCountRange(firstFriend.defId) : undefined
  const ready =
    first !== second &&
    grown.some((f) => f.id === first) &&
    grown.some((f) => f.id === second) &&
    occupied + (clutch?.[1] ?? NURSERY_CAPACITY) <= NURSERY_CAPACITY
  const nameOf = (id?: string) => fish.find((f) => f.id === id)?.name
  return (
    <>
      <DrawerHead title="Friendship nursery" hint="Two grown fish can become friends and welcome a clutch of eggs.">
        <span className="chip" title={`${nurseryFish.length} fish, ${eggs.length} eggs, ${session?.eggCount ?? 0} reserved`}>
          🫧 {occupied}/{NURSERY_CAPACITY}
        </span>
      </DrawerHead>
      <div className="nursery-columns">
        <section className="card-block">
          {session ? (
            <div className="friendship-live">
              <div className="friendship-hearts">💗 🥚 💗</div>
              <strong>
                {nameOf(session.parentIds[0]) ?? 'One friend'} and {nameOf(session.parentIds[1]) ?? 'another friend'} are becoming friends!
              </strong>
              <p>
                {session.eggCount} egg{session.eggCount === 1 ? '' : 's'} on the way · {countdown(session.remainingSeconds)}
              </p>
              <Bar value={1 - session.remainingSeconds / FRIENDSHIP_SECONDS} />
            </div>
          ) : (
            <div className="friendship-form">
              <h3>Pair two grown fish</h3>
              <div className="friend-picks">
                <select aria-label="First friend" value={first} onChange={(e) => setFirst(e.target.value)}>
                  <option value="">First friend…</option>
                  {grown.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · {getFishDef(f.defId)?.name}
                    </option>
                  ))}
                </select>
                <span aria-hidden>💞</span>
                <select aria-label="Second friend" value={second} onChange={(e) => setSecond(e.target.value)}>
                  <option value="">Second friend…</option>
                  {grown
                    .filter((f) => f.id !== first)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} · {getFishDef(f.defId)?.name}
                      </option>
                    ))}
                </select>
              </div>
              <p className="fine-print">
                {clutch
                  ? `This pair may welcome ${clutch[0]}–${clutch[1]} eggs in ${FRIENDSHIP_SECONDS / 60} minutes.`
                  : grown.length < 2
                    ? 'Feed your fish to help them grow — two fully grown fish are needed.'
                    : 'The first friend decides how many eggs (1–6). Babies get shape and colours from their parents.'}
                {occupied >= NURSERY_CAPACITY && ' The nursery is full.'}
              </p>
              <Button
                variant="primary"
                disabled={!ready}
                onClick={() => {
                  if (startFriendship(first, second)) {
                    setFirst('')
                    setSecond('')
                    pushToast('A new friendship is blooming!', 'success', '💗')
                  } else pushToast('These fish are not ready yet', 'warn')
                }}
              >
                Start friendship
              </Button>
            </div>
          )}
        </section>
        <section className="card-block egg-block">
          <h3>
            🥚 Egg watch <span className="chip chip-soft">{eggs.length}</span>
          </h3>
          {eggs.length ? (
            <div className="egg-list">
              {eggs.map((egg) => {
                const species = getFishDef(egg.defId)
                return (
                  <div className="egg-row" key={egg.id}>
                    <span className="egg-dot" style={{ background: egg.inheritance?.color ?? species?.color }} />
                    <div>
                      <div className="egg-line">
                        <strong>{species?.name ?? 'Mystery'} egg</strong>
                        <span>{countdown(egg.remainingSeconds)}</span>
                      </div>
                      <Bar value={1 - egg.remainingSeconds / egg.hatchSeconds} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="empty-note">No eggs yet. Start a friendship to welcome a clutch!</p>
          )}
        </section>
      </div>
      <h3 className="section-label">Little fish</h3>
      <FishGrid habitat="nursery" />
    </>
  )
}

export function WatchDrawer() {
  const activeTank = useUIStore((s) => s.activeTank)
  const count = useGameStore((s) => s.ownedFish.filter((f) => f.habitat === 'main').length)
  if (activeTank === 'nursery') return <NurseryContent />
  return (
    <>
      <DrawerHead title={`Your fish · ${count}`} hint="Tap a fish to visit it. Tap one in the tank to say hi!" />
      <FishGrid habitat="main" />
      <p className="save-note">Progress saves automatically in this browser.</p>
    </>
  )
}

// --- Feed --------------------------------------------------------------------------

export function FeedDrawer() {
  const foodId = useUIStore((s) => s.foodId)
  const setFoodId = useUIStore((s) => s.setFoodId)
  const openShop = useUIStore((s) => s.openShop)
  const treats = useGameStore((s) => s.treats)
  const level = useGameStore((s) => levelFromXp(s.xp).level)
  const selected = getFoodDef(foodId)
  return (
    <>
      <DrawerHead title="Feeding time" hint="Pick a food, then tap the water to drop a pinch.">
        <button className="link-button" onClick={() => openShop('treats')}>
          Get treats →
        </button>
      </DrawerHead>
      <div className="tile-row">
        {FOOD_CATALOG.map((food) => {
          const count = treats[food.id] ?? 0
          const locked = level < food.unlockLevel && count <= 0
          const empty = !food.unlimited && count <= 0 && !locked
          return (
            <button
              key={food.id}
              className={`tile food-tile ${foodId === food.id ? 'is-selected' : ''} ${empty ? 'is-empty' : ''}`}
              disabled={locked}
              title={locked ? `Unlocks at level ${food.unlockLevel}` : food.description}
              onClick={() => (empty ? openShop('treats') : setFoodId(food.id))}
            >
              <span className="tile-icon">{food.icon}</span>
              <strong>{food.name}</strong>
              <span className="tile-badge">{locked ? `🔒 ${food.unlockLevel}` : food.unlimited ? 'Free' : `×${count}`}</span>
            </button>
          )
        })}
      </div>
      <p className="drawer-foot">
        <span className="tile-icon-sm">{selected.icon}</span> {selected.description}
      </p>
    </>
  )
}

// --- Clean -------------------------------------------------------------------------

function ToolTile({ tool, active, onPick }: { tool: CleaningToolDef; active: boolean; onPick: () => void }) {
  return (
    <button className={`tile tool-tile ${active ? 'is-selected' : ''}`} onClick={onPick} title={tool.description}>
      <span className="tile-icon">{tool.icon}</span>
      <strong>{tool.name}</strong>
      <small>{tool.stat}</small>
    </button>
  )
}

export function CleanDrawer() {
  const cleanTool = useUIStore((s) => s.cleanTool)
  const setCleanTool = useUIStore((s) => s.setCleanTool)
  const cleanCameraMode = useUIStore((s) => s.cleanCameraMode)
  const setCleanCameraMode = useUIStore((s) => s.setCleanCameraMode)
  const pushToast = useUIStore((s) => s.pushToast)
  const openShop = useUIStore((s) => s.openShop)
  const ownedToolIds = useGameStore((s) => s.ownedToolIds)
  const glass = getGlassTool(useGameStore((s) => s.equippedGlassTool))
  const gravel = getGravelTool(useGameStore((s) => s.equippedGravelTool))
  const equipTool = useGameStore((s) => s.equipTool)
  const waste = useGameStore((s) => s.waste.length)
  const murk = useGameStore((s) => s.murk)
  const algae = algaeCoverage()
  const owned = (category: 'glass' | 'gravel') => TOOL_CATALOG.filter((t) => t.category === category && ownedToolIds.includes(t.id))
  const pick = (tool: CleaningToolDef) => {
    equipTool(tool.id)
    setCleanCameraMode(false)
    setCleanTool(tool.category === 'glass' ? 'sponge' : 'vacuum')
  }
  const hint = cleanCameraMode
    ? 'Drag to look around, then pick a tool to keep cleaning.'
    : cleanTool === 'sponge'
      ? `Drag across the glass to scrub with the ${glass.name}. Right-drag or two fingers to look around.`
      : waste > 0
        ? `${waste} bit${waste === 1 ? '' : 's'} of waste glowing on the gravel — sweep the ${gravel.name} over them.`
        : 'The gravel is spotless!'
  return (
    <>
      <DrawerHead title="Tank care" hint={hint}>
        <button className="link-button" onClick={() => openShop('tools')}>
          Better tools →
        </button>
      </DrawerHead>
      <div className="care-stats">
        <div className="care-stat">
          <span>🌿 Algae</span>
          <strong>{Math.round(algae * 100)}%</strong>
          <Bar value={algae} tone={toneFor(algae)} />
        </div>
        <div className="care-stat">
          <span>💧 Murky water</span>
          <strong>{Math.round(murk * 100)}%</strong>
          <Bar value={murk} tone={toneFor(murk)} />
        </div>
        <div className="care-stat">
          <span>🟤 Waste</span>
          <strong>{waste}</strong>
          <Bar value={Math.min(1, waste / 12)} tone={toneFor(Math.min(1, waste / 12))} />
        </div>
      </div>
      <div className="tool-groups">
        <section>
          <h3 className="section-label">Glass</h3>
          <div className="tile-row">
            {owned('glass').map((t) => (
              <ToolTile key={t.id} tool={t} active={!cleanCameraMode && cleanTool === 'sponge' && glass.id === t.id} onPick={() => pick(t)} />
            ))}
          </div>
        </section>
        <section>
          <h3 className="section-label">Gravel</h3>
          <div className="tile-row">
            {owned('gravel').map((t) => (
              <ToolTile key={t.id} tool={t} active={!cleanCameraMode && cleanTool === 'vacuum' && gravel.id === t.id} onPick={() => pick(t)} />
            ))}
          </div>
        </section>
        <section>
          <h3 className="section-label">More</h3>
          <div className="tile-row">
            <button
              className={`tile ${cleanCameraMode ? 'is-selected' : ''}`}
              aria-pressed={cleanCameraMode}
              onClick={() => setCleanCameraMode(!cleanCameraMode)}
            >
              <span className="tile-icon">🧭</span>
              <strong>Look around</strong>
              <small>{cleanCameraMode ? 'On' : 'Move camera'}</small>
            </button>
            <button
              className="tile"
              disabled={waterChange.phase !== 'idle'}
              onClick={() => {
                if (startWaterChange()) pushToast('Fresh water is on its way!', 'success', '💧')
                else pushToast('Water change in progress', 'info', '💧')
              }}
            >
              <span className="tile-icon">🚿</span>
              <strong>Water change</strong>
              <small>{waterChange.phase !== 'idle' ? 'Refilling…' : 'Clears murk'}</small>
            </button>
          </div>
        </section>
      </div>
    </>
  )
}

// --- Decorate ----------------------------------------------------------------------

export function DecorateDrawer() {
  const unlockedIds = useGameStore((s) => s.unlockedDecorationDefIds)
  const placed = useGameStore((s) => s.placedDecorations)
  const addDecorationInstance = useGameStore((s) => s.addDecorationInstance)
  const rotateDecoration = useGameStore((s) => s.rotateDecoration)
  const removeDecoration = useGameStore((s) => s.removeDecoration)
  const selectedId = useUIStore((s) => s.selectedDecorationId)
  const setSelectedDecorationId = useUIStore((s) => s.setSelectedDecorationId)
  const openShop = useUIStore((s) => s.openShop)
  const selectedInstance = placed.find((p) => p.id === selectedId)
  const selectedDef = selectedInstance ? getDecorationDef(selectedInstance.defId) : undefined
  const unlocked = DECORATION_CATALOG.filter((d) => unlockedIds.includes(d.id))

  if (selectedId) {
    return (
      <DrawerHead title={selectedDef?.name ?? 'Decoration'} hint="Drag it around the tank, or use the buttons.">
        <Button onClick={() => rotateDecoration(selectedId)}>⟳ Rotate</Button>
        <Button
          variant="danger"
          onClick={() => {
            removeDecoration(selectedId)
            setSelectedDecorationId(null)
          }}
        >
          Remove
        </Button>
        <Button variant="primary" onClick={() => setSelectedDecorationId(null)}>
          ✓ Done
        </Button>
      </DrawerHead>
    )
  }
  return (
    <>
      <DrawerHead title="Decorate" hint="Tap an item to add it, then drag it into place. Tap placed items to move them.">
        <span className="chip">{placed.length} placed</span>
      </DrawerHead>
      <div className="tile-row tile-row-wrap">
        {unlocked.map((def) => {
          const active = def.bonus && placed.some((p) => p.defId === def.id)
          return (
            <button
              key={def.id}
              className={`tile decor-tile ${def.bonus ? 'is-gadget' : ''}`}
              title={def.bonus ? `${def.name} · ${def.bonus.label}${active ? ' (active)' : ''}` : def.name}
              onClick={() => addDecorationInstance(def.id)}
            >
              <ItemThumbnail previewKey={def.id} color={def.color} className="tile-thumb" />
              <strong>{def.name}</strong>
              {def.bonus && <small className={`gadget-note ${active ? 'is-on' : ''}`}>{active ? '✓ ' : '✨ '}{def.bonus.label}</small>}
            </button>
          )
        })}
        <button className="tile tile-more" onClick={() => openShop('decorations')}>
          <span className="tile-icon">＋</span>
          <strong>More in Shop</strong>
        </button>
      </div>
    </>
  )
}

// --- Shop --------------------------------------------------------------------------

const SHOP_TABS: Array<{ id: ShopTab; icon: string; name: string; note: string }> = [
  { id: 'fish', icon: '🐠', name: 'Fish', note: 'Meet your next tank mate.' },
  { id: 'decorations', icon: '🪸', name: 'Decor', note: 'Buy once, place as many as you like. ✨ Gadgets give a bonus while one is placed.' },
  { id: 'treats', icon: '🍬', name: 'Treats', note: 'Special snacks with a little magic. Pellets and flakes are always free.' },
  { id: 'tools', icon: '🧽', name: 'Tools', note: 'Bigger tools clean more glass and gravel in one go.' },
  { id: 'backgrounds', icon: '🌅', name: 'Scenes', note: 'Set the scene behind your main aquarium.' },
  { id: 'gravel', icon: '🪨', name: 'Gravel', note: 'Change the look of the tank floor.' },
  { id: 'stands', icon: '🗄️', name: 'Stands', note: 'Give your aquarium a new stand to sit on.' },
]

function sortShopItems<T extends { unlockLevel: number }>(items: readonly T[], price: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.unlockLevel - b.item.unlockLevel || price(a.item) - price(b.item) || a.index - b.index)
    .map(({ item }) => item)
}

export function ShopDrawer() {
  const shopTab = useUIStore((s) => s.shopTab)
  const setShopTab = useUIStore((s) => s.setShopTab)
  const pushToast = useUIStore((s) => s.pushToast)
  const coins = useGameStore((s) => Math.floor(s.currency))
  const level = useGameStore((s) => levelFromXp(s.xp).level)
  const g = useGameStore.getState()
  const unlockedDecorationDefIds = useGameStore((s) => s.unlockedDecorationDefIds)
  const ownedFish = useGameStore((s) => s.ownedFish)
  const treats = useGameStore((s) => s.treats)
  const backgroundId = useGameStore((s) => s.backgroundId)
  const unlockedBackgroundIds = useGameStore((s) => s.unlockedBackgroundIds)
  const substrateId = useGameStore((s) => s.substrateId)
  const unlockedSubstrateIds = useGameStore((s) => s.unlockedSubstrateIds)
  const standId = useGameStore((s) => s.standId)
  const unlockedStandIds = useGameStore((s) => s.unlockedStandIds)
  const ownedToolIds = useGameStore((s) => s.ownedToolIds)
  const equippedGlassTool = useGameStore((s) => s.equippedGlassTool)
  const equippedGravelTool = useGameStore((s) => s.equippedGravelTool)
  const fishAtCap = ownedFish.length >= MAX_OWNED_FISH
  const tab = SHOP_TABS.find((t) => t.id === shopTab) ?? SHOP_TABS[0]
  const locked = (unlockLevel: number) => (level < unlockLevel ? unlockLevel : undefined)

  return (
    <>
      <DrawerHead title="Shop" hint={shopTab === 'fish' ? `${tab.note} ${ownedFish.length}/${MAX_OWNED_FISH} creatures.` : tab.note}>
        <span className="chip chip-coins">🪙 {coins.toLocaleString()}</span>
      </DrawerHead>
      <div className="subtabs" role="tablist" aria-label="Shop categories">
        {SHOP_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === shopTab} className={`subtab ${t.id === shopTab ? 'is-active' : ''}`} onClick={() => setShopTab(t.id)}>
            <span>{t.icon}</span>
            {t.name}
          </button>
        ))}
      </div>
      <div className="shop-grid">
        {shopTab === 'fish' &&
          sortShopItems(FISH_CATALOG, (d) => d.cost).map((def) => (
            <ShopItemCard
              key={def.id}
              previewKey={def.id}
              name={def.name}
              description={def.description}
              color={def.color}
              cost={def.cost}
              rarity={def.rarity}
              unlockLevel={locked(def.unlockLevel)}
              countOwned={ownedFish.filter((f) => f.defId === def.id).length}
              affordable={coins >= def.cost && !fishAtCap}
              unavailableText={fishAtCap ? 'Tank full' : undefined}
              onBuy={() => {
                if (g.buyFish(def.id)) pushToast(`${def.name} joined your aquarium!`, 'success', '🐠')
                else if (fishAtCap) pushToast('Your tank is full', 'warn')
              }}
            />
          ))}
        {shopTab === 'decorations' &&
          sortShopItems(DECORATION_CATALOG, (d) => d.cost).map((def) => (
            <ShopItemCard
              key={def.id}
              previewKey={def.id}
              name={def.name}
              description={def.description}
              color={def.color}
              cost={def.cost}
              rarity={def.rarity}
              badge={def.bonus?.label}
              unlockLevel={locked(def.unlockLevel)}
              owned={unlockedDecorationDefIds.includes(def.id)}
              affordable={coins >= def.cost}
              onBuy={() => {
                if (g.buyDecoration(def.id))
                  pushToast(def.bonus ? `${def.name} added! Place it to switch on its bonus.` : `${def.name} added to your decorations!`, 'success', def.bonus ? '✨' : '🪸')
              }}
            />
          ))}
        {shopTab === 'treats' &&
          sortShopItems(FOOD_CATALOG, (d) => d.packCost).map((def) => (
            <ShopItemCard
              key={def.id}
              name={def.name}
              description={def.description}
              color={def.color}
              icon={def.icon}
              cost={def.packCost}
              packSize={def.unlimited ? undefined : def.packSize}
              owned={def.unlimited}
              countOwned={def.unlimited ? undefined : treats[def.id] ?? 0}
              unlockLevel={locked(def.unlockLevel)}
              affordable={coins >= def.packCost}
              onBuy={() => {
                if (g.buyTreatPack(def.id)) pushToast(`${def.packSize} ${def.name} added!`, 'success', def.icon)
              }}
            />
          ))}
        {shopTab === 'tools' &&
          sortShopItems(TOOL_CATALOG, (d) => d.cost).map((def) => (
            <ShopItemCard
              key={def.id}
              name={def.name}
              description={def.description}
              color="#2a8f9a"
              icon={def.icon}
              cost={def.cost}
              rarity={def.rarity}
              badge={`${def.category === 'glass' ? 'Glass' : 'Gravel'} · ${def.stat}`}
              owned={ownedToolIds.includes(def.id)}
              equipped={def.id === equippedGlassTool || def.id === equippedGravelTool}
              unlockLevel={locked(def.unlockLevel)}
              affordable={coins >= def.cost}
              onBuy={() => {
                if (g.buyTool(def.id)) pushToast(`${def.name} is ready in Clean mode!`, 'success', def.icon)
              }}
              onEquip={() => {
                g.equipTool(def.id)
                pushToast(`${def.name} equipped`, 'info', def.icon)
              }}
            />
          ))}
        {shopTab === 'backgrounds' &&
          sortShopItems(BACKGROUND_CATALOG, (d) => d.cost).map((def) => (
            <ShopItemCard
              key={def.id}
              name={def.name}
              description={def.description}
              color={def.swatch[0]}
              swatch={def.swatch}
              icon="🌊"
              cost={def.cost}
              owned={unlockedBackgroundIds.includes(def.id)}
              equipped={backgroundId === def.id}
              unlockLevel={locked(def.unlockLevel)}
              affordable={coins >= def.cost}
              onBuy={() => {
                if (g.buyBackground(def.id)) pushToast(`${def.name} is your new backdrop!`, 'success', '🌅')
              }}
              onEquip={() => g.setBackground(def.id)}
            />
          ))}
        {shopTab === 'gravel' &&
          sortShopItems(SUBSTRATE_CATALOG, (d) => d.cost).map((def) => (
            <ShopItemCard
              key={def.id}
              name={def.name}
              description={def.description}
              color={def.base}
              swatch={[def.base, def.baseAlt]}
              icon="🪨"
              cost={def.cost}
              owned={unlockedSubstrateIds.includes(def.id)}
              equipped={substrateId === def.id}
              unlockLevel={locked(def.unlockLevel)}
              affordable={coins >= def.cost}
              onBuy={() => {
                if (g.buySubstrate(def.id)) pushToast(`${def.name} is now in your tank!`, 'success', '🪨')
              }}
              onEquip={() => g.setSubstrate(def.id)}
            />
          ))}
        {shopTab === 'stands' &&
          sortShopItems(STAND_CATALOG, (d) => d.cost).map((def) => (
            <ShopItemCard
              key={def.id}
              name={def.name}
              description={def.description}
              color={def.swatch[0]}
              swatch={def.swatch}
              icon={def.icon}
              cost={def.cost}
              rarity={def.rarity}
              owned={unlockedStandIds.includes(def.id)}
              equipped={standId === def.id}
              unlockLevel={locked(def.unlockLevel)}
              affordable={coins >= def.cost}
              onBuy={() => {
                if (g.buyStand(def.id)) pushToast(`${def.name} installed!`, 'success', def.icon)
              }}
              onEquip={() => g.setStand(def.id)}
            />
          ))}
      </div>
    </>
  )
}
