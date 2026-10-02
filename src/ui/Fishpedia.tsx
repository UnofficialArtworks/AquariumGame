import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { levelFromXp } from '../state/progression'
import { FISH_CATALOG, getFishDef, isCleanupCrew } from '../scene/fish/fishDefinitions'
import { BRED_COINS, DISCOVERY_XP, FISHPEDIA_MILESTONES, fishpediaTotals, milestoneCoins, MORPH_COINS } from '../state/fishpedia'
import { getEggCountRange } from '../state/nursery'
import { fishPreviewKey, usePreviewStore, visitorPreviewKey } from '../state/usePreviewStore'
import type { FishDefinition, FishpediaEntry, Rarity } from '../state/types'
import { ItemThumbnail } from './ItemThumbnail'
import { Modal } from './components/Modal'
import { Button } from './components/Button'
import { Coin } from './Coin'
import { canVisit, VISITORS, visitorTotals } from '../state/visitors'
import { FISH_FACTS } from '../state/facts'
import { oceanTotals, tideReward } from '../state/ocean'
import { getSeason, inSeason } from '../state/seasons'
import { hasPatterns, PATTERNS, patternsFound } from '../state/patterns'
import { getFoodDef } from '../scene/food/foodDefinitions'
import { getMorph, MORPHS } from '../state/morphs'

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
type Book = 'fish' | 'visitors' | 'ocean'

/** The collection book: every species and rare morph, silhouettes until you find them. */
export function Fishpedia() {
  const open = useUIStore((s) => s.activeModal === 'fishpedia')
  const pick = useUIStore((s) => s.fishpediaPick)
  const [book, setBook] = useState<Book>('fish')
  if (!open) return null
  return (
    <Modal title="📖 Fishpedia" onClose={() => useUIStore.getState().openModal(null)} className="modal-wide">
      {pick && getFishDef(pick) ? (
        <EntryPage key={pick} defId={pick} />
      ) : (
        <>
          <div className="subtabs goals-tabs" role="tablist">
            <button role="tab" aria-selected={book === 'fish'} className={`subtab ${book === 'fish' ? 'is-active' : ''}`} onClick={() => setBook('fish')}>
              <span>🐠</span> Fish
            </button>
            <button role="tab" aria-selected={book === 'visitors'} className={`subtab ${book === 'visitors' ? 'is-active' : ''}`} onClick={() => setBook('visitors')}>
              <span>✨</span> Visitors
            </button>
            <button role="tab" aria-selected={book === 'ocean'} className={`subtab ${book === 'ocean' ? 'is-active' : ''}`} onClick={() => setBook('ocean')}>
              <span>🌊</span> Ocean
            </button>
          </div>
          {book === 'fish' ? <Overview /> : book === 'visitors' ? <VisitorBook /> : <OceanBook />}
        </>
      )}
    </Modal>
  )
}

/** Fish you've released, still swimming in your Open Ocean, and the tide they've raised. */
function OceanBook() {
  const ocean = useGameStore((s) => s.ocean)
  const stats = useGameStore((s) => s.stats)
  const totals = oceanTotals({ ocean, stats })
  const shown = ocean.slice(-24)
  const reward = tideReward(totals.tide + 1)

  // Morph thumbnails are made on demand.
  useEffect(() => {
    usePreviewStore.getState().requestPreviews(
      ocean
        .filter((f) => f.morph || f.pattern)
        .map((f) => ({ key: fishPreviewKey(f.defId, f.morph, f.pattern), kind: 'fish' as const, defId: f.defId, morph: f.morph, pattern: f.pattern })),
    )
  }, [ocean])

  return (
    <div className="pedia">
      <div className="ocean-view" aria-label="Your Open Ocean">
        <span className="ocean-rays" aria-hidden />
        {shown.length === 0 && (
          <p className="ocean-empty">
            Your ocean is waiting for its first fish. When a fish is fully grown, tap it, choose <strong>👋 Goodbye</strong>, then <strong>🌊 Release</strong>.
          </p>
        )}
        {shown.map((f, i) => {
          const def = getFishDef(f.defId)
          const left = i % 2 === 1
          const seed = (i * 7919 + f.name.length * 31) % 100
          return (
            <span
              key={f.id}
              className={`ocean-fish ${left ? 'is-left' : ''}`}
              title={`${f.name} the ${def?.name ?? 'fish'}`}
              style={{ '--y': `${6 + ((i * 37) % 68)}%`, '--d': `${22 + (seed % 16)}s`, '--delay': `-${(seed * 0.37).toFixed(1)}s` } as CSSProperties}
            >
              <ItemThumbnail previewKey={fishPreviewKey(f.defId, f.morph, f.pattern)} color={def?.color ?? '#7fd3ff'} className="ocean-thumb" />
            </span>
          )
        })}
      </div>
      <div className="pedia-summary">
        <div className="pedia-stat">
          <strong>Tide {totals.tide}</strong>
          <span>
            {totals.nextAt - totals.released} more to Tide {totals.tide + 1}
          </span>
          <span className="bar">
            <span style={{ width: `${((totals.released - totals.fromAt) / (totals.nextAt - totals.fromAt)) * 100}%` }} />
          </span>
        </div>
        <div className="pedia-stat">
          <strong>{totals.released}</strong>
          <span>Fish released</span>
        </div>
        <div className="pedia-stat">
          <strong>
            {totals.species}
            <small>/{FISH_CATALOG.length}</small>
          </strong>
          <span>Ocean stamps</span>
        </div>
      </div>
      <p className="pedia-next">
        Next tide: <Coin /> {reward.coins} and {reward.treatCount} {getFoodDef(reward.treat).name}. Every tide pays out, and the tides never stop rising.
      </p>
      {ocean.length > 0 && (
        <ul className="ocean-log">
          {[...ocean]
            .reverse()
            .slice(0, 12)
            .map((f) => (
              <li key={f.id}>
                <strong>{f.name}</strong> the {getFishDef(f.defId)?.name}
                {f.morph ? ` ${getMorph(f.morph)?.icon ?? ''}` : ''} <small>{new Date(f.at).toLocaleDateString()}</small>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

/** Every visitor, as a silhouette with a hint until you've met it. */
function VisitorBook() {
  const log = useGameStore((s) => s.visitors)
  const placed = useGameStore((s) => s.placedDecorations)
  const gifts = useGameStore((s) => s.stats.giftsOpened)
  const night = useUIStore((s) => s.night)
  const here = useUIStore((s) => s.visit?.visitorId)
  const { met, total } = visitorTotals(log)

  // Thumbnails are rendered the first time the page is opened.
  useEffect(() => {
    usePreviewStore.getState().requestPreviews(VISITORS.map((v) => ({ key: visitorPreviewKey(v.id), kind: 'visitor' as const, defId: v.id })))
  }, [])

  return (
    <div className="pedia">
      <div className="pedia-summary">
        <div className="pedia-stat">
          <strong>{met}<small>/{total}</small></strong>
          <span>Visitors met</span>
          <span className="bar"><span style={{ width: `${(met / total) * 100}%` }} /></span>
        </div>
        <div className="pedia-stat">
          <strong>{gifts}</strong>
          <span>Gifts opened</span>
        </div>
      </div>
      <p className="pedia-next">Visitors drop by when your tank has something they like. They stay a little while, then leave a gift on the gravel. Tap them to say hi!</p>
      <div className="visitor-grid">
        {VISITORS.map((v) => {
          const record = log[v.id]
          const ready = canVisit(v, placed, 'any')
          const now = canVisit(v, placed, night ? 'night' : 'day')
          return (
            <div key={v.id} className={`visitor-card ${record ? 'is-found' : 'is-missing'} ${here === v.id ? 'is-here' : ''}`}>
              <span className="pedia-art">
                <ItemThumbnail previewKey={visitorPreviewKey(v.id)} color={v.look.color} className="pedia-thumb" />
              </span>
              <div className="visitor-copy">
                <strong>{record ? `${v.icon} ${v.name}` : '???'}</strong>
                <span className={`rarity rarity-${v.rarity}`}>{v.rarity}</span>
                <p>{record ? v.description : v.hint}</p>
                <small>
                  {here === v.id
                    ? '👀 Visiting right now!'
                    : v.needs.season && !inSeason(v.needs.season)
                      ? `📅 Back for ${getSeason(v.needs.season)?.name} (${getSeason(v.needs.season)?.when})${record ? ` · ${record.visits} visit${record.visits === 1 ? '' : 's'}` : ''}`
                      : record
                      ? `Comes for: ${v.likes} · ${record.visits} visit${record.visits === 1 ? '' : 's'}`
                      : ready && !now
                        ? '🌙 Your tank is ready. It comes after dark.'
                        : ready
                          ? '✨ Your tank is ready. Keep an eye out!'
                          : '🔍 Not tempted by your tank yet'}
                </small>
              </div>
            </div>
          )
        })}
      </div>
    </div>
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
        <div className="pedia-stat">
          <strong>{totals.patterns}<small>/{totals.patternsTotal}</small></strong>
          <span>Patterns</span>
          <span className="bar"><span style={{ width: `${(totals.patterns / totals.patternsTotal) * 100}%` }} /></span>
        </div>
      </div>

      <div className="pedia-milestones" aria-label="Species milestones">
        {FISHPEDIA_MILESTONES.map((m, i) => {
          const done = totals.species >= m
          const last = i === FISHPEDIA_MILESTONES.length - 1
          return (
            <span key={m} className={`pedia-milestone ${done ? 'is-done' : ''} ${m === next ? 'is-next' : ''}`} title={`${last ? 'Every species' : `${m} species`}: ${milestoneCoins(m)} coins`}>
              <b>{done ? '✓' : last ? '★' : m}</b>
              <small><Coin /> {milestoneCoins(m)}</small>
            </span>
          )
        })}
      </div>
      <p className="pedia-next">
        {next ? (
          <>
            <strong>{next - totals.species}</strong> more species to the next milestone (<Coin /> {milestoneCoins(next)})
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

  // Morph and pattern thumbnails are rendered on demand, the first time a page is opened.
  useEffect(() => {
    const def = getFishDef(defId)
    usePreviewStore.getState().requestPreviews([
      ...MORPHS.map((m) => ({ key: fishPreviewKey(defId, m.id), kind: 'fish' as const, defId, morph: m.id })),
      ...(hasPatterns(def) ? PATTERNS.map((p) => ({ key: fishPreviewKey(defId, undefined, p.id), kind: 'fish' as const, defId, pattern: p.id })) : []),
    ])
  }, [defId])
  const patterns = patternsFound(def, entry)

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
              <p>Waiting in the shop for <Coin /> {def.cost.toLocaleString()}. Bring one home to fill in this page!</p>
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

      {found && FISH_FACTS[defId] && (
        <p className="pedia-fact">
          💡 <strong>Did you know?</strong> {FISH_FACTS[defId]}
        </p>
      )}

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
      {hasPatterns(def) && (
        <>
          <h4 className="pedia-subhead">
            Patterns <small>{patterns.size} of {PATTERNS.length}</small>
          </h4>
          <div className="pedia-morphs pedia-patterns">
            {PATTERNS.map((p) => {
              const has = patterns.has(p.id)
              return (
                <div key={p.id} className={`pedia-morph ${has ? 'is-found' : 'is-missing'}`}>
                  <span className="pedia-art">
                    <ItemThumbnail previewKey={fishPreviewKey(defId, undefined, p.id)} color={def.color} className="pedia-thumb" />
                  </span>
                  <strong>{has ? p.name : '???'}</strong>
                  {p.id === def.pattern && <small>Its own pattern</small>}
                </div>
              )
            })}
          </div>
          <p className="pedia-hint">
            🎨 Babies get their pattern from one of their parents. When both parents wear the same pattern, there's a 1 in 5 chance of a surprise
            pattern neither of them has. Patterns pass between species too.
          </p>
        </>
      )}
      <p className="pedia-hint">
        First {def.name}: +{DISCOVERY_XP[def.rarity]} XP · first hatched in the nursery: +{BRED_COINS[def.rarity]} coins · each rare morph: +{MORPH_COINS} coins. A morph parent makes
        rare eggs much more likely.
      </p>
    </div>
  )
}
