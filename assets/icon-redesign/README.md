# Facts a Day — iOS 26 (Liquid Glass) app icon

Keeps the **lightbulb + calendar + glow**, rebuilt as **flat layers** so iOS 26 renders the
glass, glow, and shadows live in Icon Composer. The old `assets/icon.png` baked the glow, the
rim light, the shadow, and the background into one PNG, which now renders muddy because the
system adds its *own* specular and glow on top.

## The one rule

Source art stays **flat, opaque, and distilled to the shape**. Glass / glow / shadow are
*properties you tune in Icon Composer*, never painted into the pixels.

## Files

| File | Role |
|---|---|
| `layers/1-bulb.svg` | Group 1 (bottom). Bulb outline + screw base. Flat `#1F8BFF`. |
| `layers/2-calendar-card.svg` | Group 2. White calendar card `#FFFFFF`. |
| `layers/3-calendar-header.svg` | Group 3. Orange header band `#FF7A00` (separate so dark/mono swap cleanly). |
| `layers/4-calendar-dots.svg` | Group 4 (top). Date dots + hanging tabs, flat `#1F8BFF`. |
| `background-reference.svg` | NOT a layer. Navy values to set on the Composer canvas (solid `#0B244F` or the radial gradient). |
| `layers/flat-composite.png` | Preview of the 4 flat layers on navy = the raw Composer input. |
| `composed-default.png` | Target look, Default appearance (glow vibe). |
| `composed-dark.png` | Target look, Dark appearance. |
| `composed-tinted.png` | Target look, Mono/Tinted. Note: orange drops to gray, shapes carry it. |
| `layers/optional-glow.png` | Only if you insist on a literal baked halo (last resort, see below). |

4 groups = Apple's max. Background is the canvas, not a 5th layer.

## Specs (verified)

- Canvas **1024×1024**, exactly square. SVG layers preferred. Export at full canvas size.
- 1–4 groups. Filenames numbered `1-`, `2-` so Composer orders them by Z (bottom→top).
- Foreground layers have a transparent canvas (no fill behind the shape).
- System auto-applies: the squircle mask, every size, the glass material, specular, refraction,
  translucency, blur, shadows, and the Clear + Tinted variants. Do not bake any of these.

## The glow

Do **not** ship a baked glow layer. Recreate it dynamically in Icon Composer:
1. Leave Liquid Glass on for the bulb group (on by default). Its specular + translucency already
   reads as lit glass.
2. Set the bulb/calendar group's shadow to **Chromatic** for Default. The art's color spills onto
   the background = the glow bleed you want, live and correct on any wallpaper.
3. Use **Neutral** shadow for Dark and Mono (chromatic looks dirty there).
4. If a hard halo is still required after that, place `layers/optional-glow.png` as a low-opacity
   PNG layer behind the bulb. This is the documented PNG-for-soft-raster exception; try dynamic first.

## Appearances (author 3, system derives the other 4)

| Authored | Fills |
|---|---|
| **Default** | Bulb `#1F8BFF`, card `#FFFFFF`, header `#FF7A00`, dots `#1F8BFF`. Bg navy. Chromatic shadow. |
| **Dark** | Lighten bulb to ~`#4FA8FF` so it survives black, keep card near-white, keep header from going muddy. Neutral shadow. Mostly single-fill swaps because colors are separate layers. |
| **Mono** | Bulb → **pure white** (most recognizable element). Card/header/dots → tones of gray, tuned by hand so the calendar stays legible. Glow here is system specular only. |

Clear Light/Dark + Tinted Light/Dark are generated. Keep the silhouette identical across all.

## Ship it (Expo SDK 54+)

1. Build the `.icon` in **Icon Composer** (ships with Xcode 26, needs macOS Tahoe 26.4+). Import
   the 4 SVGs, set the navy background on the canvas, tune glass/shadow per appearance, save as
   `app.icon` into this folder.
2. Point Expo at it:
   ```jsonc
   // app.json
   { "ios": { "icon": "./assets/icon-redesign/app.icon" } }
   ```
   Keep the top-level `"icon": "./assets/icon.png"` (1024²) as the universal base; it also feeds Android.
3. `npx expo prebuild --clean -p ios` then rebuild. **This is a native rebuild**, not an OTA/JS update.
4. Build on **Xcode 26.4.1**. Xcode **26.5** has an `actool` crash compiling `ios.icon`
   (`attempt to insert nil object`, Apple regression FB20183399 / expo#46121). Not an Expo bug.
5. The Expo CLI prints a cosmetic validation warning for a `.icon`; it does not block the build.
6. iOS ≤ 19 auto-derives a fallback from the `.icon`, so one file ships safely to older devices.

Sources: WWDC25 "Create icons with Icon Composer" (developer.apple.com/videos/play/wwdc2025/220/),
Apple HIG App Icons, Expo splash-screen-and-app-icon docs.
