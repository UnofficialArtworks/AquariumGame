import type { RefObject } from 'react'
import type { VisitorDef } from '../../state/visitors'
import type { FishAgent } from '../../sim/world'
import { FishBody } from '../fish/FishBody'
import { SeahorseVisual } from '../creatures/Seahorse'
import { JellyfishVisual } from '../creatures/Jellyfish'
import { SeaTurtleVisual } from '../creatures/SeaTurtle'
import { ShrimpVisual } from '../creatures/Shrimp'
import { CrabVisual, type CrabMotion } from '../creatures/Crab'

/** A visitor's body: shared by the live visitor in the tank and its Fishpedia thumbnail. */
export function VisitorVisual({ visitor, agentRef, motion }: { visitor: VisitorDef; agentRef?: RefObject<FishAgent | null>; motion?: RefObject<CrabMotion> }) {
  const def = visitor.look
  switch (visitor.rig) {
    case 'crab':
      return <CrabVisual def={def} motion={motion} />
    case 'hermit':
      return <CrabVisual def={def} hermit motion={motion} />
    case 'shrimp':
      return <ShrimpVisual def={def} />
    case 'seahorse':
      return <SeahorseVisual def={def} agentRef={agentRef} />
    case 'jelly':
      return <JellyfishVisual def={def} agentRef={agentRef} />
    case 'turtle':
      return <SeaTurtleVisual def={def} agentRef={agentRef} />
    default:
      return <FishBody def={def} agentRef={agentRef} seedKey={def.id} />
  }
}
