#!/usr/bin/env node

/**
 * IAP metadata validator.
 *
 * Checks marketing/config/iap.json against:
 *   - the store character limits (ASC 30/45, Play 55/200)
 *   - the product ids and hint counts in src/config/app.ts (HINT_PACKS)
 *   - locale coverage (every locale in _meta.localeMappings, both stores)
 *   - Google Play product id syntax
 *   - price sanity (strictly rising price, falling price per hint)
 *   - wording Apple commonly rejects (price / discount / "free" in the listing)
 *
 * Usage:
 *   node marketing/scripts/validate-iap.js
 *   node marketing/scripts/validate-iap.js --csv     # print paste-ready tables
 */

const fs = require('fs');
const path = require('path');

const MARKETING_DIR = path.dirname(__dirname);
const PROJECT_DIR = path.dirname(MARKETING_DIR);
const IAP_FILE = path.join(MARKETING_DIR, 'config', 'iap.json');
const APP_CONFIG = path.join(PROJECT_DIR, 'src', 'config', 'app.ts');

const RED = '[0;31m';
const GREEN = '[0;32m';
const YELLOW = '[1;33m';
const DIM = '[2m';
const BOLD = '[1m';
const NC = '[0m';

const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/** Store limits count characters, not UTF-16 units, so count code points. */
const len = (s) => [...s].length;

// ─────────────────────────────────────────────────────────────────────────────
// Load
// ─────────────────────────────────────────────────────────────────────────────

if (!fs.existsSync(IAP_FILE)) {
  console.error(`${RED}✗${NC} Missing ${IAP_FILE}`);
  process.exit(1);
}

const iap = JSON.parse(fs.readFileSync(IAP_FILE, 'utf8'));
const limits = iap._meta.characterLimits;
const locales = Object.keys(iap._meta.localeMappings);

/** Pull the product id -> hint count map out of src/config/app.ts. */
function readAppHintPacks() {
  const src = fs.readFileSync(APP_CONFIG, 'utf8');
  const block = src.match(/HINTS_BY_PRODUCT:\s*\{([\s\S]*?)\}/);
  if (!block) return null;
  const packs = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(\d+)\s*,?\s*$/);
    if (m) packs[m[1]] = Number(m[2]);
  }
  return packs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checks
// ─────────────────────────────────────────────────────────────────────────────

// 1. Parity with the app config: a mismatch means the user pays for a pack and
//    gets the wrong number of hints (or nothing, since the credit is keyed on
//    the product id).
const appPacks = readAppHintPacks();
if (!appPacks) {
  warn(`Could not parse HINTS_BY_PRODUCT from ${path.relative(PROJECT_DIR, APP_CONFIG)}`);
} else {
  for (const product of iap.products) {
    const appHints = appPacks[product.productId];
    if (appHints === undefined) {
      fail(`${product.productId}: not present in app.ts HINTS_BY_PRODUCT`);
    } else if (appHints !== product.hints) {
      fail(`${product.productId}: hints ${product.hints} in iap.json vs ${appHints} in app.ts`);
    }
  }
  for (const id of Object.keys(appPacks)) {
    if (!iap.products.some((p) => p.productId === id)) {
      fail(`${id}: in app.ts HINTS_BY_PRODUCT but missing from iap.json`);
    }
  }
}

// 2. Play product id syntax: lowercase letters, digits, underscore, period;
//    must start with a letter or digit; max 40 characters.
const PLAY_ID = /^[a-z0-9][a-z0-9._]*$/;
for (const product of iap.products) {
  if (!PLAY_ID.test(product.productId)) {
    fail(`${product.productId}: invalid Google Play product id syntax`);
  }
  if (len(product.productId) > limits.android.productId) {
    fail(`${product.productId}: product id longer than ${limits.android.productId} chars`);
  }
  if (len(product.referenceName) > limits.ios.referenceName) {
    fail(`${product.productId}: reference name longer than ${limits.ios.referenceName} chars`);
  }
}

// 3. Reference names must be unique within the app in App Store Connect.
const refNames = iap.products.map((p) => p.referenceName);
if (new Set(refNames).size !== refNames.length) {
  fail('Duplicate App Store Connect reference names');
}

// 4. Locale coverage + character limits.
const rows = [];
for (const product of iap.products) {
  for (const locale of locales) {
    const entry = product.locales[locale];
    if (!entry) {
      fail(`${product.productId}: missing locale "${locale}"`);
      continue;
    }
    const checks = [
      ['ios.displayName', entry.ios?.displayName, limits.ios.displayName],
      ['ios.description', entry.ios?.description, limits.ios.description],
      ['android.name', entry.android?.name, limits.android.name],
      ['android.description', entry.android?.description, limits.android.description],
    ];
    for (const [field, value, max] of checks) {
      if (!value) {
        fail(`${product.productId} [${locale}] ${field}: missing`);
        continue;
      }
      const n = len(value);
      if (n > max) {
        fail(`${product.productId} [${locale}] ${field}: ${n}/${max} chars (over by ${n - max})`);
      } else {
        rows.push({ product: product.productId, locale, field, n, max });
      }
      if (value.trim() !== value) {
        warn(`${product.productId} [${locale}] ${field}: leading/trailing whitespace`);
      }
    }
  }

  if (!product.reviewNote || len(product.reviewNote) < 40) {
    warn(`${product.productId}: review note is missing or very short`);
  }
}

// 5. Wording Apple rejects in IAP names/descriptions.
const BANNED = [
  /\bfree\b/i,
  /\bgratis\b/i,
  /\bkostenlos\b/i,
  /\bbedava\b/i,
  /\bücretsiz\b/i,
  /\bsale\b/i,
  /\bdiscount\b/i,
  /\bbest value\b/i,
  /\d+\s*%/,
  /[$€£¥₺]/,
  /免费/,
  /무료/,
  /無料/,
];
for (const product of iap.products) {
  for (const locale of locales) {
    const entry = product.locales[locale];
    if (!entry) continue;
    const fields = [
      ['ios.displayName', entry.ios?.displayName],
      ['ios.description', entry.ios?.description],
      ['android.name', entry.android?.name],
      ['android.description', entry.android?.description],
    ];
    for (const [field, value] of fields) {
      if (!value) continue;
      for (const re of BANNED) {
        if (re.test(value)) {
          warn(`${product.productId} [${locale}] ${field}: contains "${value.match(re)[0]}" (price/discount wording is rejected by App Review)`);
        }
      }
    }
  }
}

// 6. Price sanity: higher tier must cost more in total and less per hint.
const sorted = [...iap.products].sort((a, b) => a.hints - b.hints);
for (let i = 1; i < sorted.length; i++) {
  const prev = sorted[i - 1];
  const cur = sorted[i];
  if (cur.price.usd <= prev.price.usd) {
    fail(`${cur.productId}: price ${cur.price.usd} is not above ${prev.productId} (${prev.price.usd})`);
  }
  if (cur.price.usd / cur.hints >= prev.price.usd / prev.hints) {
    warn(`${cur.productId}: per-hint price is not better than ${prev.productId}`);
  }
}
for (const product of iap.products) {
  const expected = String(Math.round(product.price.usd * 1_000_000));
  if (product.price.priceMicros !== expected) {
    fail(`${product.productId}: priceMicros ${product.price.priceMicros} does not match ${product.price.usd} USD (expected ${expected})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

function printSummary() {
  console.log(`\n${BOLD}Products${NC}`);
  console.log(`${DIM}  id                       hints   price    per hint${NC}`);
  for (const p of sorted) {
    const perHint = ((p.price.usd / p.hints) * 100).toFixed(1);
    console.log(
      `  ${p.productId.padEnd(24)} ${String(p.hints).padStart(4)}   $${p.price.usd.toFixed(2)}   ${perHint}c`
    );
  }

  const tightest = [...rows].sort((a, b) => b.n / b.max - a.n / a.max).slice(0, 5);
  console.log(`\n${BOLD}Tightest fields${NC} ${DIM}(closest to the limit)${NC}`);
  for (const r of tightest) {
    console.log(`  ${r.product.padEnd(24)} ${r.locale.padEnd(3)} ${r.field.padEnd(20)} ${r.n}/${r.max}`);
  }

  console.log(
    `\n${BOLD}Coverage${NC}  ${iap.products.length} products x ${locales.length} locales x 2 stores = ${iap.products.length * locales.length * 2} listings`
  );
}

function printCsv() {
  const m = iap._meta.localeMappings;
  console.log('\n# App Store Connect (product_id,asc_locale,display_name,description)');
  for (const p of iap.products) {
    for (const l of locales) {
      const e = p.locales[l].ios;
      console.log(`${p.productId},${m[l].ios},"${e.displayName}","${e.description}"`);
    }
  }
  console.log('\n# Google Play (product_id,play_locale,name,description)');
  for (const p of iap.products) {
    for (const l of locales) {
      const e = p.locales[l].android;
      console.log(`${p.productId},${m[l].android},"${e.name}","${e.description}"`);
    }
  }
}

printSummary();
if (process.argv.includes('--csv')) printCsv();

console.log('');
for (const w of warnings) console.log(`${YELLOW}!${NC} ${w}`);
for (const e of errors) console.log(`${RED}✗${NC} ${e}`);

if (errors.length === 0) {
  console.log(`${GREEN}✓${NC} iap.json valid (${warnings.length} warning${warnings.length === 1 ? '' : 's'})\n`);
  process.exit(0);
}
console.log(`${RED}✗${NC} ${errors.length} error${errors.length === 1 ? '' : 's'}\n`);
process.exit(1);
