import { Modal } from './components/Modal'
import { ShopItemCard } from './ShopItemCard'
import { useGameStore } from '../state/useGameStore'
import { useUIStore, type ShopTab } from '../state/useUIStore'
import { levelFromXp } from '../state/progression'
import { DECORATION_CATALOG } from '../scene/decorations/decorationDefinitions'
import { FISH_CATALOG, MAX_OWNED_FISH } from '../scene/fish/fishDefinitions'
import { FOOD_CATALOG } from '../scene/food/foodDefinitions'
import { BACKGROUND_CATALOG } from '../scene/backgrounds'
import { SUBSTRATE_CATALOG } from '../scene/substrates'
import { STAND_CATALOG } from '../scene/stands/standDefinitions'
import { TOOL_CATALOG } from '../scene/cleaning/toolDefinitions'

const tabs: Array<{ id: ShopTab; icon: string; name: string }> = [
  { id: 'fish', icon: '🐠', name: 'Fish' },
  { id: 'decorations', icon: '🪸', name: 'Decor' },
  { id: 'treats', icon: '🍬', name: 'Treats' },
  { id: 'tools', icon: '🧽', name: 'Tools' },
  { id: 'backgrounds', icon: '🌅', name: 'Backgrounds' },
  { id: 'gravel', icon: '🪨', name: 'Gravel' },
  { id: 'stands', icon: '🗄️', name: 'Stands' },
]

function sortShopItems<T extends { unlockLevel: number }>(items: readonly T[], price: (item: T) => number): T[] {
  return items.map((item, index) => ({ item, index })).sort((a, b) =>
    a.item.unlockLevel - b.item.unlockLevel || price(a.item) - price(b.item) || a.index - b.index,
  ).map(({ item }) => item)
}

export function ShopPanel() {
  const shopTab = useUIStore((s) => s.shopTab)
  const activeTank = useUIStore((s) => s.activeTank)
  const setShopTab = useUIStore((s) => s.setShopTab)
  const openModal = useUIStore((s) => s.openModal)
  const pushToast = useUIStore((s) => s.pushToast)
  const currency = useGameStore((s) => s.currency)
  const level = levelFromXp(useGameStore((s) => s.xp)).level
  const unlockedDecorationDefIds = useGameStore((s) => s.unlockedDecorationDefIds)
  const ownedFish = useGameStore((s) => s.ownedFish)
  const treats = useGameStore((s) => s.treats)
  const backgroundId = useGameStore((s) => s.backgroundId)
  const unlockedBackgroundIds = useGameStore((s) => s.unlockedBackgroundIds)
  const substrateId = useGameStore((s) => s.substrateId)
  const unlockedSubstrateIds = useGameStore((s) => s.unlockedSubstrateIds)
  const buyDecoration = useGameStore((s) => s.buyDecoration)
  const buyFish = useGameStore((s) => s.buyFish)
  const buyTreatPack = useGameStore((s) => s.buyTreatPack)
  const buyBackground = useGameStore((s) => s.buyBackground)
  const buySubstrate = useGameStore((s) => s.buySubstrate)
  const setBackground = useGameStore((s) => s.setBackground)
  const setSubstrate = useGameStore((s) => s.setSubstrate)
  const standId = useGameStore((s) => s.standId)
  const unlockedStandIds = useGameStore((s) => s.unlockedStandIds)
  const buyStand = useGameStore((s) => s.buyStand)
  const setStand = useGameStore((s) => s.setStand)
  const ownedToolIds = useGameStore((s) => s.ownedToolIds)
  const equippedGlassTool = useGameStore((s) => s.equippedGlassTool)
  const equippedGravelTool = useGameStore((s) => s.equippedGravelTool)
  const buyTool = useGameStore((s) => s.buyTool)
  const equipTool = useGameStore((s) => s.equipTool)
  const fishAtCap = ownedFish.length >= MAX_OWNED_FISH

  return <Modal title="Aquarium shop" onClose={() => openModal(null)}>
    <div className="shop-intro"><span>Make your little ocean your own.</span><strong>🪙 {currency.toLocaleString()}</strong></div>
    <div className="shop-tabs" role="tablist" aria-label="Shop categories">{tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={shopTab === tab.id} className={`shop-tab ${shopTab === tab.id ? 'active' : ''}`} onClick={() => setShopTab(tab.id)}><span>{tab.icon}</span>{tab.name}</button>)}</div>
    {shopTab === 'fish' && <><p className="shop-section-note">Meet your next tank mate · {ownedFish.length}/{MAX_OWNED_FISH} creatures{activeTank === 'nursery' ? ' · New fish arrive in your main aquarium' : ''}</p><div className="shop-grid">{sortShopItems(FISH_CATALOG, (def) => def.cost).map((def) => <ShopItemCard key={def.id} previewKey={def.id} name={def.name} description={def.description} color={def.color} cost={def.cost} rarity={def.rarity} unlockLevel={level < def.unlockLevel ? def.unlockLevel : undefined} countOwned={ownedFish.filter((f) => f.defId === def.id).length} affordable={currency >= def.cost && !fishAtCap} unavailableText={fishAtCap ? 'Tank full' : undefined} onBuy={() => { const id = buyFish(def.id); if (id) pushToast(`${def.name} joined your aquarium!`, 'success', '🐠'); else if (fishAtCap) pushToast('Your tank is full', 'warn') }} />)}</div></>}
    {shopTab === 'decorations' && <><p className="shop-section-note">Buy once, place as many as you like in Decorate mode. ✨ Gadgets give your main tank a bonus while one is placed.</p><div className="shop-grid">{sortShopItems(DECORATION_CATALOG, (def) => def.cost).map((def) => <ShopItemCard key={def.id} previewKey={def.id} name={def.name} description={def.description} color={def.color} cost={def.cost} rarity={def.rarity} badge={def.bonus?.label} unlockLevel={level < def.unlockLevel ? def.unlockLevel : undefined} owned={unlockedDecorationDefIds.includes(def.id)} affordable={currency >= def.cost} onBuy={() => { if (buyDecoration(def.id)) pushToast(def.bonus ? `${def.name} added! Place it in your tank to switch on its bonus.` : `${def.name} added to your decorations!`, 'success', def.bonus ? '✨' : '🪸') }} />)}</div></>}
    {shopTab === 'tools' && <><p className="shop-section-note">Upgrade your cleaning kit. Bigger tools clean more glass and gravel in one go.</p><div className="shop-grid">{sortShopItems(TOOL_CATALOG, (def) => def.cost).map((def) => { const equipped = def.id === equippedGlassTool || def.id === equippedGravelTool; return <ShopItemCard key={def.id} name={def.name} description={def.description} color="#2a8f9a" icon={def.icon} cost={def.cost} rarity={def.rarity} badge={`${def.category === 'glass' ? 'Glass' : 'Gravel'} · ${def.stat}`} owned={ownedToolIds.includes(def.id)} equipped={equipped} unlockLevel={level < def.unlockLevel ? def.unlockLevel : undefined} affordable={currency >= def.cost} onBuy={() => { if (buyTool(def.id)) pushToast(`${def.name} is ready to use in Clean mode!`, 'success', def.icon) }} onEquip={() => { equipTool(def.id); pushToast(`${def.name} equipped`, 'info', def.icon) }} /> })}</div></>}
    {shopTab === 'stands' && <><p className="shop-section-note">Give your aquarium a new stand to sit on.</p><div className="shop-grid">{sortShopItems(STAND_CATALOG, (def) => def.cost).map((def) => <ShopItemCard key={def.id} name={def.name} description={def.description} color={def.swatch[0]} swatch={def.swatch} icon={def.icon} cost={def.cost} rarity={def.rarity} owned={unlockedStandIds.includes(def.id)} equipped={standId === def.id} unlockLevel={level < def.unlockLevel ? def.unlockLevel : undefined} affordable={currency >= def.cost} onBuy={() => { if (buyStand(def.id)) pushToast(`${def.name} installed!`, 'success', def.icon) }} onEquip={() => { setStand(def.id); pushToast(`${def.name} selected`, 'info', def.icon) }} />)}</div></>}
    {shopTab === 'treats' && <><p className="shop-section-note">Special snacks give fish a little extra magic. Pellets and flakes are always free.</p><div className="shop-grid">{sortShopItems(FOOD_CATALOG, (def) => def.packCost).map((def) => <ShopItemCard key={def.id} name={def.name} description={def.description} color={def.color} icon={def.icon} cost={def.packCost} packSize={def.unlimited ? undefined : def.packSize} owned={def.unlimited} countOwned={def.unlimited ? undefined : treats[def.id] ?? 0} unlockLevel={level < def.unlockLevel ? def.unlockLevel : undefined} affordable={currency >= def.packCost} onBuy={() => { if (buyTreatPack(def.id)) pushToast(`${def.packSize} ${def.name} added!`, 'success', def.icon) }} />)}</div></>}
    {shopTab === 'backgrounds' && <><p className="shop-section-note">Set the scene behind your main aquarium. The nursery keeps its cozy backdrop.</p><div className="shop-grid">{sortShopItems(BACKGROUND_CATALOG, (def) => def.cost).map((def) => <ShopItemCard key={def.id} name={def.name} description={def.description} color={def.swatch[0]} swatch={def.swatch} icon="🌊" cost={def.cost} owned={unlockedBackgroundIds.includes(def.id)} equipped={backgroundId === def.id} unlockLevel={level < def.unlockLevel ? def.unlockLevel : undefined} affordable={currency >= def.cost} onBuy={() => { if (buyBackground(def.id)) pushToast(`${def.name} is your new backdrop!`, 'success', '🌅') }} onEquip={() => { setBackground(def.id); pushToast(`${def.name} selected`, 'info', '🌅') }} />)}</div></>}
    {shopTab === 'gravel' && <><p className="shop-section-note">Change the look of your main tank floor. The nursery keeps its soft gravel.</p><div className="shop-grid">{sortShopItems(SUBSTRATE_CATALOG, (def) => def.cost).map((def) => <ShopItemCard key={def.id} name={def.name} description={def.description} color={def.base} swatch={[def.base, def.baseAlt]} icon="🪨" cost={def.cost} owned={unlockedSubstrateIds.includes(def.id)} equipped={substrateId === def.id} unlockLevel={level < def.unlockLevel ? def.unlockLevel : undefined} affordable={currency >= def.cost} onBuy={() => { if (buySubstrate(def.id)) pushToast(`${def.name} is now in your tank!`, 'success', '🪨') }} onEquip={() => { setSubstrate(def.id); pushToast(`${def.name} selected`, 'info', '🪨') }} />)}</div></>}
  </Modal>
}
