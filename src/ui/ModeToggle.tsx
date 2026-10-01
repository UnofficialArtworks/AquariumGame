import { useUIStore } from '../state/useUIStore'
import { Button } from './components/Button'

export function ModeToggle() {
  const mode = useUIStore((s) => s.mode)
  const setMode = useUIStore((s) => s.setMode)

  return (
    <Button variant="primary" onClick={() => setMode(mode === 'decorate' ? 'view' : 'decorate')}>
      {mode === 'decorate' ? '✓ Done Decorating' : '🪸 Decorate'}
    </Button>
  )
}
