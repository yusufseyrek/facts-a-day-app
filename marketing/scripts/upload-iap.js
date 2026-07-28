#!/usr/bin/env node

/**
 * IAP uploader: pushes marketing/config/iap.json to App Store Connect and
 * Google Play. Idempotent, so it can be re-run after a copy edit.
 *
 * App Store Connect (per product)
 *   1. POST /v2/inAppPurchases                     create the consumable
 *   2. POST /v1/inAppPurchaseLocalizations         one per locale (PATCH if it drifted)
 *   3. GET  /v2/inAppPurchases/{id}/pricePoints    find the USD price point
 *   4. POST /v1/inAppPurchasePriceSchedules        base territory USA, auto-fill the rest
 *   Review screenshot + submission stay manual (a screenshot file is required
 *   before Apple accepts a submission).
 *
 * Google Play (per product) — the legacy inappproducts API is retired for this
 * account ("Please migrate to the new publishing API"), so this uses the
 * one-time products API:
 *   1. POST  /pricing:convertRegionPrices          USD -> every region
 *   2. PATCH /onetimeproducts/{id}?allowMissing    listings + purchase option
 *   3. POST  /oneTimeProducts/{id}/purchaseOptions:batchUpdateStates   activate
 *
 * Usage:
 *   node marketing/scripts/upload-iap.js --all --dry-run
 *   node marketing/scripts/upload-iap.js --ios
 *   node marketing/scripts/upload-iap.js --android
 *   node marketing/scripts/upload-iap.js --all --product factsaday_hints_small
 *
 * Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, GOOGLE_PLAY_JSON_KEY
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const MARKETING_DIR = path.dirname(SCRIPT_DIR);
const IAP_FILE = path.join(MARKETING_DIR, 'config', 'iap.json');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const BLUE = '\x1b[0;34m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

const info = (m) => console.log(`${BLUE}▸${NC} ${m}`);
const ok = (m) => console.log(`${GREEN}✓${NC} ${m}`);
const warn = (m) => console.log(`${YELLOW}!${NC} ${m}`);
const err = (m) => console.error(`${RED}✗${NC} ${m}`);
const step = (m) => console.log(`  ${DIM}${m}${NC}`);

// ─────────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const DO_IOS = argv.includes('--ios') || argv.includes('--all');
const DO_ANDROID = argv.includes('--android') || argv.includes('--all');
const productFilter = argv.includes('--product') ? argv[argv.indexOf('--product') + 1] : null;

if (!DO_IOS && !DO_ANDROID) {
  console.log('Usage: upload-iap.js [--ios|--android|--all] [--dry-run] [--product <id>]');
  process.exit(1);
}

const iap = JSON.parse(fs.readFileSync(IAP_FILE, 'utf8'));
const localeMap = iap._meta.localeMappings;

// Review screenshot: --screenshot wins, otherwise ios.reviewScreenshot from
// iap.json (relative to the app directory). Missing file is not fatal; the rest
// of the metadata still syncs and the product just stays in MISSING_METADATA.
const PROJECT_DIR = path.dirname(MARKETING_DIR);
const screenshotArg = argv.includes('--screenshot') ? argv[argv.indexOf('--screenshot') + 1] : null;
const screenshotCandidate = path.resolve(PROJECT_DIR, screenshotArg || iap.ios.reviewScreenshot || '');
const screenshotPath = fs.existsSync(screenshotCandidate) ? screenshotCandidate : null;
const products = iap.products.filter((p) => !productFilter || p.productId === productFilter);

if (products.length === 0) {
  err(`No product matches --product ${productFilter}`);
  process.exit(1);
}

// The listing data must be valid before anything is pushed to a live console.
try {
  execFileSync('node', [path.join(SCRIPT_DIR, 'validate-iap.js')], { stdio: 'pipe' });
  ok('iap.json passes validation');
} catch {
  err('validate-iap.js failed. Fix the listing data before uploading.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────────

function request(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = { raw: data.slice(0, 400) };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function describeError(res) {
  const e = res.body?.errors?.[0];
  if (e) return `${res.status} ${e.title}: ${e.detail || ''}`.trim();
  if (res.body?.error) return `${res.status} ${res.body.error.message}`;
  return `${res.status} ${JSON.stringify(res.body).slice(0, 300)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// App Store Connect
// ─────────────────────────────────────────────────────────────────────────────

const ASC = 'https://api.appstoreconnect.apple.com';
let ascToken = null;

function ascHeaders() {
  if (!ascToken) ascToken = execFileSync('node', [path.join(SCRIPT_DIR, 'asc-token.js')]).toString().trim();
  return { Authorization: `Bearer ${ascToken}` };
}

const asc = (method, p, body) => request(method, ASC + p, { headers: ascHeaders(), body });

async function iosAppId() {
  const res = await asc('GET', `/v1/apps?filter%5BbundleId%5D=${encodeURIComponent(iap.ios.bundleId)}`);
  if (res.status !== 200 || !res.body.data?.length) throw new Error(`App lookup failed: ${describeError(res)}`);
  return res.body.data[0].id;
}

async function findIosProduct(appId, productId) {
  const res = await asc(
    'GET',
    `/v1/apps/${appId}/inAppPurchasesV2?filter%5BproductId%5D=${encodeURIComponent(productId)}&limit=200`
  );
  if (res.status !== 200) throw new Error(`IAP lookup failed: ${describeError(res)}`);
  return res.body.data.find((d) => d.attributes.productId === productId) || null;
}

async function createIosProduct(appId, product) {
  const body = {
    data: {
      type: 'inAppPurchases',
      attributes: {
        name: product.referenceName,
        productId: product.productId,
        inAppPurchaseType: iap.ios.type,
        reviewNote: product.reviewNote,
        familySharable: iap.ios.familySharable,
        availableInAllTerritories: true,
      },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
  };
  if (DRY_RUN) {
    step(`DRY POST /v2/inAppPurchases ${product.productId} (${iap.ios.type})`);
    return { id: 'DRY-RUN-ID' };
  }
  const res = await asc('POST', '/v2/inAppPurchases', body);
  if (res.status !== 201) throw new Error(`Create failed: ${describeError(res)}`);
  return res.body.data;
}

/** The review note is only settable at creation, so an existing product needs a PATCH. */
async function syncIosReviewNote(existing, product) {
  if (existing.attributes?.reviewNote === product.reviewNote) {
    step('review note up to date');
    return;
  }
  if (DRY_RUN) {
    step('DRY PATCH review note');
    return;
  }
  const res = await asc('PATCH', `/v2/inAppPurchases/${existing.id}`, {
    data: {
      type: 'inAppPurchases',
      id: existing.id,
      attributes: { reviewNote: product.reviewNote },
    },
  });
  if (res.status !== 200) throw new Error(`Review note failed: ${describeError(res)}`);
  step('review note set');
}

/** Raw (non-JSON) byte upload for an App Store Connect upload operation. */
function uploadBytes(op, buffer) {
  return new Promise((resolve, reject) => {
    const u = new URL(op.url);
    const slice = buffer.subarray(op.offset, op.offset + op.length);
    const headers = {};
    for (const h of op.requestHeaders || []) headers[h.name] = h.value;
    headers['Content-Length'] = slice.length;
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: op.method, headers },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', reject);
    req.write(slice);
    req.end();
  });
}

/**
 * Attach the App Review screenshot. Apple requires one per in-app purchase
 * before it can be submitted; all three packs are sold from the same sheet, so
 * the same image is valid for each.
 */
async function syncIosScreenshot(iapId, screenshotPath) {
  const current = await asc('GET', `/v2/inAppPurchases/${iapId}/appStoreReviewScreenshot`);
  const existingAsset = current.status === 200 ? current.body.data : null;
  if (existingAsset) {
    const delivery = existingAsset.attributes?.assetDeliveryState || {};
    if (delivery.state === 'COMPLETE') {
      step('review screenshot already attached');
      return;
    }
    // A rejected asset (wrong dimensions, interrupted upload) occupies the slot
    // and blocks a fresh one, so clear it before retrying.
    const reason = delivery.errors?.[0]?.code || delivery.state || 'unknown';
    if (DRY_RUN) {
      step(`DRY delete ${delivery.state} screenshot (${reason})`);
    } else {
      const del = await asc('DELETE', `/v1/inAppPurchaseAppStoreReviewScreenshots/${existingAsset.id}`);
      if (del.status !== 204) throw new Error(`Screenshot delete failed: ${describeError(del)}`);
      step(`removed ${delivery.state} screenshot (${reason})`);
    }
  }
  if (DRY_RUN) {
    step(`DRY upload review screenshot ${path.basename(screenshotPath)}`);
    return;
  }

  const buffer = fs.readFileSync(screenshotPath);
  const reserve = await asc('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', {
    data: {
      type: 'inAppPurchaseAppStoreReviewScreenshots',
      attributes: { fileName: path.basename(screenshotPath), fileSize: buffer.length },
      relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: iapId } } },
    },
  });
  if (reserve.status !== 201) throw new Error(`Screenshot reserve failed: ${describeError(reserve)}`);

  const asset = reserve.body.data;
  for (const op of asset.attributes.uploadOperations) {
    const status = await uploadBytes(op, buffer);
    if (status >= 300) throw new Error(`Screenshot upload chunk failed with ${status}`);
  }

  const checksum = require('crypto').createHash('md5').update(buffer).digest('hex');
  const commit = await asc('PATCH', `/v1/inAppPurchaseAppStoreReviewScreenshots/${asset.id}`, {
    data: {
      type: 'inAppPurchaseAppStoreReviewScreenshots',
      id: asset.id,
      attributes: { uploaded: true, sourceFileChecksum: checksum },
    },
  });
  if (commit.status !== 200) throw new Error(`Screenshot commit failed: ${describeError(commit)}`);
  step(`review screenshot uploaded (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function syncIosLocalizations(iapId, product) {
  const existing = DRY_RUN
    ? { status: 200, body: { data: [] } }
    : await asc('GET', `/v2/inAppPurchases/${iapId}/inAppPurchaseLocalizations?limit=200`);
  if (existing.status !== 200) throw new Error(`Localization list failed: ${describeError(existing)}`);
  const byLocale = new Map(existing.body.data.map((d) => [d.attributes.locale, d]));

  for (const [appLocale, entry] of Object.entries(product.locales)) {
    const locale = localeMap[appLocale].ios;
    const attrs = { name: entry.ios.displayName, description: entry.ios.description, locale };
    const current = byLocale.get(locale);

    if (current) {
      const same =
        current.attributes.name === attrs.name && current.attributes.description === attrs.description;
      if (same) {
        step(`${locale} up to date`);
        continue;
      }
      if (DRY_RUN) {
        step(`DRY PATCH localization ${locale}`);
        continue;
      }
      const res = await asc('PATCH', `/v1/inAppPurchaseLocalizations/${current.id}`, {
        data: {
          type: 'inAppPurchaseLocalizations',
          id: current.id,
          attributes: { name: attrs.name, description: attrs.description },
        },
      });
      if (res.status !== 200) throw new Error(`PATCH ${locale} failed: ${describeError(res)}`);
      step(`${locale} updated`);
      continue;
    }

    if (DRY_RUN) {
      step(`DRY POST localization ${locale} "${attrs.name}"`);
      continue;
    }
    const res = await asc('POST', '/v1/inAppPurchaseLocalizations', {
      data: {
        type: 'inAppPurchaseLocalizations',
        attributes: attrs,
        relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: iapId } } },
      },
    });
    if (res.status !== 201) throw new Error(`POST ${locale} failed: ${describeError(res)}`);
    step(`${locale} created`);
  }
}

async function setIosPrice(iapId, product) {
  if (DRY_RUN) {
    step(`DRY price schedule $${product.price.usd.toFixed(2)} (base territory USA)`);
    return;
  }

  const schedule = await asc('GET', `/v2/inAppPurchases/${iapId}/iapPriceSchedule`);
  if (schedule.status === 200 && schedule.body.data) {
    const prices = await asc(
      'GET',
      `/v1/inAppPurchasePriceSchedules/${schedule.body.data.id}/manualPrices?include=inAppPurchasePricePoint&limit=1`
    );
    const point = prices.body?.included?.[0]?.attributes?.customerPrice;
    if (point && Number(point) === product.price.usd) {
      step(`price already $${product.price.usd.toFixed(2)}`);
      return;
    }
  }

  const pts = await asc(
    'GET',
    `/v2/inAppPurchases/${iapId}/pricePoints?filter%5Bterritory%5D=USA&limit=200`
  );
  if (pts.status !== 200) throw new Error(`Price points failed: ${describeError(pts)}`);
  const target = pts.body.data.find((p) => Number(p.attributes.customerPrice) === product.price.usd);
  if (!target) throw new Error(`No USD price point for $${product.price.usd}`);

  const res = await asc('POST', '/v1/inAppPurchasePriceSchedules', {
    data: {
      type: 'inAppPurchasePriceSchedules',
      relationships: {
        inAppPurchase: { data: { type: 'inAppPurchases', id: iapId } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price1}' }] },
      },
    },
    included: [
      {
        type: 'inAppPurchasePrices',
        id: '${price1}',
        attributes: { startDate: null, endDate: null },
        relationships: {
          inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: target.id } },
        },
      },
    ],
  });
  if (res.status !== 201) throw new Error(`Price schedule failed: ${describeError(res)}`);
  step(`price set to $${product.price.usd.toFixed(2)} (base USA, other territories auto-filled)`);
}

async function runIos() {
  console.log(`\n${BOLD}App Store Connect${NC}`);
  const appId = await iosAppId();
  info(`App ${iap.ios.bundleId} (${appId})`);

  for (const product of products) {
    console.log(`\n${BOLD}${product.productId}${NC} ${DIM}${product.hints} hints${NC}`);
    let existing = DRY_RUN ? null : await findIosProduct(appId, product.productId);
    if (existing) {
      step(`exists (${existing.id}, state ${existing.attributes.state})`);
    } else {
      existing = await createIosProduct(appId, product);
      step(`created (${existing.id})`);
    }
    await syncIosReviewNote(existing, product);
    await syncIosLocalizations(existing.id, product);
    await setIosPrice(existing.id, product);
    if (screenshotPath) await syncIosScreenshot(existing.id, screenshotPath);
    ok(`${product.productId} done`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Play
// ─────────────────────────────────────────────────────────────────────────────

const PLAY = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
let playToken = null;

function playHeaders() {
  if (!playToken) playToken = execFileSync('node', [path.join(SCRIPT_DIR, 'google-token.js')]).toString().trim();
  return { Authorization: `Bearer ${playToken}` };
}

const play = (method, p, body) => request(method, PLAY + p, { headers: playHeaders(), body });

const pkg = () => encodeURIComponent(iap.android.packageName);

/** USD price -> per-region prices, plus the regions version the API demands. */
async function convertPrices(usd) {
  const units = String(Math.floor(usd));
  const nanos = Math.round((usd - Math.floor(usd)) * 1e9);
  const res = await play('POST', `/applications/${pkg()}/pricing:convertRegionPrices`, {
    price: { currencyCode: 'USD', units, nanos },
  });
  if (res.status !== 200) throw new Error(`convertRegionPrices failed: ${describeError(res)}`);
  return res.body;
}

async function getPlayProduct(productId) {
  const res = await play('GET', `/applications/${pkg()}/oneTimeProducts/${productId}`);
  if (res.status === 200) return res.body;
  if (res.status === 404) return null;
  throw new Error(`Get failed: ${describeError(res)}`);
}

const moneyToNumber = (m) => (m ? Number(m.units || 0) + (m.nanos || 0) / 1e9 : NaN);

const playListings = (product) =>
  Object.entries(product.locales).map(([appLocale, entry]) => ({
    languageCode: localeMap[appLocale].android,
    title: entry.android.name,
    description: entry.android.description,
  }));

/**
 * Create the product, or update only its listings when it already exists.
 *
 * A PATCH that carries `purchaseOptions` must repeat every existing option or
 * the API rejects it ("Product must list all of its existing purchase options"),
 * and rewriting them would clobber prices that are already correct. So for an
 * existing product the update mask is listings-only and the pricing is left
 * exactly as the console has it, with a warning if it disagrees with iap.json.
 */
async function upsertPlayProduct(product, regionsVersion, existing) {
  const listings = playListings(product);
  const base = { packageName: iap.android.packageName, productId: product.productId, listings };

  let body;
  let updateMask;
  let created = false;

  if (existing) {
    const option = existing.purchaseOptions?.[0];
    const livePrice = moneyToNumber(option?.newRegionsConfig?.usdPrice);
    if (Number.isFinite(livePrice) && Math.abs(livePrice - product.price.usd) > 0.001) {
      warn(
        `${product.productId}: console price $${livePrice.toFixed(2)} differs from iap.json $${product.price.usd.toFixed(2)} (left as-is)`
      );
    }
    body = base;
    updateMask = 'listings';
  } else {
    created = true;
    const converted = await convertPrices(product.price.usd);
    body = {
      ...base,
      purchaseOptions: [
        {
          purchaseOptionId: product.productId.replace(/_/g, '-'),
          // legacyCompatible is what makes the product visible to the classic
          // Play Billing query path that expo-iap uses. Without it the app
          // would fetch nothing and every tile would sit on "---".
          buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
          regionalPricingAndAvailabilityConfigs: Object.entries(converted.convertedRegionPrices).map(
            ([regionCode, v]) => ({ regionCode, price: v.price, availability: 'AVAILABLE' })
          ),
          newRegionsConfig: {
            usdPrice: converted.convertedOtherRegionsPrice.usdPrice,
            eurPrice: converted.convertedOtherRegionsPrice.eurPrice,
            availability: 'AVAILABLE',
          },
        },
      ],
    };
    updateMask = 'listings,purchaseOptions';
  }

  const qs =
    `?allowMissing=true&updateMask=${updateMask}` +
    `&regionsVersion.version=${encodeURIComponent(regionsVersion)}`;

  if (DRY_RUN) {
    step(`DRY PATCH onetimeproducts/${product.productId}${qs}`);
    step(`     ${listings.length} listings${created ? ', new purchase option + prices' : ' (pricing untouched)'}`);
    return created;
  }

  const res = await play('PATCH', `/applications/${pkg()}/onetimeproducts/${product.productId}${qs}`, body);
  if (res.status !== 200) throw new Error(`Upsert failed: ${describeError(res)}`);
  step(`${listings.length} listings synced${created ? ', purchase option created' : ' (pricing untouched)'}`);
  return created;
}

async function activatePlayPurchaseOption(product, existing) {
  const option = existing?.purchaseOptions?.[0];
  const optionId = option?.purchaseOptionId || product.productId.replace(/_/g, '-');

  if (option?.state === 'ACTIVE') {
    step(`purchase option "${optionId}" already active`);
    return;
  }
  if (DRY_RUN) {
    step(`DRY activate purchase option "${optionId}"`);
    return;
  }
  const res = await play(
    'POST',
    `/applications/${pkg()}/oneTimeProducts/${product.productId}/purchaseOptions:batchUpdateStates`,
    {
      requests: [
        {
          activatePurchaseOptionRequest: {
            packageName: iap.android.packageName,
            productId: product.productId,
            purchaseOptionId: optionId,
          },
        },
      ],
    }
  );
  if (res.status !== 200) throw new Error(`Activate failed: ${describeError(res)}`);
  step(`purchase option "${optionId}" active`);
}

async function runAndroid() {
  console.log(`\n${BOLD}Google Play${NC}`);
  info(`App ${iap.android.packageName}`);

  // The regions version is a required query param on every upsert. Any
  // conversion call reports the current one, so ask once and reuse it.
  const regionsVersion = (await convertPrices(1)).regionVersion.version;
  info(`Regions version ${regionsVersion}`);

  for (const product of products) {
    console.log(`\n${BOLD}${product.productId}${NC} ${DIM}${product.hints} hints${NC}`);
    const existing = DRY_RUN ? null : await getPlayProduct(product.productId);
    step(existing ? 'exists' : 'not found, will be created');
    await upsertPlayProduct(product, regionsVersion, existing);
    await activatePlayPurchaseOption(product, existing);
    ok(`${product.productId} done`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  if (DRY_RUN) warn('DRY RUN: no requests that change state will be sent');
  try {
    if (DO_IOS) await runIos();
    if (DO_ANDROID) await runAndroid();
  } catch (e) {
    console.log('');
    err(e.message);
    process.exit(1);
  }
  console.log('');
  ok('Upload complete');
  if (DO_IOS) {
    warn('iOS: attach a review screenshot to each IAP, then submit for review (both are manual).');
  }
})();
