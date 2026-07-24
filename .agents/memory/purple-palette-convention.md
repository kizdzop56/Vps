---
name: Purple-only color palette convention
description: How off-palette colors (green/orange/red/cyan) were mapped to purple-family tones app-wide; use this mapping for any new UI colors.
---

The user wants the whole app restricted to a purple/violet/indigo/pink family, with real green/orange/red/cyan/etc. removed. Only exception: leaderboard/rating medals may use true gold/silver/bronze, rendered as metallic gradients (multi-stop LinearGradient, not flat fill), not flat colors.

**Mapping used (apply to any new colors so the app stays consistent):**
- Green (success) → indigo `#6366f1` (mid), `#4338ca`/`#3730a3` (dark), `#e0e7ff`/`#eef2ff` (light bg)
- Orange/amber (warning) → pink `#ec4899` (mid), `#9d174d` (dark), `#fce7f3` (light bg)
- Cyan/blue (info) → indigo, same as green mapping
- Red (danger/error) → rose `#e11d48` (mid), `#be123c`/`#881337` (dark), `#fff1f2`/`#ffe4e6` (light bg)
- Achievement/badge accent colors were diversified across violet `#8b5cf6`, purple `#a855f7`, fuchsia `#c026d3`/`#d946ef`, indigo `#6366f1`/`#4f46e5`, deep purple `#9333ea`, rose `#db2777` — for visual variety while staying in-gamut.
- Central theme tokens live in `constants/colors.ts` (success/warning/destructive/accent/role colors/assignment-type colors) — update these first since many screens read from `useColors()`, but most screens in this app also hardcode raw hex literals directly in JSX, so a global hex-value find/replace across `app/` and `components/` was still required.

**Why:** user explicitly asked to remove all colors that "stand out" from the purple theme, keeping only metal tones for medals — this is a strong standing visual constraint for the whole app going forward, not a one-off screen tweak.

**How to apply:** when adding any new color to this app, pick from the mapped tones above (or an adjacent violet/indigo/rose/fuchsia hue) instead of green/orange/red/cyan/yellow. For leaderboard/medal ranks, always use a multi-stop gradient (light highlight → mid → dark shadow) to look like real metal, never a flat fill.

**Second exception:** online/offline user-status dots and badges must stay true green (`#22c55e` dot, `#dcfce7` bg, `#15803d`/`#16a34a` text) for online and gray (`#94a3b8`) for offline — these were mistakenly swept into purple during the palette pass and had to be reverted. Status semantics (online=go/green) override the palette rule here.
