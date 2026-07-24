---
name: Transparent animated mascot in Expo (web + native)
description: How to ship a transparent looping animation that works in Expo web (mobile Safari) AND native; why video fails and the flood-fill + animated WebP pipeline.
---

# Transparent animated character in Expo (web + native)

**Rule:** For a transparent, looping character/mascot animation that must work in the Expo **web** build (the user often views via mobile Safari at `*.expo.picard.replit.dev`) AND native, use an **animated WebP rendered through `expo-image`** (`<Image autoplay contentFit="contain" />`). Do **not** use `expo-av` `Video`.

**Why:**
- Transparent video has no cross-platform format. HEVC-with-alpha plays only in iOS Safari; WebM/VP9-alpha plays only in Chromium. A single video file can't cover both.
- `expo-av` `Video` gated on `Platform.OS !== "web"` means the web build (what the user actually sees in their phone browser) never renders the video at all — it silently shows the fallback. Easy to miss.
- A "playable but opaque" video is indistinguishable from a transparent one to an `onError` fallback — the fallback won't fire, you just get a white box. Don't rely on `onError` to detect missing transparency.
- Animated WebP supports full alpha and is rendered by `expo-image` on every platform (on web it's a plain `<img>`, natively supported incl. iOS Safari 14+).

**Don't trust filenames for transparency.** A file from "PicsArt BackgroundRemover" (`.mov`, HEVC) was fully **opaque** with a baked white background (alpha 255 everywhere, corners RGB 252,252,252). Always verify: `magick identify -verbose "f.webp[0]" | grep -i alpha` should say `TrueColorAlpha`; sample a corner pixel's alpha.

## Pipeline to make a solid-background cartoon transparent
The subject (a snow-leopard mascot) is **white-furred on a near-white background**, so naive chroma-key / `-transparent white` punches holes in the fur. The art is a **cartoon with dark outlines**, so use connectivity-based flood-fill instead:

1. Extract frames: `ffmpeg -i src -vsync 0 frames/f_%04d.png`
2. Flood-fill bg → transparent per frame (add a 1px white border so one flood from a corner clears all edges; fuzz catches anti-aliased halo). Parallelize with `xargs -P`:
   `magick f.png -alpha set -bordercolor white -border 1 -fuzz 18% -fill none -draw "alpha 0,0 floodfill" -shave 1x1 out.png`
   Flood-fill stops at the dark outline, so interior white fur is preserved.
3. Assemble animated WebP with **ffmpeg** (ImageMagick `-define webp:method=6` OOM-killed on ~100 frames):
   `ffmpeg -framerate 25 -i out/f_%04d.png -c:v libwebp_anim -lossless 0 -q:v 78 -loop 0 -an mascot.webp`

**Gotcha:** this env's `ffmpeg`/`ffprobe` **cannot decode** animated WebP ("image data not found"). Verify frame count/alpha with **ImageMagick** instead (`magick identify mascot.webp | wc -l`, `magick "mascot.webp[N]" out.png`). ~100 frames ≈ 1.6 MB; fine for a one-time onboarding.

**Aspect-ratio gotcha:** size the `<Image>`/box to the asset's **true ratio** with `contentFit="contain"`, else it letterboxes into a tall box and renders tiny. Check dims with `magick identify` before hardcoding a ratio.

## Make the subject fill the frame (perceived "bigger" + "higher quality")
A background-removed frame often has the subject surrounded by huge transparent padding. On screen the box scales to the *padded* frame, so the subject looks small and the padding wastes resolution — reads as "low quality / too small." Fix by **cropping every frame to the content bbox** before encoding:
- Find a generous bbox covering the subject across all frames (sample a few `magick identify -format "%@"` / trim previews), pad it a little, then `magick in.png -crop WxH+X+Y +repage out.png` on every frame (parallel `xargs -P`).
- Re-encode the cropped frames. Result: same display box now shows the subject edge-to-edge → much bigger and crisper at the same on-screen size, no source upscaling needed.
- Quality also improves by bumping `-q:v` (e.g. 78 → 88) and **speed** by raising `-framerate` (25 → 33). A ~100-frame cropped q88 WebP ≈ 2.2 MB — fine for one-time onboarding.

## Web flicker / color-flash fix: render a raw `<img>`, not `expo-image`
**Symptom:** on the Expo **web** build, an animated WebP shown via `expo-image` flashes/loses its colors+pattern for a fraction of a second (a spinner appears) — often **each loop**, because expo-image re-enters its loading state.
**Fix:** in a shared component, branch on `Platform.OS === "web"` and render a plain DOM image:
`React.createElement("img", { src: Asset.fromModule(require("...webp")).uri, style: {...} })` (from `expo-asset`). The browser loops the WebP natively with no loading-state flash. Keep `expo-image` (with `autoplay`) on **native**, and fall back to the static PNG (`AnimatedMascotImage`) on error.
**Do NOT use `RNImage.resolveAssetSource`** to get the URI — react-native-web does **not** expose it (`Image.default.resolveAssetSource is not a function`, uncaught at runtime, crashes the screen). Use `expo-asset` `Asset.fromModule(require(...)).uri` instead — works on web and native.
**Layout note:** when the mascot is intentionally much larger than the text, don't give the wrapping `content` View a fixed width — let it size to the (large) mascot, center it, and constrain the text card/bubble/button to their own `cardW` instead. APNG was rejected as an alternative (8–16 MB).
