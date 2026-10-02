import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { levelFromXp } from '../state/progression'
import { FISH_CATALOG, getFishDef, isCleanupCrew } from '../scene/fish/fishDefinitions'
import { BRED_COINS, DISCOVERY_XP, FISHPEDIA_MILESTONES, fishpediaTotals, milestoneCoins, MORPH_COINS } from '../state/fishpedia'
import { MORPHS } from '../state/morphs'
import { getEggCountRange } from '../state/nursery'
import { fishPreviewKey, usePreviewStore } from '../state/usePreviewStore'
import type { FishDefinition, FishpediaEntry, Rarity } from '../state/types'
import { ItemThumbnail } from './ItemThumbnail'
import { Modal } from './components/Modal'
import { Button } from './components/Button'

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']
const ZONES: Record<FishDefinition['zone'], string> = {
  top: 'Near the surface',
  middle: 'Mid-water',
  bottom: 'Down on the gravel',
  any: 'All over the tank',
}
/** Book order: by rarity, then by when each species unlocks. */
const BOOK_ORDER = RARITIES.flatMap((r) => FISH_CATALOG.filter((d) => d.rarity === r).sort((a, b) => a.unlockLevel - b.unlockLevel))

type Filter = 'all' | 'found' | 'missing'

/** The collection book: every species and rare morph, silhouettes until you find them. */
export function Fishpedia() {
  const open = useUIStore((s) => s.activeModal === 'fishpedia')
  const pick = useUIStore((s) => s.fishpediaPick)
  if (!open) return null
  return (
    <Modal title="📖 Fishpedia" onClose={() => useUIStore.getState().openModal(null)} className="modal-wide">
      {pick && getFishDef(pick) ? <EntryPage key={pick} defId={pick} /> : <Overview />}
    </Modal>
  )
}

function MorphDots({ entry }: { entry?: FishpediaEntry }) {
  return (
    <span className="pedia-dots" aria-label={`${entry?.morphs?.length ?? 0} of ${MORPHS.length} rare morphs found`}>
      {MORPHS.map((m) => {
        const has = entry?.morphs?.includes(m.id)
        return <i key={m.id} className={has ? 'is-found' : ''} style={has ? { background: m.color } : undefined} title={has ? `${m.name} morph found` : 'Morph not found yet'} />
      })}
    </span>
  )
}

function Overview() {
  const book = useGameStore((s) => s.fishpedia)
  const level = useGameStore((s) => levelFromXp(s.xp).level)
  const totals = useMemo(() => fishpediaTotals(book), [book])
  const [filter, setFilter] = useState<Filter>('all')
  const next = FISHPEDIA_MILESTONES.find((m) => totals.species < m)
  return (
    <div className="pedia">
      <div className="pedia-summary">
        <div className="pedia-stat">
          <strong>{totals.species}<small>/{totals.speciesTotal}</small></strong>
          <span>Species</span>
          <span className="bar"><span style={{ width: `${(totals.species / totals.speciesTotal) * 100}%` }} /></span>
        </div>
        <div className="pedia-stat">
          <strong>{totals.bred}<small>/{totals.speciesTotal}</small></strong>
          <span>Nursery stamps</span>
          <span className="bar"><span style={{ width: `${(totals.bred / totals.speciesTotal) * 100}%` }} /></span>
        </div>
        <div className="pedia-stat">
          <strong>{totals.morphs}<small>/{totals.morphsTotal}</small></strong>
          <span>Rare morphs</span>
          <span className="bar"><span style={{ width: `${(totals.morphs / totals.morphsTotal) * 100}%` }} /></span>
        </div>
      </div>

      <div className="pedia-milestones" aria-label="Species milestones">
        {FISHPEDIA_MILESTONES.map((m, i) => {
          const done = totals.species >= m
          const last = i === FISHPEDIA_MILESTONES.length - 1
          return (
            <span key={m} className={`pedia-milestone ${done ? 'is-done' : ''} ${m === next ? 'is-next' : ''}`} title={`${last ? 'Every species' : `${m} species`}: 🪙 ${milestoneCoins(m)}`}>
              <b>{done ? '✓' : last ? '★' : m}</b>
              <small>🪙 {milestoneCoins(m)}</small>
            </span>
          )
        })}
      </div>
      <p className="pedia-next">
        {next ? (
          <>
            <strong>{next - totals.species}</strong> more species to the next milestone (🪙 {milestoneCoins(next)})
          </>
        ) : (
          <>Every species found. What a collection! 🏆</>
        )}
      </p>

      <div className="subtabs pedia-filter" role="tablist">
        {(['all', 'found', 'missing'] as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`subtab ${filter === f ? 'is-active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'found' ? 'Found' : 'Still to find'}
          </button>
        ))}
      </div>

      {RARITIES.map((rarity) => {
        const all = BOOK_ORDER.filter((d) => d.rarity === rarity)
        const shown = all.filter((d) => (filter === 'all' ? true : filter === 'found' ? book[d.id] : !book[d.id]))
        if (shown.length === 0) return null
        return (
          <section key={rarity} className="pedia-section">
            <h3>
              <span className={`rarity rarity-${rarity}`}>{rarity}</span>
              <small>
                {all.filter((d) => book[d.id]).length} of {all.length}
              </small>
            </h3>
            <div className="pedia-grid">
              {shown.map((def) => {
                const entry = book[def.id]
                const locked = !entry && def.unlockLevel > level
                return (
                  <button key={def.id} className={`pedia-card ${entry ? 'is-found' : 'is-missing'}`} onClick={() => useUIStore.getState().setFishpediaPick(def.id)}>
                    <span className="pedia-art">
                      <ItemThumbnail previewKey={def.id} color={def.color} className="pedia-thumb" />
                      {entry?.bred && (
                        <span className="pedia-stamp" title="Bred in the nursery">
                          🐣
                        </span>
                      )}
                    </span>
                    <strong>{entry ? def.name : '???'}</strong>
                    {entry ? <MorphDots entry={entry} /> : <small>{locked ? `🔒 Level ${def.unlockLevel}` : 'In the shop'}</small>}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      <p className="pedia-hint">Species join the book when they join your tanks. Rare colour morphs only hatch from nursery eggs.</p>
    </div>
  )
}

function EntryPage({ defId }: { defId: string }) {
  const def = getFishDef(defId)!
  const entry = useGameStore((s) => s.fishpedia[defId])
  const level = useGameStore((s) => levelFromXp(s.xp).level)
  const owned = useGameStore((s) => s.ownedFish.reduce((n, f) => n + (f.defId === defId ? 1 : 0), 0))
  const setPick = useUIStore((s) => s.setFishpediaPick)
  const index = BOOK_ORDER.findIndex((d) => d.id === defId)
  const found = Boolean(entry)
  const locked = !found && def.unlockLevel > level
  const [eggsMin, eggsMax] = getEggCountRange(defId)

  // Morph thumbnails are rendered on demand, the first time a page is opened.
  useEffect(() => {
    usePreviewStore.getState().requestPreviews(MORPHS.map((m) => ({ key: fishPreviewKey(defId, m.id), kind: 'fish' as const, defId, morph: m.id })))
  }, [defId])

  const go = (step: number) => setPick(BOOK_ORDER[(index + step + BOOK_ORDER.length) % BOOK_ORDER.length].id)
  return (
    <div className="pedia-page">
      <div className="pedia-nav">
        <button className="link-btn" onClick={() => setPick(null)}>
          ‹ All species
        </button>
        <span>
          No. {index + 1} of {BOOK_ORDER.length}
        </span>
        <span className="pedia-arrows">
          <button className="icon-btn icon-btn-sm" onClick={() => go(-1)} aria-label="Previous species">
            ‹
          </button>
          <button className="icon-btn icon-btn-sm" onClick={() => go(1)} aria-label="Next species">
            ›
          </button>
        </span>
      </div>

      <div className={`pedia-hero ${found ? 'is-found' : 'is-missing'}`}>
        <span className="pedia-art pedia-art-lg">
          <ItemThumbnail previewKey={def.id} color={def.color} className="pedia-thumb" />
        </span>
        <div className="pedia-hero-copy">
          <h3>{found ? def.name : '???'}</h3>
          <div className="pedia-tags">
            <span className={`rarity rarity-${def.rarity}`}>{def.rarity}</span>
            {entry?.bred && <span className="pedia-badge">🐣 Bred in the nursery</span>}
          </div>
          {found ? (
            <p>{def.description}</p>
          ) : locked ? (
            <p>Reach level {def.unlockLevel} to find this one in the shop.</p>
          ) : (
            <>
              <p>Waiting in the shop for 🪙 {def.cost.toLocaleString()}. Bring one home to fill in this page!</p>
              <Button
                onClick={() => {
                  useUIStore.getState().openModal(null)
                  useUIStore.getState().openShop('fish')
                }}
              >
                🛍️ Go to shop
              </Button>
            </>
          )}
        </div>
      </div>

      {found && (
        <dl className="pedia-facts">
          <div>
            <dt>Lives</dt>
            <dd>{ZONES[def.zone]}</dd>
          </div>
          <div>
            <dt>Diet</dt>
            <dd>{isCleanupCrew(def) ? 'Cleanup crew' : def.appetite > 1.1 ? 'Big appetite' : def.appetite < 0.9 ? 'Light eater' : 'Food you drop'}</dd>
          </div>
          <div>
            <dt>Clutch</dt>
            <dd>{eggsMin === eggsMax ? `${eggsMin} egg${eggsMin === 1 ? '' : 's'}` : `${eggsMin}–${eggsMax} eggs`}</dd>
          </div>
          <div>
            <dt>In your tanks</dt>
            <dd>{owned}</dd>
          </div>
          <div>
            <dt>First joined</dt>
            <dd>{new Date(entry.discoveredAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      )}

      <h4 className="pedia-subhead">
        Rare morphs <small>{entry?.morphs?.length ?? 0} of {MORPHS.length}</small>
      </h4>
      <div className="pedia-morphs">
        {MORPHS.map((m) => {
          const has = Boolean(entry?.morphs?.includes(m.id))
          return (
            <div key={m.id} className={`pedia-morph ${has ? 'is-found' : 'is-missing'}`}>
              <span className="pedia-art">
                <ItemThumbnail previewKey={fishPreviewKey(defId, m.id)} color={m.color} className="pedia-thumb" />
              </span>
              <strong>{has ? `${m.icon} ${m.name}` : '???'}</strong>
              <small>{has ? m.description : `About ${Math.round(m.chance * 1000) / 10}% of eggs`}</small>
            </div>
          )
        })}
      </div>
      <p className="pedia-hint">
        First {def.name}: +{DISCOVERY_XP[def.rarity]} XP · first hatched in the nursery: +{BRED_COINS[def.rarity]} coins · each rare morph: +{MORPH_COINS} coins. A morph parent makes
        rare eggs much more likely.
      </p>
    </div>
  )
}
