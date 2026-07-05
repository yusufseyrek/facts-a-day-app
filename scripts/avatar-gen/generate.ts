/**
 * Generates src/config/avatarArt.ts — the vendored DiceBear avatar catalog.
 *
 * Standalone on purpose: DiceBear is a DEV-TIME dependency only (the app
 * ships pre-rendered SVG strings, no runtime generation), so its packages
 * live in this folder's own package.json instead of the app tree.
 *
 *   cd scripts/avatar-gen && bun install && bun run generate.ts
 *
 * 36 hand-curated Open Peeps (https://openpeeps.com, Pablo Stanley, CC0 1.0).
 * Options are FORCED per avatar (not seed-random) so every variant is visibly
 * distinct: 36 unique head/hair silhouettes, friendly faces only, the full
 * skin-tone range, a sprinkle of accessories and facial hair.
 *
 * The token is the stored wire value (mirrored in the backend allowlist —
 * src/db/appUsers.ts AVATAR_TOKENS); keep additions backward-safe and never
 * rename/remove a shipped token (existing rows keep the value).
 *
 * RN constraint: react-native-svg renders these via SvgXml and does NOT
 * support <filter>/<foreignObject>/<image>/<style>; the QA step below fails
 * the build if a style update ever introduces one.
 */
import { openPeeps } from '@dicebear/collection';
import { createAvatar } from '@dicebear/core';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Entry = { token: string; family: string; xml: string };

const SKIN = ['ffdbb4', 'edb98a', 'd08b5b', 'ae5d29', '694d3d'];
const CLOTHES = ['e78276', 'ffcf77', 'fdea6b', '78e185', '9ddadb', '8fa7df', 'e279a9'];

/** One entry per avatar — heads are all distinct so silhouettes never repeat.
 * Catalog order is the picker rail order (columns of 3, hue sweep by column). */
const PEEPS: {
  name: string;
  head: string;
  face: string;
  skin: number;
  clothes: number;
  accessory?: string;
  facialHair?: string;
}[] = [
  { name: 'sol', head: 'afro', face: 'smile', skin: 3, clothes: 0 },
  { name: 'wren', head: 'bangs', face: 'calm', skin: 0, clothes: 4, accessory: 'glasses2' },
  { name: 'zola', head: 'bantuKnots', face: 'smileBig', skin: 4, clothes: 2 },
  { name: 'mika', head: 'buns', face: 'cute', skin: 1, clothes: 5 },
  { name: 'remy', head: 'dreads1', face: 'smileTeethGap', skin: 2, clothes: 6 },
  { name: 'kofi', head: 'flatTop', face: 'cheeky', skin: 4, clothes: 1, facialHair: 'goatee1' },
  { name: 'noor', head: 'hijab', face: 'calm', skin: 1, clothes: 3 },
  { name: 'ivy', head: 'longCurly', face: 'smile', skin: 0, clothes: 2 },
  { name: 'rex', head: 'mohawk', face: 'lovingGrin1', skin: 2, clothes: 0 },
  { name: 'otis', head: 'pomp', face: 'awe', skin: 3, clothes: 5, accessory: 'sunglasses' },
  { name: 'lulu', head: 'mediumBangs', face: 'smileLOL', skin: 0, clothes: 6 },
  { name: 'ravi', head: 'turban', face: 'smile', skin: 2, clothes: 4, facialHair: 'full' },
  { name: 'kai', head: 'bear', face: 'smileBig', skin: 2, clothes: 3 },
  { name: 'juno', head: 'bun', face: 'cute', skin: 0, clothes: 1 },
  { name: 'tess', head: 'bun2', face: 'calm', skin: 1, clothes: 0 },
  { name: 'omar', head: 'shaved2', face: 'smile', skin: 3, clothes: 2, facialHair: 'chin' },
  { name: 'faye', head: 'longBangs', face: 'awe', skin: 0, clothes: 5 },
  { name: 'gus', head: 'grayShort', face: 'smile', skin: 1, clothes: 4, facialHair: 'moustache1' },
  { name: 'lena', head: 'mediumStraight', face: 'smile', skin: 2, clothes: 6 },
  { name: 'nico', head: 'short2', face: 'cheeky', skin: 1, clothes: 2, accessory: 'glasses3' },
  { name: 'ruby', head: 'longAfro', face: 'smileBig', skin: 4, clothes: 0 },
  { name: 'moss', head: 'hatBeanie', face: 'lovingGrin1', skin: 2, clothes: 5 },
  { name: 'ezra', head: 'short5', face: 'driven', skin: 0, clothes: 3 },
  { name: 'pearl', head: 'grayBun', face: 'calm', skin: 1, clothes: 6 },
  { name: 'finn', head: 'bangs2', face: 'smileTeethGap', skin: 0, clothes: 4 },
  { name: 'cleo', head: 'cornrows', face: 'cute', skin: 4, clothes: 5 },
  { name: 'hugo', head: 'noHair1', face: 'smileLOL', skin: 2, clothes: 1, facialHair: 'goatee2' },
  { name: 'isla', head: 'long', face: 'cute', skin: 0, clothes: 2 },
  { name: 'jade', head: 'twists', face: 'smile', skin: 3, clothes: 6 },
  { name: 'kito', head: 'flatTopLong', face: 'awe', skin: 4, clothes: 3 },
  { name: 'luca', head: 'short3', face: 'smileBig', skin: 1, clothes: 0 },
  { name: 'mona', head: 'medium2', face: 'cheeky', skin: 2, clothes: 4 },
  { name: 'nell', head: 'mediumBangs3', face: 'smile', skin: 0, clothes: 6, accessory: 'glasses5' },
  { name: 'rosa', head: 'medium1', face: 'smileBig', skin: 3, clothes: 5 },
  { name: 'saul', head: 'noHair3', face: 'calm', skin: 4, clothes: 1, facialHair: 'full3' },
  { name: 'vera', head: 'hatHip', face: 'lovingGrin2', skin: 1, clothes: 3 },
];

/** Strip license metadata + comments and collapse inter-tag whitespace. */
function clean(svg: string): string {
  return svg
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

const entries: Entry[] = [];

for (const p of PEEPS) {
  const xml = createAvatar(openPeeps, {
    seed: p.name,
    head: [p.head as never],
    face: [p.face as never],
    skinColor: [SKIN[p.skin]],
    clothingColor: [CLOTHES[p.clothes]],
    accessories: p.accessory ? [p.accessory as never] : [],
    accessoriesProbability: p.accessory ? 100 : 0,
    facialHair: p.facialHair ? [p.facialHair as never] : [],
    facialHairProbability: p.facialHair ? 100 : 0,
    maskProbability: 0,
  }).toString();
  entries.push({ token: `peep-${p.name}`, family: 'open-peeps', xml: clean(xml) });
}

// --- QA gates ---
const BAD = ['<filter', '<foreignObject', '<image', '<style', '<script'];
if (new Set(entries.map((e) => e.xml)).size !== entries.length)
  throw new Error('duplicate avatar output');
if (new Set(PEEPS.map((p) => p.head)).size !== PEEPS.length)
  throw new Error('duplicate head silhouette');
for (const e of entries) {
  if (!e.xml.startsWith('<svg')) throw new Error(`${e.token}: unexpected output`);
  const flags = BAD.filter((b) => e.xml.includes(b));
  if (flags.length) throw new Error(`${e.token}: RN-unsupported SVG feature ${flags.join(',')}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.token))
    throw new Error(`${e.token}: token must be kebab-case`);
}

// Rail order is the REVERSE of the curation list above (vera leads, sol
// closes) — catalog order in the emitted file is the display order.
entries.reverse();

const body = entries
  .map((e) => `  { token: '${e.token}', family: '${e.family}', xml: ${JSON.stringify(e.xml)} },`)
  .join('\n');

const out = `// AUTO-GENERATED by scripts/avatar-gen/generate.ts — do not edit by hand.
// Curated DiceBear (https://dicebear.com) avatar catalog: 36 Open Peeps
// (openpeeps.com, Pablo Stanley, CC0 1.0), pre-rendered to plain SVG strings
// (no runtime DiceBear dep). Tokens are the stored wire values — mirrored in
// the backend allowlist (src/db/appUsers.ts); never rename or remove a
// shipped token. To regenerate:
//   cd scripts/avatar-gen && bun install && bun run generate.ts

export const AVATAR_ART = [
${body}
] as const;
`;

const target = fileURLToPath(new URL('../../src/config/avatarArt.ts', import.meta.url));
writeFileSync(target, out);
const kb = Math.round(out.length / 1024);
console.log(`wrote ${target} (${entries.length} avatars, ${kb}KB)`);
