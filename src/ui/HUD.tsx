import { useRef, useState } from 'react'
import { useGameStore } from '../state/useGameStore'
import { useUIStore, type AppMode } from '../state/useUIStore'
import { levelFromXp, MAX_LEVEL } from '../state/progression'
import { getFishDef } from '../scene/fish/fishDefinitions'
import { FOOD_CATALOG, getFoodDef } from '../scene/food/foodDefinitions'
import { algaeCoverage } from '../sim/algae'
import { startWaterChange, waterChange } from '../sim/waterChange'
import { NURSERY_CAPACITY, FRIENDSHIP_SECONDS } from '../state/economy'
import { getEggCountRange } from '../state/nursery'
import { getGlassTool, getGravelTool, TOOL_CATALOG } from '../scene/cleaning/toolDefinitions'
import { Button } from './components/Button'
import { Modal } from './components/Modal'
import { SaveIndicator } from './SaveIndicator'
import { InventoryPanel } from './InventoryPanel'
import { ShopPanel } from './ShopPanel'

const modes: Array<{ id: AppMode | 'shop'; icon: string; label: string }> = [
  { id: 'view', icon: '👀', label: 'Watch' },
  { id: 'feed', icon: '🍤', label: 'Feed' },
  { id: 'clean', icon: '🧽', label: 'Clean' },
  { id: 'decorate', icon: '🪸', label: 'Decorate' },
  { id: 'shop', icon: '🛍️', label: 'Shop' },
]

function AquariumName() {
  const aquariumName = useGameStore((s) => s.aquariumName)
  const renameAquarium = useGameStore((s) => s.renameAquarium)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(aquariumName)
  const cancelBlur = useRef(false)
  const save = () => { renameAquarium(draft); setEditing(false) }
  return <div className="brand-name">{editing ? <form onSubmit={(e) => { e.preventDefault(); save() }}><input autoFocus aria-label="Aquarium name" maxLength={28} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (cancelBlur.current) cancelBlur.current = false; else save() }} onKeyDown={(e) => { if (e.key === 'Escape') { cancelBlur.current = true; setDraft(aquariumName); setEditing(false) } }} /></form> : <><strong>{aquariumName || 'My Aquarium'}</strong><button className="rename-button" title="Rename your aquarium" aria-label="Rename your aquarium" onClick={() => { cancelBlur.current = false; setDraft(aquariumName); setEditing(true) }}>✎</button></>}<small>Your living aquarium</small></div>
}

function Meter({ label, value, detail, inverted = false }: { label: string; value: number; detail: string; inverted?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return <div className="care-meter" title={`${label}: ${detail}`}><div className="care-meter-label"><span>{label}</span><strong>{detail}</strong></div><div className="meter-track"><span className={inverted && pct > 55 ? 'meter-fill meter-warn' : 'meter-fill'} style={{ width: `${pct}%` }} /></div></div>
}

function FishInfoCard() {
  const selectedFishId = useUIStore((s) => s.selectedFishId)
  const selectFish = useUIStore((s) => s.selectFish)
  const followFish = useUIStore((s) => s.followFish)
  const setFollowFish = useUIStore((s) => s.setFollowFish)
  const fish = useGameStore((s) => s.ownedFish.find((f) => f.id === selectedFishId))
  const vitals = useGameStore((s) => selectedFishId ? s.fishVitals[selectedFishId] : undefined)
  const renameFish = useGameStore((s) => s.renameFish)
  const transferFish = useGameStore((s) => s.transferFish)
  const sellFish = useGameStore((s) => s.sellFish)
  const salePrice = useGameStore((s) => s.salePrice)
  const nurserySession = useGameStore((s) => s.nurserySession)
  const pushToast = useUIStore((s) => s.pushToast)
  const [name, setName] = useState(fish?.name ?? '')
  const [confirmSell, setConfirmSell] = useState(false)
  if (!fish) return null
  const def = getFishDef(fish.defId)
  if (!def) return null
  const hunger = vitals?.hunger ?? 0
  const makingFriend = nurserySession?.parentIds.includes(fish.id) ?? false
  return <aside className="fish-info panel" aria-label={`${fish.name} information`}>
    <div className="panel-heading"><span className="eyebrow">YOUR AQUATIC FRIEND</span><button className="icon-button" onClick={() => selectFish(null)} aria-label="Close fish information">✕</button></div>
    <div className="fish-info-identity"><span className="fish-avatar" style={{ background: `radial-gradient(circle at 35% 30%, ${fish.inheritance?.color2 ?? def.color2}, ${fish.inheritance?.color ?? def.color})` }}>🐟</span><div><form onSubmit={(e) => { e.preventDefault(); renameFish(fish.id, name) }}><input aria-label="Fish name" maxLength={18} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => renameFish(fish.id, name)} /></form><div className="fish-subtitle">{def.name} <span className={`rarity rarity-${def.rarity}`}>{def.rarity}</span></div></div></div>
    {fish.inheritance && <p className="inheritance-note">🌈 Body: {fish.inheritance.bodyParentName} · Colors: {fish.inheritance.colorParentName}</p>}
    <p className="fish-description">{def.description}</p>
    <Meter label="Full tummy" value={1 - hunger} detail={hunger < 0.35 ? 'Happy' : hunger < 0.7 ? 'Peckish' : 'Hungry'} />
    <Meter label="Growth" value={vitals?.growth ?? 0} detail={`${Math.round((vitals?.growth ?? 0) * 100)}%`} />
    <div className="fish-info-actions"><Button onClick={() => setFollowFish(!followFish)}>{followFish ? '✓ Following' : '🎥 Follow'}</Button></div>
    <div className="fish-care-actions"><Button disabled={makingFriend} title={makingFriend ? 'Wait for this friendship visit to finish' : undefined} onClick={() => { const destination = fish.habitat === 'nursery' ? 'main' : 'nursery'; if (transferFish(fish.id, destination)) { selectFish(null); pushToast(`${fish.name} moved to ${destination === 'nursery' ? 'the nursery' : 'your aquarium'}`, 'success', '🐠') } else pushToast('No room there right now', 'warn') }}>{fish.habitat === 'nursery' ? '← Move to aquarium' : 'Send to nursery →'}</Button><Button variant="danger" onClick={() => setConfirmSell(true)}>Sell · 🪙 {salePrice(fish.id)}</Button></div>
    {confirmSell && <div className="inline-confirm"><p>Sell {fish.name} for 🪙 {salePrice(fish.id)}? This little fish will leave your tanks.{makingFriend ? ' Their friendship visit will end.' : ''}</p><div><Button onClick={() => setConfirmSell(false)}>Keep fish</Button><Button variant="danger" onClick={() => { const coins = sellFish(fish.id); if (coins > 0) { selectFish(null); pushToast(`${fish.name} sold for ${coins} coins`, 'reward', '🪙') } else { setConfirmSell(false); pushToast('Sale unavailable', 'warn') } }}>Sell fish</Button></div></div>}
  </aside>
}

function FeedTray({ level }: { level: number }) {
  const foodId = useUIStore((s) => s.foodId)
  const setFoodId = useUIStore((s) => s.setFoodId)
  const treats = useGameStore((s) => s.treats)
  const openModal = useUIStore((s) => s.openModal)
  const setShopTab = useUIStore((s) => s.setShopTab)
  const selected = getFoodDef(foodId)
  return <div className="activity-panel panel feed-panel"><div className="activity-heading"><strong>What’s for dinner?</strong><span>Tap the water to drop food</span></div><div className="food-tray">{FOOD_CATALOG.map((food) => { const count = treats[food.id] ?? 0; const locked = level < food.unlockLevel && count <= 0; return <button key={food.id} className={`food-option ${foodId === food.id ? 'selected' : ''}`} disabled={locked} title={locked ? `Unlock at level ${food.unlockLevel}` : food.description} onClick={() => setFoodId(food.id)}><span className="food-icon">{food.icon}</span><span>{food.name}</span><small>{locked ? `Lv ${food.unlockLevel}` : food.unlimited ? '∞' : `×${count}`}</small></button> })}</div><div className="activity-foot"><span>{selected.description}</span><button className="text-link" onClick={() => { setShopTab('treats'); openModal('shop') }}>Get treats →</button></div></div>
}

function CleanPanel() {
  const cleanTool = useUIStore((s) => s.cleanTool)
  const setCleanTool = useUIStore((s) => s.setCleanTool)
  const cleanCameraMode = useUIStore((s) => s.cleanCameraMode)
  const setCleanCameraMode = useUIStore((s) => s.setCleanCameraMode)
  const pushToast = useUIStore((s) => s.pushToast)
  const openModal = useUIStore((s) => s.openModal)
  const setShopTab = useUIStore((s) => s.setShopTab)
  const ownedToolIds = useGameStore((s) => s.ownedToolIds)
  const glassTool = getGlassTool(useGameStore((s) => s.equippedGlassTool))
  const gravelTool = getGravelTool(useGameStore((s) => s.equippedGravelTool))
  const equipTool = useGameStore((s) => s.equipTool)
  const wasteCount = useGameStore((s) => s.waste.length)
  const category = cleanTool === 'sponge' ? 'glass' : 'gravel'
  const equipped = category === 'glass' ? glassTool : gravelTool
  const choices = TOOL_CATALOG.filter((t) => t.category === category && ownedToolIds.includes(t.id))
  const hint = cleanCameraMode
    ? 'Drag to move the camera, then return to cleaning'
    : cleanTool === 'sponge'
      ? `Drag across the glass to scrub algae with your ${equipped.name} · right-drag to look around`
      : wasteCount > 0
        ? `${wasteCount} bit${wasteCount === 1 ? '' : 's'} of waste glowing on the gravel · drag the ${equipped.name} over them`
        : 'The gravel is spotless! · right-drag to look around'
  return <div className="activity-panel panel clean-panel">
    <div className="activity-heading"><strong>Tank care</strong><span>{hint}</span></div>
    <div className="clean-actions">
      <button className={`tool-option ${cleanTool === 'sponge' && !cleanCameraMode ? 'selected' : ''}`} onClick={() => { setCleanCameraMode(false); setCleanTool('sponge') }}><span>{glassTool.icon}</span><strong>{glassTool.name}</strong><small>Scrub glass</small></button>
      <button className={`tool-option ${cleanTool === 'vacuum' && !cleanCameraMode ? 'selected' : ''}`} onClick={() => { setCleanCameraMode(false); setCleanTool('vacuum') }}><span>{gravelTool.icon}</span><strong>{gravelTool.name}</strong><small>{wasteCount > 0 ? `${wasteCount} to clean` : 'Clear gravel'}</small></button>
      <button className={`tool-option ${cleanCameraMode ? 'selected' : ''}`} aria-pressed={cleanCameraMode} onClick={() => setCleanCameraMode(!cleanCameraMode)}><span>🧭</span><strong>Move camera</strong><small>{cleanCameraMode ? 'On' : 'Look around'}</small></button>
      <Button onClick={() => { if (startWaterChange()) pushToast('Fresh water is on its way!', 'success', '💧'); else pushToast('Water change in progress', 'info', '💧') }} disabled={waterChange.phase !== 'idle'}>💧 Change water</Button>
    </div>
    <div className="tool-switcher">
      {choices.length > 1 && choices.map((t) => <button key={t.id} className={`tool-chip ${equipped.id === t.id ? 'selected' : ''}`} title={t.stat} onClick={() => { equipTool(t.id); setCleanCameraMode(false) }}><span>{t.icon}</span>{t.name}</button>)}
      <button className="text-link" onClick={() => { setShopTab('tools'); openModal('shop') }}>Better tools →</button>
    </div>
  </div>
}

function TankRoster({ habitat, onClose }: { habitat: 'main' | 'nursery'; onClose: () => void }) {
  const allFish = useGameStore((s) => s.ownedFish)
  const fish = allFish.filter((f) => f.habitat === habitat)
  const vitals = useGameStore((s) => s.fishVitals)
  const transferFish = useGameStore((s) => s.transferFish)
  const nurserySession = useGameStore((s) => s.nurserySession)
  const selectFish = useUIStore((s) => s.selectFish)
  const pushToast = useUIStore((s) => s.pushToast)
  const destination = habitat === 'nursery' ? 'main' : 'nursery'
  return <div className="roster"><div className="panel-heading"><strong>{habitat === 'nursery' ? 'Little fish' : 'Your fish'} <span>{fish.length}</span></strong><button className="icon-button" onClick={onClose} aria-label="Close fish list">✕</button></div><div className="roster-list">{fish.length ? fish.map((f) => { const def = getFishDef(f.defId); const makingFriend = nurserySession?.parentIds.includes(f.id) ?? false; return <div className="roster-row" key={f.id}><button className="roster-fish" onClick={() => { selectFish(f.id); onClose() }}><span className="roster-dot" style={{ background: f.inheritance?.color ?? def?.color }} /><span><strong>{f.name}</strong><small>{def?.name ?? 'Fish'} · {Math.round((vitals[f.id]?.growth ?? 0) * 100)}% grown</small></span></button><button className="roster-transfer" disabled={makingFriend} title={makingFriend ? 'Wait for the friendship visit to finish' : `Move ${f.name} to ${destination === 'nursery' ? 'nursery' : 'aquarium'}`} aria-label={`Move ${f.name} to ${destination === 'nursery' ? 'nursery' : 'aquarium'}`} onClick={() => { if (transferFish(f.id, destination)) pushToast(`${f.name} moved to ${destination === 'nursery' ? 'the nursery' : 'your aquarium'}`, 'success', '🐠'); else pushToast('No room there right now', 'warn') }}>{habitat === 'nursery' ? '↩' : '↗'}</button></div> }) : <p className="empty-roster">{habitat === 'nursery' ? 'Send a fish from your aquarium to begin.' : 'Your tank is waiting for a fish!'}</p>}</div></div>
}

function countdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total % 3600 / 60)
  const secs = total % 60
  return hours ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}:${String(secs).padStart(2, '0')}`
}

function FriendshipNursery({ mode }: { mode: AppMode }) {
  const fish = useGameStore((s) => s.ownedFish)
  const eggs = useGameStore((s) => s.nurseryEggs)
  const vitals = useGameStore((s) => s.fishVitals)
  const session = useGameStore((s) => s.nurserySession)
  const startFriendship = useGameStore((s) => s.startFriendship)
  const pushToast = useUIStore((s) => s.pushToast)
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [showRoster, setShowRoster] = useState(true)
  const [manualCollapse, setManualCollapse] = useState<boolean | null>(null)
  const collapsed = manualCollapse ?? mode === 'feed'
  const nurseryFish = fish.filter((f) => f.habitat === 'nursery')
  const grown = nurseryFish.filter((f) => (vitals[f.id]?.growth ?? 0) >= 1)
  const occupied = nurseryFish.length + eggs.length + (session?.eggCount ?? 0)
  const firstFriend = grown.find((f) => f.id === first)
  const clutchRange = firstFriend ? getEggCountRange(firstFriend.defId) : undefined
  const ready = first !== second && grown.some((f) => f.id === first) && grown.some((f) => f.id === second) && occupied + (clutchRange?.[1] ?? NURSERY_CAPACITY) <= NURSERY_CAPACITY
  const firstName = fish.find((f) => f.id === session?.parentIds[0])?.name ?? 'One friend'
  const secondName = fish.find((f) => f.id === session?.parentIds[1])?.name ?? 'another friend'

  return <aside className={`nursery-panel panel ${collapsed ? 'nursery-collapsed' : ''} ${mode === 'feed' ? 'nursery-feeding' : ''}`} aria-label="Friendship nursery">
    <div className="panel-heading nursery-heading"><div><span className="eyebrow">BUBBLE BUDDIES</span><h2>Friendship nursery</h2></div><span className="nursery-badge" title={`${nurseryFish.length} fish, ${eggs.length} eggs, ${session?.eggCount ?? 0} reserved eggs`}>🫧 {occupied}/{NURSERY_CAPACITY}</span><button className="nursery-collapse" onClick={() => setManualCollapse(!collapsed)} aria-expanded={!collapsed} aria-label={collapsed ? 'Show nursery panel' : 'Hide nursery panel'}>{collapsed ? '▾' : '▴'}</button></div>
    {collapsed ? <div className="nursery-peek">{nurseryFish.length} fish · {eggs.length} eggs{session ? ' · Friendship in progress' : ''}</div> : <div className="nursery-body">
      <p className="nursery-intro">A cozy, filtered home for little fish. Two grown fish can become friends and welcome a clutch of 1–6 eggs in {FRIENDSHIP_SECONDS / 60} minutes. Each egg hatches on its own schedule; then its little fish can move to the main aquarium. Caring for your main tank boosts fish sale prices.</p>
      {session ? <div className="friendship-session"><div className="friendship-hearts">💗 🥚 💗</div><strong>{firstName} and {secondName} are becoming friends!</strong><p>A clutch of {session.eggCount} egg{session.eggCount === 1 ? '' : 's'} is reserved · {countdown(session.remainingSeconds)}</p><div className="meter-track"><span className="meter-fill" style={{ width: `${Math.max(0, 100 * (1 - session.remainingSeconds / FRIENDSHIP_SECONDS))}%` }} /></div></div> : <div className="friendship-form"><strong>Pair two grown fish</strong><p>Both stay here while their friendship grows. The first friend sets the 1–6 egg clutch size; babies get their shape and colors from their parents.</p><div className="friend-selects"><label>First friend<select value={first} onChange={(e) => setFirst(e.target.value)}><option value="">Choose fish</option>{grown.map((f) => <option key={f.id} value={f.id}>{f.name} · {getFishDef(f.defId)?.name}</option>)}</select></label><span>💞</span><label>Second friend<select value={second} onChange={(e) => setSecond(e.target.value)}><option value="">Choose fish</option>{grown.filter((f) => f.id !== first).map((f) => <option key={f.id} value={f.id}>{f.name} · {getFishDef(f.defId)?.name}</option>)}</select></label></div>{clutchRange && <small>This pair may welcome {clutchRange[0]}–{clutchRange[1]} eggs; all clutch spaces are reserved while they become friends.</small>}<Button variant="primary" disabled={!ready} onClick={() => { if (startFriendship(first, second)) { setFirst(''); setSecond(''); pushToast('A new friendship is blooming!', 'success', '💗') } else pushToast('These fish are not ready yet', 'warn') }}>Start friendship</Button>{grown.length < 2 && <small>Feed your fish to help them grow. Two fully grown fish are needed.</small>}{(occupied >= NURSERY_CAPACITY || Boolean(clutchRange && occupied + clutchRange[1] > NURSERY_CAPACITY)) && <small>{occupied >= NURSERY_CAPACITY ? 'The nursery is full.' : 'The nursery needs enough open spots for the whole clutch.'}</small>}</div>}
      <div className="egg-watch"><div className="egg-watch-heading"><strong>🥚 Egg watch</strong><span>{eggs.length}</span></div>{eggs.length ? <div className="egg-list">{eggs.map((egg) => { const species = getFishDef(egg.defId); const done = Math.max(0, 1 - egg.remainingSeconds / egg.hatchSeconds); return <div className="egg-card" key={egg.id}><span className="egg-icon" style={{ background: egg.inheritance?.color ?? species?.color }}>🥚</span><div className="egg-details"><div><strong>{species?.name ?? 'Mystery fish'} egg</strong><span>{countdown(egg.remainingSeconds)}</span></div><div className="meter-track"><span className="meter-fill" style={{ width: `${Math.round(done * 100)}%` }} /></div><small>{egg.inheritance ? `Body: ${egg.inheritance.bodyParentName} · Colors: ${egg.inheritance.colorParentName}` : 'Baby stays in the nursery after hatching'}</small></div></div> })}</div> : <p>No eggs yet. Start a friendship to welcome a clutch!</p>}</div>
      <button className="roster-reveal" onClick={() => setShowRoster(!showRoster)}>{showRoster ? 'Hide fish list ▲' : `Show fish list (${nurseryFish.length}) ▼`}</button>{showRoster && <TankRoster habitat="nursery" onClose={() => setShowRoster(false)} />}
    </div>}
  </aside>
}

function PhotoButton() {
  const pushToast = useUIStore((s) => s.pushToast)
  const capture = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.tank-canvas, .tank-canvas canvas')
    if (!canvas) { pushToast('Aquarium canvas unavailable', 'warn'); return }
    try {
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `my-aquarium-${new Date().toISOString().slice(0, 10)}.png`
      link.click()
      pushToast('Aquarium photo saved!', 'success', '📸')
    } catch { pushToast('Could not save the aquarium photo', 'warn', '📸') }
  }
  return <button className="top-action" onClick={capture} title="Save aquarium photo" aria-label="Save aquarium photo">📸 <span>Photo</span></button>
}

export function HUD() {
  const currency = useGameStore((s) => s.currency)
  const xp = useGameStore((s) => s.xp)
  const fish = useGameStore((s) => s.ownedFish)
  const vitals = useGameStore((s) => s.fishVitals)
  const murk = useGameStore((s) => s.murk)
  const waste = useGameStore((s) => s.waste.length)
  const sound = useGameStore((s) => s.settings.sound)
  const setSetting = useGameStore((s) => s.setSetting)
  const mode = useUIStore((s) => s.mode)
  const activeTank = useUIStore((s) => s.activeTank)
  const setActiveTank = useUIStore((s) => s.setActiveTank)
  const selectedFishId = useUIStore((s) => s.selectedFishId)
  const selectFish = useUIStore((s) => s.selectFish)
  const setMode = useUIStore((s) => s.setMode)
  const activeModal = useUIStore((s) => s.activeModal)
  const openModal = useUIStore((s) => s.openModal)
  const night = useUIStore((s) => s.night)
  const toggleNight = useUIStore((s) => s.toggleNight)
  const toasts = useUIStore((s) => s.toasts)
  const dismissToast = useUIStore((s) => s.dismissToast)
  const levelUp = useUIStore((s) => s.levelUp)
  const setLevelUp = useUIStore((s) => s.setLevelUp)
  const welcomeBack = useUIStore((s) => s.welcomeBack)
  const setWelcomeBack = useUIStore((s) => s.setWelcomeBack)
  const [showMainRoster, setShowMainRoster] = useState(false)
  const progress = levelFromXp(xp)
  const mainFish = fish.filter((f) => f.habitat === 'main')
  const hungry = mainFish.filter((f) => (vitals[f.id]?.hunger ?? 0) > 0.65).length
  const algae = algaeCoverage()
  return <>
    <header className="hud-top"><div className="hud-brand"><span className="brand-mark">🐠</span><AquariumName /></div><div className="hud-status"><div className="currency-display" title="Coins"><span>🪙</span><strong>{currency.toLocaleString()}</strong></div><div className="level-display" title={`${progress.into} of ${progress.needed} XP toward next level`}><span>LVL {progress.level}</span><div className="meter-track"><span className="meter-fill" style={{ width: `${progress.level === MAX_LEVEL ? 100 : Math.round(progress.into / progress.needed * 100)}%` }} /></div></div></div><div className="tank-switch" role="group" aria-label="Aquarium view"><button className={activeTank === 'main' ? 'active' : ''} aria-pressed={activeTank === 'main'} onClick={() => { setActiveTank('main'); setMode('view'); selectFish(null); setShowMainRoster(false) }}>🐠 Aquarium</button><button className={activeTank === 'nursery' ? 'active' : ''} aria-pressed={activeTank === 'nursery'} onClick={() => { setActiveTank('nursery'); setMode('view'); selectFish(null); setShowMainRoster(false) }}>🫧 Nursery</button></div><div className="hud-actions"><button className="top-action" onClick={toggleNight} aria-pressed={night} title={night ? 'Switch to day' : 'Switch to night'}>{night ? '☀️' : '🌙'} <span>{night ? 'Day' : 'Night'}</span></button><button className="top-action" onClick={() => setSetting('sound', !sound)} aria-pressed={sound} title={sound ? 'Mute sound' : 'Enable sound'}>{sound ? '🔊' : '🔇'} <span>Sound</span></button><PhotoButton /></div></header>
    {activeTank === 'main' && <div className="care-strip panel" aria-label="Tank health"><span className="care-title">TANK CARE</span><Meter label="Fish hungry" value={mainFish.length ? hungry / mainFish.length : 0} detail={`${hungry}/${mainFish.length}`} inverted /><Meter label="Algae" value={algae} detail={`${Math.round(algae * 100)}%`} inverted /><Meter label="Murky water" value={murk} detail={`${Math.round(murk * 100)}%`} inverted /><Meter label="Waste" value={Math.min(1, waste / 12)} detail={`${waste}`} inverted /></div>}
    {activeTank === 'main' && <button className="roster-toggle panel" onClick={() => setShowMainRoster(!showMainRoster)}>🐟 Fish list <span>{mainFish.length}</span></button>}
    <SaveIndicator />
    {selectedFishId && <FishInfoCard key={selectedFishId} />}
    {activeTank === 'main' && showMainRoster && !selectedFishId && <aside className="main-roster-panel panel"><TankRoster habitat="main" onClose={() => setShowMainRoster(false)} /></aside>}
    {activeTank === 'nursery' && !selectedFishId && <FriendshipNursery key={mode} mode={mode} />}
    {mode === 'feed' && <FeedTray level={progress.level} />}
    {mode === 'clean' && <CleanPanel />}
    {mode === 'decorate' && activeTank === 'main' && <InventoryPanel />}
    <nav className="mode-toolbar panel" aria-label="Game modes">{modes.map((item) => <button key={item.id} className={`mode-button ${item.id === mode ? 'active' : ''}`} aria-current={item.id === mode ? 'page' : undefined} onClick={() => { if (item.id === 'shop') openModal('shop'); else { if (item.id === 'clean' || item.id === 'decorate') { setActiveTank('main'); selectFish(null) } setMode(item.id) } }}><span>{item.icon}</span><strong>{item.label}</strong></button>)}</nav>
    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <button key={toast.id} className={`game-toast toast-${toast.tone}`} onClick={() => dismissToast(toast.id)}>{toast.icon && <span>{toast.icon}</span>}{toast.text}<span className="toast-close">✕</span></button>)}</div>
    {activeModal === 'shop' && <ShopPanel />}
    {levelUp && <Modal title={`Level ${levelUp.level} reached!`} onClose={() => setLevelUp(null)}><div className="reward-modal"><div className="reward-icon">🌟</div><p>Your aquarium is growing! You earned <strong>🪙 {levelUp.coins}</strong>.</p>{levelUp.treats.length > 0 && <p>Bonus treats: {levelUp.treats.map((t) => `${getFoodDef(t.id).name} ×${t.count}`).join(', ')}</p>}{levelUp.unlocks.length > 0 && <><h3>New in the shop</h3><p>{levelUp.unlocks.join(' · ')}</p></>}<Button variant="primary" onClick={() => setLevelUp(null)}>Keep playing</Button></div></Modal>}
    {welcomeBack && <Modal title="Welcome back!" onClose={() => setWelcomeBack(null)}><div className="reward-modal"><div className="reward-icon">🐠</div><p>Your aquarium kept swimming while you were away for {welcomeBack.minutesAway} minutes.</p><p><strong>🪙 +{welcomeBack.coins}</strong> coins earned</p>{welcomeBack.hungryFish > 0 && <p>{welcomeBack.hungryFish} fish could use a snack.</p>}{welcomeBack.murkPercent > 20 && <p>Water is {welcomeBack.murkPercent}% murky. Time for a clean?</p>}<Button variant="primary" onClick={() => setWelcomeBack(null)}>Dive in</Button></div></Modal>}
  </>
}
