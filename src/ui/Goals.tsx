import { useState } from 'react'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { levelFromXp } from '../state/progression'
import { bonusReward, getWishTemplate, TROPHIES, wishDone, wishProgress, wishReward } from '../state/goals'
import { Modal } from './components/Modal'
import { Button } from './components/Button'
import { Coin } from './Coin'

type Tab = 'today' | 'trophies'

/** Today's three wishes and the trophy shelf. */
export function Goals() {
  const open = useUIStore((s) => s.activeModal === 'goals')
  const [tab, setTab] = useState<Tab>('today')
  if (!open) return null
  return (
    <Modal title="⭐ Goals" onClose={() => useUIStore.getState().openModal(null)} className="modal-wide">
      <div className="subtabs goals-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'today'} className={`subtab ${tab === 'today' ? 'is-active' : ''}`} onClick={() => setTab('today')}>
          <span>🌤️</span> Today's wishes
        </button>
        <button role="tab" aria-selected={tab === 'trophies'} className={`subtab ${tab === 'trophies' ? 'is-active' : ''}`} onClick={() => setTab('trophies')}>
          <span>🏆</span> Trophies
        </button>
      </div>
      {tab === 'today' ? <Wishes /> : <Trophies />}
    </Modal>
  )
}

function Progress({ value, target }: { value: number; target: number }) {
  return (
    <span className="goal-bar" aria-label={`${value} of ${target}`}>
      <span style={{ width: `${Math.round((Math.min(value, target) / target) * 100)}%` }} />
    </span>
  )
}

function Wishes() {
  const daily = useGameStore((s) => s.daily)
  const stats = useGameStore((s) => s.stats)
  const level = useGameStore((s) => levelFromXp(s.xp).level)
  const reward = wishReward(level)
  const bonus = bonusReward(level)
  const allClaimed = daily.wishes.length > 0 && daily.wishes.every((w) => w.claimed)
  return (
    <div className="goals">
      <p className="goals-note">Three little wishes from your fish, new every day. No rush: skipping a day is fine.</p>
      <div className="wish-list">
        {daily.wishes.map((wish) => {
          const template = getWishTemplate(wish.id)
          const value = wishProgress({ stats }, wish)
          const done = wishDone({ stats }, wish)
          return (
            <div key={wish.id} className={`wish ${done ? 'is-done' : ''} ${wish.claimed ? 'is-claimed' : ''}`}>
              <span className="wish-icon" aria-hidden>
                {template?.icon ?? '⭐'}
              </span>
              <div className="wish-copy">
                <strong>{template?.text(wish.target) ?? wish.id}</strong>
                <span className="wish-progress">
                  <Progress value={value} target={wish.target} />
                  <small>
                    {Math.floor(value)}/{wish.target}
                  </small>
                </span>
              </div>
              {wish.claimed ? (
                <span className="wish-claimed">✓ Done</span>
              ) : (
                <Button variant={done ? 'primary' : undefined} disabled={!done} onClick={() => useGameStore.getState().claimWish(wish.id)}>
                  {done ? 'Claim' : ''} <Coin /> {reward.coins}
                </Button>
              )}
            </div>
          )
        })}
      </div>
      <div className={`wish-bonus ${allClaimed && !daily.bonusClaimed ? 'is-ready' : ''}`}>
        <span className="wish-icon" aria-hidden>
          🎁
        </span>
        <div className="wish-copy">
          <strong>{daily.bonusClaimed ? 'Bonus collected. See you tomorrow!' : 'Make all three wishes come true for a bonus'}</strong>
          <small>
            <Coin /> {bonus.coins} and {bonus.xp} XP
          </small>
        </div>
        {!daily.bonusClaimed && (
          <Button variant={allClaimed ? 'primary' : undefined} disabled={!allClaimed} onClick={() => useGameStore.getState().claimWishBonus()}>
            Open
          </Button>
        )}
      </div>
    </div>
  )
}

function Trophies() {
  const earned = useGameStore((s) => s.trophies)
  const state = useGameStore()
  const count = TROPHIES.filter((t) => earned[t.id]).length
  return (
    <div className="goals">
      <p className="goals-note">
        {count} of {TROPHIES.length} trophies earned. Each one comes with a coin prize.
      </p>
      <div className="trophy-grid">
        {TROPHIES.map((t) => {
          const at = earned[t.id]
          const value = Math.min(t.target, t.progress(state))
          return (
            <div key={t.id} className={`trophy ${at ? 'is-earned' : ''}`} title={at ? `Earned ${new Date(at).toLocaleDateString()}` : t.text}>
              <span className="trophy-icon" aria-hidden>
                {t.icon}
              </span>
              <strong>{t.name}</strong>
              <small>{t.text}</small>
              {at ? (
                <span className="trophy-done">✓ Earned</span>
              ) : (
                <span className="wish-progress">
                  <Progress value={value} target={t.target} />
                  <small>
                    <Coin /> {t.coins}
                  </small>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
