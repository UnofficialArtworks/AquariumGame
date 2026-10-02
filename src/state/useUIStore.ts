import { create } from 'zustand'
import type { ShopCategory } from './rules'
import { nightLevel, type NightOverride } from '../sim/daylight'

export type ModalId = 'shop' | 'help' | 'fishpedia' | null
/** Shop drawer tabs: one per shop category. */
export type ShopTab = ShopCategory
export type AppMode = 'view' | 'feed' | 'clean' | 'decorate'
/** The bottom dock's tabs: every game mode plus the shop. */
export type DockTab = AppMode | 'shop'
export type CleanTool = 'sponge' | 'vacuum'
export type ToastTone = 'info' | 'success' | 'warn' | 'reward'

export interface Toast {
  id: number
  text: string
  icon?: string
  tone: ToastTone
}

export interface LevelUpInfo {
  level: number
  coins: number
  treats: Array<{ id: string; count: number }>
  unlocks: string[]
}

export interface WelcomeBackInfo {
  minutesAway: number
  coins: number
  hungryFish: number
  algaePercent: number
  murkPercent: number
}

interface UIState {
  activeTank: 'main' | 'nursery'
  cleanCameraMode: boolean
  setActiveTank: (tank: 'main' | 'nursery') => void
  setCleanCameraMode: (enabled: boolean) => void
  mode: AppMode
  draggingId: string | null
  selectedDecorationId: string | null
  selectedFishId: string | null
  followFish: boolean
  controlsEnabled: boolean
  /** True while the player is dragging a cleaning tool, so the camera stays put. */
  toolActive: boolean
  activeModal: ModalId
  /** Which dock tab is active, and whether its drawer is showing. */
  dock: DockTab
  trayOpen: boolean
  shopTab: ShopTab
  /** Whether it's night in the tank right now (the real clock, or the player's pick). */
  night: boolean
  /** 0 = day, 1 = night: where the scene's lighting is heading. */
  nightLevel: number
  nightOverride: NightOverride | null
  cleanTool: CleanTool
  foodId: string
  toasts: Toast[]
  levelUp: LevelUpInfo | null
  welcomeBack: WelcomeBackInfo | null
  /** New Fishpedia entries/stamps since the book was last opened. */
  fishpediaNews: number
  /** Species the Fishpedia opens on (null = the overview). */
  fishpediaPick: string | null
  setMode: (mode: AppMode) => void
  setDraggingId: (id: string | null) => void
  setSelectedDecorationId: (id: string | null) => void
  selectFish: (id: string | null) => void
  setFollowFish: (follow: boolean) => void
  setToolActive: (active: boolean) => void
  openModal: (modal: ModalId) => void
  /** Switch dock tab (tapping the active tab again shows/hides its drawer). */
  openDock: (tab: DockTab) => void
  setTrayOpen: (open: boolean) => void
  /** Jump to the shop tab of the dock, optionally on a category. */
  openShop: (tab?: ShopTab) => void
  setShopTab: (tab: ShopTab) => void
  toggleNight: () => void
  /** Re-read the clock; called every second. */
  syncClock: () => void
  setCleanTool: (tool: CleanTool) => void
  setFoodId: (id: string) => void
  pushToast: (text: string, tone?: ToastTone, icon?: string) => void
  dismissToast: (id: number) => void
  setLevelUp: (info: LevelUpInfo | null) => void
  setWelcomeBack: (info: WelcomeBackInfo | null) => void
  bumpFishpediaNews: (count: number) => void
  openFishpedia: (defId?: string | null) => void
  setFishpediaPick: (defId: string | null) => void
}

let toastSeq = 1

function lightsNow(override: NightOverride | null) {
  const { level, override: live } = nightLevel(override)
  return { night: level >= 0.5, nightLevel: level, nightOverride: live }
}

export const useUIStore = create<UIState>()((set, get) => ({
  activeTank: 'main',
  cleanCameraMode: false,
  setActiveTank: (activeTank) => set({ activeTank, mode: 'view', dock: 'view', selectedFishId: null, selectedDecorationId: null,
    draggingId: null, toolActive: false, controlsEnabled: true, followFish: false, cleanCameraMode: false }),
  setCleanCameraMode: (cleanCameraMode) => set({ cleanCameraMode, toolActive: false, controlsEnabled: true }),
  mode: 'view',
  draggingId: null,
  selectedDecorationId: null,
  selectedFishId: null,
  followFish: false,
  controlsEnabled: true,
  toolActive: false,
  activeModal: null,
  dock: 'view',
  trayOpen: false,
  shopTab: 'fish',
  ...lightsNow(null),
  cleanTool: 'sponge',
  foodId: 'pellets',
  toasts: [],
  levelUp: null,
  welcomeBack: null,
  fishpediaNews: 0,
  fishpediaPick: null,
  setMode: (mode) =>
    set({
      mode,
      dock: mode,
      cleanCameraMode: false,
      selectedDecorationId: null,
      draggingId: null,
      toolActive: false,
      controlsEnabled: true,
    }),
  setDraggingId: (id) => set({ draggingId: id, controlsEnabled: id === null && !get().toolActive }),
  setSelectedDecorationId: (id) => set({ selectedDecorationId: id }),
  selectFish: (id) => set({ selectedFishId: id, followFish: id === null ? false : get().followFish }),
  setFollowFish: (follow) => set({ followFish: follow }),
  setToolActive: (active) => set({ toolActive: active, controlsEnabled: !active && get().draggingId === null }),
  openModal: (modal) => set({ activeModal: modal }),
  openDock: (tab) => {
    const s = get()
    if (tab === s.dock) {
      set({ trayOpen: !s.trayOpen })
      return
    }
    if (tab === 'shop') {
      // The tank keeps running behind the shop, in plain watch mode.
      if (s.mode !== 'view') s.setMode('view')
      set({ dock: 'shop', trayOpen: true })
      return
    }
    // Cleaning and decorating only happen in the main aquarium.
    if ((tab === 'clean' || tab === 'decorate') && s.activeTank !== 'main') s.setActiveTank('main')
    if (tab === 'clean' || tab === 'decorate') set({ selectedFishId: null, followFish: false })
    s.setMode(tab)
    set({ trayOpen: true })
  },
  setTrayOpen: (open) => set({ trayOpen: open }),
  openShop: (tab) => {
    const s = get()
    if (s.mode !== 'view') s.setMode('view')
    set({ dock: 'shop', trayOpen: true, shopTab: tab ?? s.shopTab })
  },
  setShopTab: (tab) => set({ shopTab: tab }),
  toggleNight: () => {
    const night = !get().night
    set(lightsNow({ night, phase: nightLevel(null).level >= 0.5 }))
  },
  syncClock: () => {
    const next = lightsNow(get().nightOverride)
    const s = get()
    if (next.night !== s.night || next.nightOverride !== s.nightOverride || Math.abs(next.nightLevel - s.nightLevel) > 0.002) set(next)
  },
  setCleanTool: (tool) => set({ cleanTool: tool }),
  setFoodId: (id) => set({ foodId: id }),
  pushToast: (text, tone = 'info', icon) => {
    const id = toastSeq++
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone, icon }] })
    setTimeout(() => get().dismissToast(id), 3200)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setLevelUp: (info) => set({ levelUp: info }),
  setWelcomeBack: (info) => set({ welcomeBack: info }),
  bumpFishpediaNews: (count) => set({ fishpediaNews: get().fishpediaNews + count }),
  openFishpedia: (defId = null) => set({ activeModal: 'fishpedia', fishpediaPick: defId, fishpediaNews: 0 }),
  setFishpediaPick: (defId) => set({ fishpediaPick: defId }),
}))
