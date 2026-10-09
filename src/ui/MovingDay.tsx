import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../state/useUIStore'
import { movingLink, readMovingCode, stageArrival } from '../state/moving'
import { saveAlgae } from '../sim/algae'
import { Modal } from './components/Modal'
import { Button } from './components/Button'

/** Move the aquarium to a new address or device with a moving code, for grown-ups. */
export function MovingDay() {
  const open = useUIStore((s) => s.activeModal === 'moving')
  useEffect(() => {
    // A save brought in on the last page load says hello once.
    if (sessionStorage.getItem('aquarium-moved-in')) {
      sessionStorage.removeItem('aquarium-moved-in')
      useUIStore.getState().pushToast('Your aquarium moved in! Welcome home.', 'success', '📦')
    }
  }, [])
  if (!open) return null
  return (
    <Modal title="📦 Moving day" onClose={() => useUIStore.getState().openModal(null)}>
      <MovingBody />
    </Modal>
  )
}

function MovingBody() {
  const [link, setLink] = useState('')
  const [pasted, setPasted] = useState('')
  const [problem, setProblem] = useState('')
  const [ready, setReady] = useState<Record<string, string> | null>(null)
  const linkRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let live = true
    saveAlgae()
    void movingLink().then((made) => live && setLink(made))
    return () => {
      live = false
    }
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      useUIStore.getState().pushToast('Moving code copied! Keep it somewhere safe, like Notes.', 'success', '📦')
    } catch {
      linkRef.current?.select()
      useUIStore.getState().pushToast('Select the code and copy it yourself', 'warn', '📦')
    }
  }
  const check = async () => {
    try {
      setReady(await readMovingCode(pasted))
      setProblem('')
    } catch (error) {
      setReady(null)
      setProblem(error instanceof Error ? error.message : 'That moving code could not be read.')
    }
  }
  const bringIn = () => {
    if (!ready) return
    stageArrival(ready)
    location.reload()
  }

  return (
    <div className="share moving">
      <p>
        Moving to a new address or device? Copy this aquarium's moving code, then paste it into My Aquarium in its new home. Everything comes along:
        fish, decorations, coins and progress.
      </p>
      <textarea
        ref={linkRef}
        className="moving-code"
        readOnly
        rows={3}
        value={link || 'Packing up your aquarium…'}
        aria-label="This aquarium's moving code"
        onFocus={(e) => e.target.select()}
      />
      <div className="share-actions">
        <Button variant="primary" disabled={!link} onClick={copy}>
          📋 Copy moving code
        </Button>
        {typeof navigator.share === 'function' && (
          <Button disabled={!link} onClick={() => void navigator.share({ title: 'My Aquarium moving code', text: link }).catch(() => {})}>
            📤 Share…
          </Button>
        )}
      </div>
      <p className="share-note">🔒 Nothing is uploaded: the whole aquarium is packed inside the code. Keep it to yourself.</p>

      <h3>Bring an aquarium in</h3>
      <textarea
        className="moving-code"
        rows={3}
        value={pasted}
        placeholder="Paste a moving code here"
        aria-label="A moving code to bring in"
        onChange={(e) => {
          setPasted(e.target.value)
          setReady(null)
          setProblem('')
        }}
      />
      {!ready ? (
        <div className="share-actions">
          <Button disabled={!pasted.trim()} onClick={() => void check()}>
            📦 Bring it in
          </Button>
        </div>
      ) : (
        <div className="moving-confirm">
          <p>This replaces the aquarium on this device with the one in the code.</p>
          <div className="share-actions">
            <Button onClick={() => setReady(null)}>Keep this one</Button>
            <Button variant="primary" onClick={bringIn}>
              Replace and move in
            </Button>
          </div>
        </div>
      )}
      {problem && <p className="share-problem">{problem}</p>}
    </div>
  )
}
