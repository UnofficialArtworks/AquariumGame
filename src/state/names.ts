const NAMES = [
  'Bubbles', 'Finley', 'Splash', 'Pebble', 'Sunny', 'Ziggy', 'Mango', 'Captain', 'Noodle', 'Waffles',
  'Pickles', 'Biscuit', 'Taco', 'Sprinkles', 'Rocket', 'Comet', 'Ripple', 'Gilly', 'Wiggles', 'Sparky',
  'Marble', 'Pip', 'Luna', 'Ollie', 'Zippy', 'Poppy', 'Jellybean', 'Shadow', 'Blaze', 'Tango',
  'Kiwi', 'Doodle', 'Nugget', 'Pixel', 'Scout', 'Bean', 'Echo', 'Moss', 'Juniper', 'Cosmo',
  'Peanut', 'Glimmer', 'Turbo', 'Maple', 'Squiggle', 'Boo', 'Rusty', 'Opal', 'Chip', 'Wasabi',
]

/** A random friendly name that isn't already used in the tank, if possible. */
export function pickFishName(taken: string[]): string {
  const available = NAMES.filter((n) => !taken.includes(n))
  const pool = available.length > 0 ? available : NAMES
  return pool[Math.floor(Math.random() * pool.length)]
}
