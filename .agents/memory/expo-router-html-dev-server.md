---
name: Expo Router +html.tsx not applied in dev server
description: Custom head tags in app/+html.tsx only appear in static export builds, not in `expo start` dev server output
---

`app/+html.tsx` (Expo Router's root HTML customization file — meta tags, `<head>` content, `ScrollViewStyleReset`, etc.) is only injected during static export/production builds. The Metro dev server used by `expo start` (the `dev` script / dev workflow) serves a bare default HTML shell and ignores `+html.tsx` entirely.

**Why:** Confirmed by curling the dev server's root HTML directly — it lacked a `<meta name="format-detection">` tag that was present in `+html.tsx`, which is why an iOS Safari data-detector bug (numbers/text turning into tap-to-open Maps/Calendar links) kept recurring in dev/preview even though the meta tag had already been "fixed" in `+html.tsx`.

**How to apply:** For any `<head>`-level fix (meta tags, global `<style>` injection, fonts, etc.) that must also work while iterating in the dev preview — not just in exported/published builds — duplicate the fix as a runtime `document.head.appendChild(...)` call gated on `Platform.OS === "web" && typeof document !== "undefined"` in `app/_layout.tsx` (there's already a pattern there for injecting `<style>` and font-face rules). Keep the `+html.tsx` version too for production/static export correctness.
