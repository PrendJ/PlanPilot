# Changelog

## 1.2 — Adaptive color policy

- Made color explicitly adaptive rather than a mandatory part of the Draft family identity.
- Added palette authority: existing project palette → agreed brand/product palette → context-derived palette → Draft fallback.
- Prevented reference blue/cyan/yellow/pink and warm neutral themes from being treated as mandatory product colors.
- Reframed `assets/brand/colors.md` as an adaptation policy plus fallback reference palette.
- Updated UI system, integration map and implementation checklist to preserve existing product color identity.
- Marked CSS color tokens as reference/demo defaults rather than production requirements.

## 1.1 — Sharper DraftApps geometry

- Made `0px` the default radius for structural panels, cards, nav chrome, table frames, ordinary buttons and form inputs.
- Reduced exceptional softening tokens to `2–6px`.
- Kept `999px` only for semantically capsule-like controls such as filters, chips, switches and status dots.
- Updated component rules, CSS tokens, reference CSS and implementation checklist.
- Removed the v1.0 PNG previews because they depicted the superseded softer-radius geometry; the HTML examples are now the canonical visual reference.

## 1.0

- Initial Draft UI Language package.
