import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { encodeTank, shareCodeFrom, shareLink } from '../state/share'
import { visitTank } from '../app/visit'
import { savePhotoCard } from './photo'
import { Modal } from './components/Modal'
import { Button } from './components/Button'

/** Share your tank as a link, save a photo card, or open a friend's link. */
export function ShareTank() {
  const open = useUIStore((s) => s.activeModal === 'share')
  if (!open) return null
  return (
    <Modal title="🔗 Share your tank" onClose={() => useUIStore.getState().openModal(null)}>
      <ShareBody />
    </Modal>
  )
}

async function copyText(text: string, input: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers, or clipboard blocked: select it and use the old command.
    input?.select()
    return document.execCommand?.('copy') ?? false
  }
}

function ShareBody() {
  const [link, setLink] = useState('')
  const [friend, setFriend] = useState('')
  const [problem, setProblem] = useState('')
  const linkRef = useRef<HTMLInputElement>(null)
  const fish = useGameStore((s) => s.ownedFish.filter((f) => f.habitat === 'main').length)

  useEffect(() => {
    let live = true
    void encodeTank(useGameStore.getState()).then((code) => {
      if (live) setLink(shareLink(code))
    })
    return () => {
      live = false
    }
  }, [])

  const copy = async () => {
    const ok = await copyText(link, linkRef.current)
    useUIStore.getState().pushToast(ok ? 'Link copied! Paste it to a friend.' : 'Select the link and copy it yourself', ok ? 'success' : 'warn', '🔗')
  }
  const share = () => {
    void navigator.share?.({ title: `${useGameStore.getState().aquariumName}`, text: 'Come and see my aquarium!', url: link }).catch(() => {})
  }
  const visit = () => {
    const code = shareCodeFrom(friend)
    if (!code) {
      setProblem("That doesn't look like a tank link. Paste the whole link your friend sent.")
      return
    }
    visitTank(code)
  }

  return (
    <div className="share">
      <p>
        Send this link to a friend and they'll see your tank just as it is now, with all {fish} fish swimming. They can look around but can't change
        anything.
      </p>
      <div className="share-link">
        <input ref={linkRef} readOnly value={link || 'Packing up your tank…'} aria-label="Your tank's link" onFocus={(e) => e.target.select()} />
        <Button variant="primary" disabled={!link} onClick={copy}>
          📋 Copy link
        </Button>
      </div>
      <div className="share-actions">
        {typeof navigator.share === 'function' && (
          <Button disabled={!link} onClick={share}>
            📤 Share…
          </Button>
        )}
        <Button onClick={() => void savePhotoCard()}>🖼️ Save a photo card</Button>
      </div>
      <p className="share-note">🔒 Nothing is uploaded: the whole tank is packed inside the link. Your fish's names stay private.</p>

      <h3>Visit a friend's tank</h3>
      <div className="share-link">
        <input
          value={friend}
          placeholder="Paste a tank link here"
          aria-label="A friend's tank link"
          onChange={(e) => {
            setFriend(e.target.value)
            setProblem('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && visit()}
        />
        <Button disabled={!friend.trim()} onClick={visit}>
          👀 Visit
        </Button>
      </div>
      {problem && <p className="share-problem">{problem}</p>}
    </div>
  )
}
