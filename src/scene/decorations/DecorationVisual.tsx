import type { BuiltPart } from '../geometry/MeshBuilder'
import { decorMaterials } from '../materials/materials'
import { hashString, mulberry32 } from '../../utils/rng'
import type { DecorationCatalogEntry, DecorationKind } from './decorationDefinitions'
import type { StaticBuilder } from './builders/common'
import { buildAnemone, buildBrain, buildDriftwood, buildFern, buildGrass, buildKelp, buildRocks, buildSeaFan, buildStaghorn } from './builders/nature'
import { buildArch, buildClamBase, buildCrystals, buildMushrooms, buildPalace, buildShells } from './builders/sparkle'
import { buildAirstone, buildCastle, buildRuins, buildTiki } from './builders/classic'
import {
  buildAnchor,
  buildChestBase,
  buildDiver,
  buildJaws,
  buildShipwreck,
  buildSkull,
  buildSubmarine,
  buildUfo,
  buildVolcano,
} from './builders/adventure'
import { buildFeeder, buildFilter, buildFountain, buildGrowLamp, buildMarimo } from './builders/gadgets'
import { buildAtlantis, buildCityGate, buildGeode, buildGlowCave } from './builders/legends'
import { buildPumpkin, buildSnowman } from './builders/seasonal'
import { DECORATION_FX } from './DecorationFx'
import { GADGET_FX } from './GadgetFx'
import { LEGENDS_FX } from './LegendsFx'

const BUILDERS: Record<DecorationKind, StaticBuilder | null> = {
  rocks: buildRocks,
  driftwood: buildDriftwood,
  fern: buildFern,
  grass: buildGrass,
  kelp: buildKelp,
  lily: null,
  staghorn: buildStaghorn,
  brain: buildBrain,
  seafan: buildSeaFan,
  anemone: buildAnemone,
  crystals: buildCrystals,
  shells: buildShells,
  clam: buildClamBase,
  palace: buildPalace,
  arch: buildArch,
  mushrooms: buildMushrooms,
  castle: buildCastle,
  ruins: buildRuins,
  tiki: buildTiki,
  chest: buildChestBase,
  shipwreck: buildShipwreck,
  anchor: buildAnchor,
  skull: buildSkull,
  jaws: buildJaws,
  diver: buildDiver,
  submarine: buildSubmarine,
  volcano: buildVolcano,
  ufo: buildUfo,
  airstone: buildAirstone,
  marimo: buildMarimo,
  feeder: buildFeeder,
  filter: buildFilter,
  growlamp: buildGrowLamp,
  fountain: buildFountain,
  citygate: buildCityGate,
  glowcave: buildGlowCave,
  atlantis: buildAtlantis,
  geode: buildGeode,
  pumpkin: buildPumpkin,
  snowman: buildSnowman,
}

const cache = new Map<string, BuiltPart[]>()

/** Static geometry for a decoration type, built once and shared by every placed copy. */
export function staticPartsFor(def: DecorationCatalogEntry): BuiltPart[] {
  let parts = cache.get(def.id)
  if (!parts) {
    const builder = BUILDERS[def.kind]
    parts = builder ? builder(def, mulberry32(hashString(def.id))) : []
    cache.set(def.id, parts)
  }
  return parts
}

export function DecorationVisual({ def, instanceId }: { def: DecorationCatalogEntry; instanceId?: string }) {
  const parts = staticPartsFor(def)
  const Fx = DECORATION_FX[def.kind] ?? GADGET_FX[def.kind] ?? LEGENDS_FX[def.kind]
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow receiveShadow />
      ))}
      {Fx && <Fx def={def} instanceId={instanceId} />}
    </group>
  )
}
