/**
 * Made-up labels for pupils, as branch names are made: a word that describes and a thing
 * (brave-kettle, quiet-comet). The lists hold no words that are also first names (no amber,
 * ruby, robin, skye), so a label can never be, or be taken for, a real pupil's name; and no
 * colours, so a label cannot be confused with an overlay.
 */

export const LABEL_WORDS = [
  "brave", "calm", "clever", "cosy", "curly", "dizzy", "eager", "fizzy", "fluffy", "gentle",
  "giddy", "happy", "humble", "jolly", "lucky", "mellow", "nifty", "plucky", "polite", "proud",
  "quick", "quiet", "rapid", "shiny", "silly", "sleepy", "snappy", "snowy", "speedy", "spotty",
  "steady", "sturdy", "swift", "tidy", "tiny", "wobbly", "zesty", "bouncy", "chirpy", "crispy",
  "frosty", "breezy", "cheery", "nimble", "perky", "bold",
] as const;

export const LABEL_THINGS = [
  "kettle", "comet", "teapot", "otter", "badger", "puffin", "beetle", "lantern", "pebble", "thimble",
  "walrus", "acorn", "button", "compass", "crayon", "dragon", "ferry", "giraffe", "hedgehog", "igloo",
  "jigsaw", "kite", "ladder", "magnet", "noodle", "pancake", "pickle", "pretzel", "quilt", "rocket",
  "saucer", "scooter", "sprout", "teacup", "toffee", "trumpet", "tugboat", "umbrella", "wombat", "zebra",
  "biscuit", "bucket", "cactus", "carrot", "crumpet", "gherkin", "kipper", "lobster", "marble", "muffin",
  "oyster", "parsnip", "penguin", "piano", "puzzle", "robot", "scone", "spoon", "squirrel", "tractor",
  "turnip", "walnut",
] as const;

/**
 * A label not in `taken` (compared without case). `random` returns numbers in [0, 1), as
 * Math.random does; tests pass their own. After many misses it adds a number, so it always ends.
 */
export function makePupilLabel(taken: Iterable<string>, random: () => number = Math.random): string {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length) % xs.length]!;
  for (let i = 0; i < 200; i++) {
    const label = `${pick(LABEL_WORDS)}-${pick(LABEL_THINGS)}`;
    if (!used.has(label)) return label;
  }
  const base = `${pick(LABEL_WORDS)}-${pick(LABEL_THINGS)}`;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}
