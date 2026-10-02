import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { decodeTank, visitState } from '../state/share'
import { freezeAlgaeSaves } from '../sim/algae'

const noStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

/**
 * Opening a shared link: show their tank in place of yours. From here on
 * nothing is written to your save (or your algae), so your own tank is
 * untouched; leaving simply reloads it.
 */
export function beginVisit(code: string) {
  useGameStore.persist.setOptions({ storage: noStorage })
  freezeAlgaeSaves()
  useUIStore.setState({ visiting: { status: 'loading', name: '', fish: 0 }, welcomeBack: null, levelUp: null, mode: 'view', dock: 'view' })
  void decodeTank(code).then((tank) => {
    if (!tank) {
      useUIStore.setState({ visiting: { status: 'broken', name: '', fish: 0 } })
      return
    }
    useGameStore.setState(visitState(tank))
    useUIStore.setState({ visiting: { status: 'ready', name: tank.name, fish: tank.fish.length } })
  })
}

/** Back to your own tank. */
export function endVisit() {
  history.replaceState(null, '', location.pathname + location.search)
  location.reload()
}

/** Open someone's tank from a code. */
export function visitTank(code: string) {
  location.hash = `tank=${code}`
  location.reload()
}
