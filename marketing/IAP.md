# In-App Purchases: Trivia Hint Packs

Everything needed to create the three consumable hint packs in App Store Connect
and Google Play Console, and to verify them before they go live.

Source of truth for the listing copy: [`marketing/config/iap.json`](config/iap.json).
Source of truth for the product ids and hint counts: `src/config/app.ts`
(`HINT_PACKS.HINTS_BY_PRODUCT`). The validator keeps the two in sync:

```bash
node marketing/scripts/validate-iap.js          # limits, parity, price sanity
node marketing/scripts/validate-iap.js --csv    # paste-ready listing tables
```

Both stores are driven by the uploader, which is idempotent and safe to re-run
after a copy edit. Sections 3 and 4 below describe the same work by hand, for
when you would rather use the console.

```bash
node marketing/scripts/upload-iap.js --all --dry-run   # show every request
node marketing/scripts/upload-iap.js --all             # push both stores
node marketing/scripts/upload-iap.js --ios --product factsaday_hints_small
```

It requires `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH` and
`GOOGLE_PLAY_JSON_KEY`, the same variables `upload-metadata.sh` uses, and it
refuses to run if `validate-iap.js` fails. Google's OAuth host is outside the
default sandbox, so run it unsandboxed.

What it does not do: submit the iOS products for review. That is deliberate,
see section 9.

---

## 1. What ships

| Product ID | Hints | Price (USD) | Per hint | ASC reference name | Type |
|---|---|---|---|---|---|
| `factsaday_hints_small` | 20 | $0.99 | 5.0c | Trivia Hints 20 | Consumable |
| `factsaday_hints_medium` | 50 | $1.99 | 4.0c | Trivia Hints 50 | Consumable |
| `factsaday_hints_large` | 100 | $2.99 | 3.0c | Trivia Hints 100 | Consumable |

Anchors: the real subscription prices are $0.69/week and $1.99/month, so every
pack clears the rewarded-ad floor and the largest pack is roughly a month of
heavy hint use. Localized copy exists for the 8 app languages (en, de, es, fr,
ja, ko, tr, zh). The 26 iOS store-metadata-only locales fall back to `en-US`,
which is fine for IAP listings.

---

## 2. Before touching either console

- Paid Apps agreement, tax and banking are already active on both stores
  (subscriptions are live), so nothing new is required there.
- **Product ids are permanent.** Apple never allows an id to be reused, Google
  never allows a deleted id to be reused. Copy them from the table above rather
  than typing them.
- The ids in both consoles must match `HINTS_BY_PRODUCT` exactly. A mismatch is
  silent: `fetchProducts` just omits the unknown sku, the tile keeps rendering
  from the cached price, and the CTA sits disabled on "Connecting to the store".
- Run the validator before data entry, so a copy edit that busts a character
  limit is caught here and not in a console form.

---

## 3. App Store Connect

Per product (3 times):

1. **My Apps → Facts a Day → Monetization → In-App Purchases → +**
2. Type **Consumable**. Reference Name and Product ID from the table above.
   The reference name is internal only and never shown to users.
3. **Availability:** all countries and regions.
4. **Price schedule:** base territory **United States**, price point
   **$0.99 / $1.99 / $2.99**. Let App Store Connect auto-generate the other
   territories from the base price. No start or end date.
5. **Localizations:** add all 8, using the display name and description from
   `iap.json`. ASC locale codes:

   | App locale | ASC locale | Display name (20-pack) |
   |---|---|---|
   | en | `en-US` | 20 Trivia Hints |
   | de | `de-DE` | 20 Quiz-Hinweise |
   | es | `es-MX` | 20 pistas de trivia |
   | fr | `fr-FR` | 20 indices de quiz |
   | ja | `ja` | トリビアヒント20個 |
   | ko | `ko` | 트리비아 힌트 20개 |
   | tr | `tr` | 20 Trivia İpucu |
   | zh | `zh-Hans` | 20 条问答提示 |

   Limits: display name 30 characters, description 45 characters. The English
   descriptions sit at 44, so any edit needs a re-run of the validator.
6. **App Store Review Information:** attach the review screenshot (section 5)
   and paste the `reviewNote` from `iap.json`. The note spells out the exact
   navigation path, which is what prevents a "we were unable to locate the
   in-app purchase" rejection.
7. **Tax category:** App Store Software (the default for digital content).
   Family Sharing does not apply to consumables.
8. State becomes **Ready to Submit**. Because the app already has approved
   in-app purchases (the subscriptions), these three can be submitted on their
   own from the IAP list. They do not need to ride along with an app version.

---

## 4. Google Play Console

The legacy `inappproducts` API is retired for this account (it answers
`403 Please migrate to the new publishing API`), so the uploader uses the
one-time products API instead:

| Step | Call |
|---|---|
| USD to every region | `POST /applications/{pkg}/pricing:convertRegionPrices` |
| Create or update | `PATCH /applications/{pkg}/onetimeproducts/{id}?allowMissing=true` |
| Activate | `POST /.../oneTimeProducts/{id}/purchaseOptions:batchUpdateStates` |

Two things that API insists on. `regionsVersion.version` is a required query
parameter on every upsert (currently `2025/03`, and any `convertRegionPrices`
response reports the live value). And a PATCH that carries `purchaseOptions`
must repeat *every* existing purchase option or it fails with "Product must
list all of its existing purchase options", which is why the uploader updates
only `listings` on a product that already exists and leaves pricing untouched.

By hand instead, per product:

1. **Monetize → Products → In-app products → Create product**
   (labelled "One-time products" in the newer console layout).
2. **Product ID** from the table. Permanent, and permanently burned if deleted.
3. **Name** and **Description** in the default language `en-US`, then
   **Add translations** for the other 7. Play locale codes:

   | App locale | Play locale |
   |---|---|
   | en | `en-US` |
   | de | `de-DE` |
   | es | `es-419` |
   | fr | `fr-FR` |
   | ja | `ja-JP` |
   | ko | `ko-KR` |
   | tr | `tr-TR` |
   | zh | `zh-CN` |

   Limits: name 55 characters, description 200 characters. Play descriptions
   are longer than the iOS ones on purpose, so they carry the "never expire"
   line as well.
4. **Price:** set USD 0.99 / 1.99 / 2.99, then let Play convert to all other
   markets. Spot-check JPY, KRW and TRY afterwards, since those have no minor
   units and round differently.
5. **Activate** the product. An inactive product is invisible to the app.
6. There is no consumable checkbox on Play. Repurchase works only because the
   app consumes the purchase (`finishTransaction({ isConsumable: true })` in
   `PremiumContext`). If that ever regressed, a user could buy each pack once
   and then be blocked with "You already own this item".
7. **License testing:** Play Console → Setup → License testing, add the tester
   Gmail accounts. Test purchases are free and refund automatically. The tester
   must install the app from a track (internal testing is enough); a sideloaded
   debug build returns no products.

---

## 5. Review screenshot (required by Apple)

Apple requires one screenshot per in-app purchase. The hint store sheet shows
all three packs, so the same image is attached to all three products (the
uploader does this when the file at `ios.reviewScreenshot` exists).

**Dimensions are validated, and the failure is asynchronous.** The upload
returns 201 and then the asset lands in `assetDeliveryState.state = FAILED`
with `IMAGE_INCORRECT_DIMENSIONS` a few seconds later, so a successful-looking
run can still leave the product in `MISSING_METADATA`. It has to be a real
device screenshot size; 1206x2622 (iPhone 16 Pro) is what this app uses. A
rejected asset also occupies the slot and blocks a replacement, so the uploader
deletes a non-`COMPLETE` asset before retrying.

```bash
# Boot the sim and install a build first, then:
maestro --device <udid> test .maestro/flows/hint-store.yaml \
  -e OUTPUT_DIR=marketing/output/iap/ios
# → marketing/output/iap/ios/hint_store_review.png
```

The flow deep-links to `factsaday://hint-store`, waits for the
`hint-store-sheet` testID, and asserts the CTA is present before shooting, so a
"---" placeholder price cannot end up in the submitted image.

Capture it from a **TestFlight or release-config build**, not a dev build: in
`__DEV__` the hint store renders mock prices and purchases are faked by
`devGrantHints`, so a dev build never proves the console setup is right.

---

## 6. QA checklist (run before submitting)

**iOS sandbox:** sign into a Sandbox Apple ID under Settings → App Store →
Sandbox Account, then install a TestFlight build.

**Android:** license tester account, app installed from the internal testing
track.

| Check | Expected |
|---|---|
| Open hint store | Three tiles with real localized prices, not `---` |
| Buy the 20 pack | Native payment sheet, then balance rises by 20 |
| After purchase | Balance row turns gold with "Hints added!" and a success haptic |
| Use a hint in a game | Balance drops by 1, clue is revealed |
| Buy the same pack again | Purchase succeeds (proves the consumable finish) |
| Kill the app mid-purchase, relaunch | Credited exactly once (txn-id dedup) |
| Airplane mode | Tiles render from cache, CTA disabled, "Connecting to the store" |
| iOS reinstall | Balance survives (Keychain) |
| Android reinstall | Balance is lost (accepted trade-off, SecureStore is cleared) |
| Non-English device | Store sheet and the payment sheet both localized |

---

## 7. Code touchpoints

| Concern | File |
|---|---|
| Product ids, hint counts, kill switch (`ENABLED`) | `src/config/app.ts` |
| Product fetch, prices, purchase kickoff | `src/hooks/useHintPurchase.ts` |
| Credit then finish as consumable | `src/contexts/PremiumContext.tsx` |
| On-device balance, idempotent credit | `src/services/hintWallet.ts` |
| Price cache for instant render | `src/services/purchases.ts` |
| Store sheet UI | `app/hint-store.tsx` |
| Listing copy and this runbook's data | `marketing/config/iap.json` |

Adding a fourth pack later is a console change plus a `HINTS_BY_PRODUCT` edit.
That map is plain JS, so it ships over OTA and does not need a native rebuild.

---

## 8. Traps

- Renaming a pack is fine (names and descriptions are editable forever), but
  changing the *id* means creating a new product and burning the old one.
- Apple rejects IAP names and descriptions that mention price, discounts or the
  word "free". The BEST VALUE badge lives in the app UI only, never in the
  listing. The validator flags this wording in all 8 languages.
- Both stores need the listing in the default locale (`en-US`, and `es-419` for
  the Play Spanish fallback) or the localized entries will not save.
- Play returns no products at all until the app is published on some track with
  the same package name and signing key, which reads exactly like a broken
  integration.

---

## 9. Submission is gated on a build, not on the metadata

The uploader stops at `READY_TO_SUBMIT` on purpose. App Review opens the app
and follows the review note to find the purchase, so an in-app purchase can
only be submitted alongside (or after) a build that actually contains the hint
store.

The hint store landed on 2026-07-03. App Store version 1.3.4, live since
2026-06-27, predates it. So the three products must be submitted **with the
next app version**, not on their own, or they come back as "we were unable to
locate the in-app purchases".

In App Store Connect that means adding them to the version under
**In-App Purchases and Subscriptions** on the version page before submitting.
Play has no equivalent gate: its products are already active and will resolve
as soon as a build containing the hint store reaches a track.
