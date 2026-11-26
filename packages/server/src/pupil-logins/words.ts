/**
 * Made-up usernames and passwords for pupil logins (issue #223). Words a pupil can read and type,
 * chosen to be plain: short and common, avoiding first names, colours that name people, and words
 * we know of as slang or as teasing in a British classroom. That is judgement, not a guarantee:
 * `words.test.ts` checks the list's shape and a block list of words taken out, so read the list
 * again before adding to it, and add any word taken out to the block list.
 *
 *   username  two words and two digits, `green-otter-27` (unique site-wide: the store retries)
 *   password  two words and three digits, `maple-acorn-418`
 *
 * Randomness is `node:crypto`'s `randomInt`, which is unbiased.
 */
import { randomInt } from 'node:crypto';

export const WORDS: readonly string[] = [
  // animals
  'otter', 'badger', 'bison', 'deer', 'eagle', 'ferret', 'gecko', 'heron', 'koala', 'lemur',
  'llama', 'mouse', 'owl', 'panda', 'puffin', 'seal', 'squid', 'stork', 'swan', 'turtle', 'zebra',
  'hare', 'kiwi', 'lion', 'wolf', 'bee', 'ant', 'moth', 'dove', 'tapir', 'okapi', 'hedgehog',
  'penguin', 'gerbil', 'hamster', 'kitten', 'puppy', 'lamb', 'foal', 'dolphin', 'octopus',
  'pelican', 'toucan', 'salmon', 'beetle', 'ladybird',
  // plants and food
  'apple', 'acorn', 'berry', 'cocoa', 'grape', 'lime', 'mango', 'oat', 'radish', 'rice', 'tomato',
  'wheat', 'cactus', 'moss', 'oak', 'pine', 'tulip', 'leaf', 'seed', 'bamboo', 'kale', 'leek',
  'fig', 'bread', 'pasta', 'soup', 'bagel', 'maple', 'biscuit', 'pretzel', 'scone', 'pancake',
  'apricot', 'almond', 'walnut', 'parsnip', 'celery', 'spinach', 'lentil', 'barley',
  // places and weather
  'cloud', 'comet', 'coast', 'desert', 'field', 'frost', 'hill', 'island', 'lake', 'meadow', 'moon',
  'planet', 'pond', 'puddle', 'sand', 'shell', 'snow', 'star', 'stone', 'sun', 'tide', 'valley',
  'wave', 'wind', 'ice', 'bay', 'cave', 'dune', 'peak', 'orbit', 'lagoon', 'harbour', 'canyon',
  'glacier', 'volcano', 'garden', 'orchard', 'pebble', 'breeze', 'rainbow', 'thunder', 'canal',
  'bridge', 'tower', 'meteor', 'galaxy', 'crater', 'reef', 'summit',
  // things
  'arrow', 'boat', 'book', 'bottle', 'brush', 'bucket', 'button', 'candle', 'castle', 'chair',
  'clock', 'coin', 'cup', 'desk', 'door', 'drum', 'flag', 'gate', 'glove', 'hat', 'kettle', 'key',
  'kite', 'lamp', 'lantern', 'map', 'mitten', 'nest', 'paper', 'pencil', 'piano', 'pillow',
  'pocket', 'rope', 'ruler', 'sail', 'scarf', 'shoe', 'sock', 'stamp', 'table', 'tent', 'ticket',
  'train', 'tray', 'tunnel', 'wheel', 'window', 'ladder', 'magnet', 'medal', 'mirror', 'puzzle',
  'robot', 'sledge', 'teapot', 'tractor', 'violin', 'banjo', 'cello', 'flute', 'rocket', 'compass',
  'jigsaw', 'teacup', 'satchel', 'crayon', 'easel', 'globe', 'atlas', 'camera', 'kayak', 'canoe',
  'engine', 'scooter', 'ferry', 'feather', 'ribbon', 'beacon', 'quill', 'abacus', 'chalk', 'folder',
  'notebook',
  // describing words
  'bold', 'brave', 'bright', 'calm', 'clever', 'cosy', 'crisp', 'fast', 'gentle', 'glad', 'golden',
  'green', 'happy', 'jolly', 'kind', 'lucky', 'mighty', 'neat', 'quick', 'quiet', 'rapid', 'shiny',
  'silver', 'smart', 'snowy', 'steady', 'swift', 'tidy', 'warm', 'wise', 'purple', 'orange',
  'cosmic', 'brisk', 'nimble', 'sturdy', 'polite', 'patient', 'curious', 'cheerful', 'friendly',
];

const word = (): string => WORDS[randomInt(WORDS.length)]!;
const digits = (n: number): string => String(randomInt(10 ** n)).padStart(n, '0');

/** `green-otter-27`: lower case. Not checked for uniqueness here (the store does that). */
export function makeUsername(): string {
  return `${word()}-${word()}-${digits(2)}`;
}

/** `maple-acorn-418`. */
export function makePassword(): string {
  return `${word()}-${word()}-${digits(3)}`;
}
