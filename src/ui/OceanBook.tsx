import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useGameStore } from '../state/useGameStore'
import { FISH_CATALOG, getFishDef } from '../scene/fish/fishDefinitions'
import { fishPreviewKey, usePreviewStore, type PreviewTarget } from '../state/usePreviewStore'
import { hasSpecialPattern, matchesOceanFilter, OCEAN_SORTS, oceanRoster, oceanTotals, tideReward, type OceanFilter, type OceanFish, type OceanSort } from '../state/ocean'
import { getFoodDef } from '../scene/food/foodDefinitions'
import { getMorph, speciesLabel } from '../state/morphs'
import { patternName } from '../state/patterns'
import { ItemThumbnail } from './ItemThumbnail'
import { Coin } from './Coin'

/** How many fish swim across the view at once. */
const SWIMMERS = 24
/** Roster cards shown before "Show more". */
const PAGE = 30

const FILTERS: Array<{ id: OceanFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'rare-colours', label: '🌈 Rare colours' },
  { id: 'patterns', label: '🎨 Special patterns' },
  { id: 'rare', label: '⭐ Rare & up' },
]

/** A side-on portrait of an ocean fish in its own colours and pattern. */
function previewOf(f: OceanFish): PreviewTarget {
  const palette = f.color && f.color2 ? { color: f.color, color2: f.color2, color3: f.color3 } : undefined
  return { key: `side~${fishPreviewKey(f.defId, f.morph, f.pattern, palette)}`, kind: 'fish', defId: f.defId, morph: f.morph, pattern: f.pattern, palette, view: 'side' }
}

function releasedOn(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Fish you've released, still swimming in your Open Ocean, and the tide they've raised. */
export function OceanBook() {
  const ocean = useGameStore((s) => s.ocean)
  const stats = useGameStore((s) => s.stats)
  const totals = oceanTotals({ ocean, stats })
  const reward = tideReward(totals.tide + 1)
  const [sort, setSort] = useState<OceanSort>('newest')
  const [filter, setFilter] = useState<OceanFilter>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<string | null>(null)
  const viewRef = useRef<HTMLDivElement>(null)

  const roster = useMemo(() => oceanRoster(ocean, sort, filter, query), [ocean, sort, filter, query])
  const shown = roster.slice(0, limit)
  const featured = ocean.find((f) => f.id === selected)
  const swimmers = useMemo(() => ocean.slice(-SWIMMERS).filter((f) => f.id !== selected), [ocean, selected])
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, ocean.filter((o) => matchesOceanFilter(o, f.id)).length])), [ocean])
  const speciesCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const f of roster) out[f.defId] = (out[f.defId] ?? 0) + 1
    return out
  }, [roster])

  // Side-on portraits are made on demand, just for the fish on screen.
  useEffect(() => {
    const wanted = new Map<string, PreviewTarget>()
    for (const f of [...swimmers, ...shown, ...(featured ? [featured] : [])]) wanted.set(previewOf(f).key, previewOf(f))
    usePreviewStore.getState().requestPreviews([...wanted.values()], true)
  }, [swimmers, shown, featured])

  const pick = (id: string) => {
    setSelected((current) => (current === id ? null : id))
    viewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <div className="pedia ocean-book">
      <div className="ocean-view" ref={viewRef} aria-label="Your Open Ocean">
        <span className="ocean-rays" aria-hidden />
        <OceanFloor />
        {ocean.length === 0 && (
          <p className="ocean-empty">
            Your ocean is waiting for its first fish. When a fish is fully grown, tap it, choose <strong>👋 Goodbye</strong>, then <strong>🌊 Release</strong>.
          </p>
        )}
        {swimmers.map((f, i) => {
          const seed = (i * 7919 + f.name.length * 31) % 100
          const depth = (seed % 3) / 2
          return (
            <Swimmer
              key={f.id}
              fish={f}
              left={i % 2 === 1}
              style={{
                '--y': `${6 + ((i * 37) % 58)}%`,
                '--d': `${(22 + (seed % 16)) * (1 + depth * 0.3)}s`,
                '--delay': `-${(seed * 0.37).toFixed(1)}s`,
                '--s': `${1 - depth * 0.3}`,
                '--o': `${1 - depth * 0.3}`,
                zIndex: 3 - Math.round(depth * 2),
              } as CSSProperties}
              onPick={pick}
            />
          )
        })}
        {featured && (
          <Swimmer
            key={`featured-${featured.id}`}
            fish={featured}
            featured
            left={false}
            style={{ '--y': '30%', '--d': '16s', '--delay': '-1.5s', '--s': '1.15', '--o': '1', zIndex: 5 } as CSSProperties}
            onPick={pick}
          />
        )}
      </div>

      <div className="pedia-summary ocean-summary">
        <div className="pedia-stat">
          <strong>🌊 Tide {totals.tide}</strong>
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
        <div className="pedia-stat">
          <strong>{totals.rareColours}</strong>
          <span>Rare colours</span>
        </div>
      </div>
      <p className="pedia-next">
        Next tide: <Coin /> {reward.coins} and {reward.treatCount} {getFoodDef(reward.treat).name}. Every tide pays out, and the tides never stop rising.
      </p>

      {ocean.length > 0 && (
        <section className="ocean-roster">
          <div className="ocean-roster-head">
            <h3>
              Ocean friends <small>{ocean.length}</small>
            </h3>
            <label className="ocean-sort">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as OceanSort)}>
                {OCEAN_SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="subtabs ocean-filters" role="tablist" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                className={`subtab ${filter === f.id ? 'is-active' : ''}`}
                onClick={() => {
                  setFilter(f.id)
                  setLimit(PAGE)
                }}
              >
                {f.label} <span className="subtab-count">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          {ocean.length > 8 && (
            <input
              className="ocean-search"
              type="search"
              placeholder="Find a fish by name or species"
              aria-label="Find a fish by name or species"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(PAGE)
              }}
            />
          )}

          {roster.length === 0 ? (
            <p className="ocean-none">No fish match that. Try another filter.</p>
          ) : (
            <div className="ocean-list">
              {shown.map((f, i) => {
                const def = getFishDef(f.defId)
                const newGroup = sort === 'species' && f.defId !== shown[i - 1]?.defId
                return (
                  <div key={f.id} className="ocean-list-item">
                    {newGroup && (
                      <h4 className="ocean-group">
                        {def?.name ?? 'Fish'} <small>× {speciesCounts[f.defId]}</small>
                      </h4>
                    )}
                    <OceanCard fish={f} selected={selected === f.id} onPick={pick} />
                  </div>
                )
              })}
            </div>
          )}
          {roster.length > limit && (
            <button className="btn btn-secondary ocean-more" onClick={() => setLimit((n) => n + PAGE)}>
              Show more ({roster.length - limit} left)
            </button>
          )}
          {stats.released > ocean.length && <p className="ocean-note">Your ocean book keeps your latest {ocean.length} releases.</p>}
        </section>
      )}
    </div>
  )
}

function Swimmer({ fish, left, featured = false, style, onPick }: { fish: OceanFish; left: boolean; featured?: boolean; style: CSSProperties; onPick: (id: string) => void }) {
  const def = getFishDef(fish.defId)
  const preview = previewOf(fish)
  return (
    <button
      className={`ocean-fish ${left ? 'is-left' : ''} ${featured ? 'is-featured' : ''}`}
      style={style}
      title={`${fish.name} the ${def ? speciesLabel(def, fish.morph) : 'fish'}`}
      aria-label={`${fish.name} the ${def ? speciesLabel(def, fish.morph) : 'fish'}`}
      onClick={() => onPick(fish.id)}
    >
      {featured && <span className="ocean-tag">{fish.name}</span>}
      <span className="ocean-body">
        <ItemThumbnail previewKey={preview.key} color={fish.color ?? getMorph(fish.morph)?.color ?? def?.color ?? '#7fd3ff'} className="ocean-thumb" />
      </span>
    </button>
  )
}

function OceanCard({ fish, selected, onPick }: { fish: OceanFish; selected: boolean; onPick: (id: string) => void }) {
  const def = getFishDef(fish.defId)
  const morph = getMorph(fish.morph)
  const preview = previewOf(fish)
  return (
    <button className={`ocean-card ${selected ? 'is-selected' : ''}`} onClick={() => onPick(fish.id)} aria-pressed={selected}>
      <span className="ocean-card-art">
        <ItemThumbnail previewKey={preview.key} color={fish.color ?? morph?.color ?? def?.color ?? '#7fd3ff'} className="pedia-thumb" />
      </span>
      <span className="ocean-card-copy">
        <strong>{fish.name}</strong>
        <span className="ocean-card-species">{def ? speciesLabel(def, fish.morph) : 'Fish'}</span>
        <span className="ocean-card-tags">
          {def && <span className={`rarity rarity-${def.rarity}`}>{def.rarity}</span>}
          {morph && <span className="rarity rarity-morph">{morph.icon} rare</span>}
          {hasSpecialPattern(fish) && fish.pattern && <span className="rarity rarity-pattern">🎨 {patternName(fish.pattern)}</span>}
        </span>
        <small>Released {releasedOn(fish.at)}</small>
      </span>
    </button>
  )
}

/** Sand, rocks and swaying kelp along the bottom of the ocean view. */
function OceanFloor() {
  return (
    <svg className="ocean-floor" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="ocean-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9c08a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8a7350" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <g className="ocean-kelp">
        <path d="M30 60 C 24 40, 38 28, 30 4" />
        <path d="M44 60 C 50 44, 36 30, 46 12" />
        <path d="M318 60 C 312 42, 326 30, 316 8" />
        <path d="M334 60 C 340 46, 326 34, 336 20" />
        <path d="M366 60 C 360 48, 372 38, 364 26" />
      </g>
      <path className="ocean-coral" d="M210 52 l-6 -14 m6 14 l2 -18 m-2 18 l8 -12 M120 54 l-4 -10 m4 10 l5 -12" />
      <ellipse cx="96" cy="54" rx="22" ry="9" fill="#3d5566" opacity="0.8" />
      <ellipse cx="262" cy="56" rx="30" ry="10" fill="#344b5b" opacity="0.8" />
      <path d="M0 50 Q 60 42 120 50 T 240 48 T 400 46 L 400 60 L 0 60 Z" fill="url(#ocean-sand)" />
    </svg>
  )
}
