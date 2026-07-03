# Hint packs — store product setup (App Store Connect + Play Console)

Creates the three **consumable** products for the trivia hint packs feature (commits `409838e`, `ccf0669`, `bc77b91`). Product IDs must match `HINT_PACKS.HINTS_BY_PRODUCT` in `src/config/app.ts` exactly — the app maps id → hint count from that config and takes all prices from the store, nothing else is hardcoded.

> Status legend: ☐ to do in the console · ✅ already handled by the app build.

| Product ID | Type | Hints | USD price | Reference name (internal) |
|---|---|---|---|---|
| `factsaday_hints_small` | Consumable | 20 | $0.99 | Hint Pack Small (20) |
| `factsaday_hints_medium` | Consumable | 50 | $1.99 | Hint Pack Medium (50) |
| `factsaday_hints_large` | Consumable | 100 | $2.99 | Hint Pack Large (100) |

Sizing rationale (real sub anchors: weekly $0.69, monthly $1.99): per hint 5.0¢ / 4.0¢ (20% off) / 3.0¢ (40% off) — a flat, genre-normal ladder. Net per hint (Small Business Program 85%) is 2.8x / 2.3x / 1.7x the ~$0.015 rewarded-ad floor. The middle pack deliberately shares the monthly-premium price point ($1.99) so premium reads as the better deal (upsell foil); the top pack is about a month of heavy hint use, giving regulars a roughly monthly repurchase rhythm.

- ✅ App renders its own store sheet (`app/hint-store.tsx`); the console localizations below only surface in the native payment sheet, receipts, and store search.
- ✅ All store UI self-hides until live product prices load, so console setup and the app rollout can happen in either order.
- ✅ Consumables are exempt from the Restore Purchases requirement (nothing to restore once consumed).

---

## 1. App Store Connect

App Store Connect → **Facts a Day** (`6755321394`) → Monetization → **In-App Purchases** → **+**.

Per product:

- ☐ Type: **Consumable** (not non-consumable — repurchase must be allowed).
- ☐ Reference Name + Product ID from the table above. Product ID is immutable after creation — copy-paste it.
- ☐ Price: base country **United States**, tier from the table, and let Apple **automatically generate** all other regional prices.
- ☐ Availability: all countries/regions.
- ☐ Localizations — add all 8 per product, exact strings below (Display Name ≤ 30 chars, Description ≤ 45 chars; every string fits). Markets without one of these localizations automatically fall back to en-US.

**`factsaday_hints_small`**

| ASC locale | Display Name | Description |
|---|---|---|
| en-US | `20 Trivia Hints` | `20 hints that never expire` |
| de-DE | `20 Quiz-Hinweise` | `20 Hinweise, verfallen nie` |
| es-ES | `20 pistas de trivia` | `20 pistas que nunca caducan` |
| fr-FR | `20 indices de quiz` | `20 indices sans expiration` |
| ja | `トリビアヒント20個` | `有効期限のないヒント20個` |
| ko | `트리비아 힌트 20개` | `만료되지 않는 힌트 20개` |
| tr | `20 Trivia İpucu` | `Süresi dolmayan 20 ipucu` |
| zh-Hans | `20 条问答提示` | `20 条永不过期的提示` |

**`factsaday_hints_medium`**

| ASC locale | Display Name | Description |
|---|---|---|
| en-US | `50 Trivia Hints` | `50 hints that never expire` |
| de-DE | `50 Quiz-Hinweise` | `50 Hinweise, verfallen nie` |
| es-ES | `50 pistas de trivia` | `50 pistas que nunca caducan` |
| fr-FR | `50 indices de quiz` | `50 indices sans expiration` |
| ja | `トリビアヒント50個` | `有効期限のないヒント50個` |
| ko | `트리비아 힌트 50개` | `만료되지 않는 힌트 50개` |
| tr | `50 Trivia İpucu` | `Süresi dolmayan 50 ipucu` |
| zh-Hans | `50 条问答提示` | `50 条永不过期的提示` |

**`factsaday_hints_large`**

| ASC locale | Display Name | Description |
|---|---|---|
| en-US | `100 Trivia Hints` | `100 hints that never expire` |
| de-DE | `100 Quiz-Hinweise` | `100 Hinweise, verfallen nie` |
| es-ES | `100 pistas de trivia` | `100 pistas que nunca caducan` |
| fr-FR | `100 indices de quiz` | `100 indices sans expiration` |
| ja | `トリビアヒント100個` | `有効期限のないヒント100個` |
| ko | `트리비아 힌트 100개` | `만료되지 않는 힌트 100개` |
| tr | `100 Trivia İpucu` | `Süresi dolmayan 100 ipucu` |
| zh-Hans | `100 条问答提示` | `100 条永不过期的提示` |

- ☐ Review screenshot: upload `docs/assets/hint-store-review.jpg` (same one for all three products is fine; it's for review only, never shown on the store).
- ☐ Review notes (paste per product):

  > Consumable hint packs for the free Trivia feature. In the app: Trivia tab → "Trivia Hints" row opens the store sheet. During a trivia game, the hint button offers "Get Hints" once the free daily hint and any purchased balance are used. A purchased hint reveals the current question's explanation clue. The hint balance is stored on-device and hints never expire.

- ☐ **Submit each IAP for review.** The app already has approved IAPs (the premium subscriptions), so these can be submitted standalone — no new binary or app version needed. Approval typically lands within a day or two.

## 2. Google Play Console

Play Console → **Facts a Day** (`dev.seyrek.factsaday`) → Monetize → Products → **In-app products** → **Create product**.

Per product:

- ☐ Product ID from the table (immutable — copy-paste).
- ☐ Default language English (US); Name = same display names as ASC (limit 55 chars), Description (limit 200):

  > Adds N hints to your balance. A hint reveals a clue for the current trivia question. Hints never expire and work in every trivia mode.

- ☐ Translations: add the 8 locales — Name = the ASC display names above, Description per locale («N» = 20/50/100, all ≤ 200 chars):

| Play locale | Description |
|---|---|
| en-US | `Adds N hints to your balance. A hint reveals a clue for the current trivia question. Hints never expire and work in every trivia mode.` |
| de-DE | `Fügt deinem Guthaben N Hinweise hinzu. Ein Hinweis zeigt einen Tipp zur aktuellen Quizfrage. Hinweise verfallen nie und gelten in jedem Quiz-Modus.` |
| es-ES | `Añade N pistas a tu saldo. Una pista revela una ayuda para la pregunta actual. Las pistas nunca caducan y sirven en todos los modos de trivia.` |
| fr-FR | `Ajoute N indices à votre solde. Un indice révèle une aide pour la question en cours. Les indices n'expirent jamais et fonctionnent dans tous les modes de quiz.` |
| ja-JP | `ヒントをN個追加します。ヒントは現在のトリビア問題の手がかりを表示します。有効期限はなく、すべてのモードで使えます。` |
| ko-KR | `힌트 N개를 잔액에 추가합니다. 힌트는 현재 문제의 단서를 보여줍니다. 힌트는 만료되지 않으며 모든 트리비아 모드에서 사용할 수 있습니다.` |
| tr-TR | `Bakiyene N ipucu ekler. İpucu, mevcut trivia sorusu için bir açıklama gösterir. İpuçlarının süresi dolmaz ve tüm trivia modlarında geçerlidir.` |
| zh-CN | `为你的余额添加 N 条提示。提示会显示当前问答题的线索。提示永不过期，适用于所有问答模式。` |
- ☐ Price: set USD from the table → **use the auto-converted local prices** (Play rounds per market).
- ☐ **Save → Activate.** No review pass; active within the hour.

## 3. Rollout order

1. ☐ Create + submit products in both consoles (this doc).
2. ☐ Ship the feature to production users via the diff-OTA pipeline (`docs/OTA_RELEASE.md`) — the code is already on `main`; the production binary already contains expo-iap, so **no native rebuild is required**.
3. ☐ Once Apple approves the IAPs, the store UI appears on its own (price fetch succeeds → hub row + Get Hints CTA unhide). Nothing to flip.
4. Kill switch if ever needed: `HINT_PACKS.ENABLED = false` in `src/config/app.ts` + OTA. Already-purchased balances keep working (only purchasing hides).

## 4. Sandbox QA (device, before/after approval)

Apple sandbox works as soon as a product reaches "Ready to Submit"; Play needs the product Active and your account listed under License testing.

- ☐ Buy each pack once with a sandbox account → balance credits exactly, repurchase of the same pack works (consumable finished correctly).
- ☐ Kill the app between the payment sheet confirming and the success state → relaunch → balance credited exactly once (redelivery + txn dedup).
- ☐ Spend order in a game: free daily hint first, then "Use Hint (N)", then "Get Hints" + "Watch Ad".
- ☐ Regression: buy a premium subscription in sandbox → premium flips on, no hint credit.
- ☐ Analytics: `app_hint_store_viewed`, `app_purchase_initiated` (source `hint_store`/`trivia_hub`/`trivia_game`), `app_hint_pack_purchased`, `app_trivia_hint_click` with `source: purchased`.
