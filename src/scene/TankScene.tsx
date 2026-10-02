import { useGameStore } from '../state/useGameStore'
import { CameraRig } from './CameraRig'
import { Lighting, SceneEnvironment } from './Lighting'
import { AtmosphereController } from './Atmosphere'
import { TankContainer } from './TankContainer'
import { Background } from './Background'
import { Room } from './Room'
import { Gravel } from './Gravel'
import { WaterSurface } from './WaterSurface'
import { GodRays } from './GodRays'
import { Particles } from './Particles'
import { PostFX } from './PostFX'
import { SimController } from './SimController'
import { DragSurface } from './interaction/DragSurface'
import { TankInteraction } from './interaction/TankInteraction'
import { DecorationEntity } from './decorations/DecorationEntity'
import { FishEntity } from './fish/FishEntity'
import { FishEyesRenderer } from './fish/FishEyes'
import { FoodRenderer } from './effects/FoodRenderer'
import { CoinRenderer } from './effects/CoinRenderer'
import { BubbleRenderer, SparkRenderer } from './effects/BubbleRenderer'
import { PopupLayer } from './effects/PopupLayer'
import { AlgaeGlass } from './cleaning/AlgaeGlass'
import { WasteLayer } from './cleaning/WasteLayer'
import { CleaningTools } from './cleaning/CleaningTools'
import { useUIStore } from '../state/useUIStore'
import { NURSERY_DECORATIONS } from './nurseryLayout'
import { NurseryEggs } from './creatures/NurseryEggs'
import { StandVisual } from './stands/StandVisual'
import { Visitors } from './visitors/Visitors'

export function TankScene() {
  const placedDecorations = useGameStore((s) => s.placedDecorations)
  const ownedFish = useGameStore((s) => s.ownedFish)
  const backgroundId = useGameStore((s) => s.backgroundId)
  const standId = useGameStore((s) => s.standId)
  const decorating = useUIStore((s) => s.mode === 'decorate')
  const activeTank = useUIStore((s) => s.activeTank)
  const nursery = activeTank === 'nursery'
  const decorations = nursery ? NURSERY_DECORATIONS : placedDecorations

  return (
    <>
      <AtmosphereController />
      <SimController />
      <CameraRig />
      <SceneEnvironment />
      <Lighting />
      <Room />
      <Background backgroundId={nursery ? 'bubblegum-dream' : backgroundId} />
      <TankContainer />
      <StandVisual standId={standId} />
      <Gravel />
      <WaterSurface />
      <GodRays />
      <Particles />
      {!nursery && <AlgaeGlass />}
      {!nursery && <WasteLayer />}
      {decorating && !nursery && <DragSurface />}
      <TankInteraction />
      {!nursery && <CleaningTools />}
      {nursery && <NurseryEggs />}
      {decorations.map((instance) => (
        <DecorationEntity key={instance.id} instance={instance} />
      ))}
      {ownedFish.filter((fish) => (fish.habitat ?? 'main') === activeTank).map((instance) => (
        <FishEntity key={instance.id} instance={instance} />
      ))}
      {!nursery && <Visitors />}
      <FishEyesRenderer />
      <FoodRenderer />
      <CoinRenderer />
      <BubbleRenderer />
      <SparkRenderer />
      <PopupLayer />
      <PostFX />
    </>
  )
}
