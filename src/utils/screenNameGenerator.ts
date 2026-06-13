/**
 * Random screen-name suggestions for the claim dialog: Adjective + Noun + 2
 * digits, knowledge/nature themed, always matching the backend rule
 * (^[A-Za-z0-9_]{3,20}$). Longest combination is 7 + 7 + 2 = 16 chars.
 */

const ADJECTIVES = [
  'Curious',
  'Clever',
  'Bright',
  'Witty',
  'Bold',
  'Calm',
  'Swift',
  'Lucky',
  'Cosmic',
  'Daring',
  'Eager',
  'Golden',
  'Hidden',
  'Keen',
  'Lively',
  'Mighty',
  'Noble',
  'Quick',
  'Quiet',
  'Rapid',
  'Sharp',
  'Sunny',
  'Vivid',
  'Wise',
] as const;

const NOUNS = [
  'Otter',
  'Falcon',
  'Atlas',
  'Comet',
  'Sphinx',
  'Nebula',
  'Pixel',
  'Quark',
  'Raven',
  'Tiger',
  'Walrus',
  'Yeti',
  'Zephyr',
  'Badger',
  'Condor',
  'Dingo',
  'Ember',
  'Fjord',
  'Gecko',
  'Heron',
  'Ibex',
  'Jackal',
  'Koala',
  'Lynx',
] as const;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function generateScreenName(): string {
  const number = Math.floor(Math.random() * 90) + 10; // 10..99
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${number}`;
}
