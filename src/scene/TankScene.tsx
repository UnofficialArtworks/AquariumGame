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
import { NURSERY_DECORATIONS, POND_DECORATIONS } from './nurseryLayout'
import { NurseryEggs } from './creatures/NurseryEggs'
import { StandVisual } from './stands/StandVisual'
import { Visitors } from './visitors/Visitors'
import { PondGarden } from './pond/PondGarden'

export function TankScene() {
  const placedDecorations = useGameStore((s) => s.placedDecorations)
  const ownedFish = useGameStore((s) => s.ownedFish)
  const backgroundId = useGameStore((s) => s.backgroundId)
  const standId = useGameStore((s) => s.standId)
  const decorating = useUIStore((s) => s.mode === 'decorate')
  const activeTank = useUIStore((s) => s.activeTank)
  const nursery = activeTank === 'nursery'
  const main = activeTank === 'main'
  const pond = activeTank === 'pond'
  const decorations = nursery ? NURSERY_DECORATIONS : main ? placedDecorations : POND_DECORATIONS

  return (
    <>
      <AtmosphereController />
      <SimController />
      <CameraRig />
      <SceneEnvironment />
      <Lighting />
      {pond ? (
        // The Koi Pond is an outdoor garden pond, not a glass tank.
        <PondGarden />
      ) : (
        <>
          <Room />
          <Background backgroundId={nursery ? 'bubblegum-dream' : backgroundId} />
          <TankContainer />
          <StandVisual standId={standId} />
        </>
      )}
      <Gravel substrateId={pond ? 'river-pebbles' : undefined} />
      <WaterSurface pond={pond} />
      {!pond && <GodRays />}
      <Particles />
      {main && <AlgaeGlass />}
      {main && <WasteLayer />}
      {decorating && main && <DragSurface />}
      <TankInteraction />
      {main && <CleaningTools />}
      {nursery && <NurseryEggs />}
      {decorations.map((instance) => (
        <DecorationEntity key={instance.id} instance={instance} />
      ))}
      {ownedFish.filter((fish) => (fish.habitat ?? 'main') === activeTank).map((instance) => (
        <FishEntity key={instance.id} instance={instance} />
      ))}
      {main && <Visitors />}
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
