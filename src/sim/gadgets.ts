import * as THREE from 'three'

/**
 * Shared, non-React state for gadget decorations. The simulation writes the
 * time a gadget last "fired" (e.g. the auto-feeder dropping pellets) and the
 * gadget's animated visual reads it to play a matching puff/flash.
 */
export const gadgetPulses = new Map<string, number>()

/**
 * The auto-feeder rings a little bell a few seconds before it pops food out.
 * Hungry fish hear it and gather around the lantern (sim time `from`..`until`).
 */
export const feederCall = {
  instanceId: '',
  from: -Infinity,
  until: -Infinity,
  position: new THREE.Vector3(),
}
