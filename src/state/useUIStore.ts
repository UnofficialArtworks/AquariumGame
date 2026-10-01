import { create } from 'zustand'

export type ModalId = 'shop' | 'help' | null
export type ShopTab = 'fish' | 'decorations' | 'treats' | 'tools' | 'backgrounds' | 'gravel' | 'stands'
export type AppMode = 'view' | 'feed' | 'clean' | 'decorate'
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
  shopTab: ShopTab
  night: boolean
  cleanTool: CleanTool
  foodId: string
  toasts: Toast[]
  levelUp: LevelUpInfo | null
  welcomeBack: WelcomeBackInfo | null
  setMode: (mode: AppMode) => void
  setDraggingId: (id: string | null) => void
  setSelectedDecorationId: (id: string | null) => void
  selectFish: (id: string | null) => void
  setFollowFish: (follow: boolean) => void
  setToolActive: (active: boolean) => void
  openModal: (modal: ModalId) => void
  setShopTab: (tab: ShopTab) => void
  toggleNight: () => void
  setCleanTool: (tool: CleanTool) => void
  setFoodId: (id: string) => void
  pushToast: (text: string, tone?: ToastTone, icon?: string) => void
  dismissToast: (id: number) => void
  setLevelUp: (info: LevelUpInfo | null) => void
  setWelcomeBack: (info: WelcomeBackInfo | null) => void
}

let toastSeq = 1

export const useUIStore = create<UIState>()((set, get) => ({
  activeTank: 'main',
  cleanCameraMode: false,
  setActiveTank: (activeTank) => set({ activeTank, mode: 'view', selectedFishId: null, selectedDecorationId: null,
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
  shopTab: 'fish',
  night: false,
  cleanTool: 'sponge',
  foodId: 'pellets',
  toasts: [],
  levelUp: null,
  welcomeBack: null,
  setMode: (mode) =>
    set({
      mode,
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
  setShopTab: (tab) => set({ shopTab: tab }),
  toggleNight: () => set({ night: !get().night }),
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
}))
