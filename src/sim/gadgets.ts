/**
 * Shared, non-React state for gadget decorations. The simulation writes the
 * time a gadget last "fired" (e.g. the auto-feeder dropping pellets) and the
 * gadget's animated visual reads it to play a matching puff/flash.
 */
export const gadgetPulses = new Map<string, number>()
