# Draft UI Language

A reusable UI identity layer for projects derived from the visual language developed for Draftapps.

This package intentionally contains **UI guidance only**. It does not define:
- product scope;
- architecture;
- APIs;
- persistence;
- deployment;
- security policy;
- analytics;
- domain rules;
- agent workflow.

It is designed to be merged later into an agent-ready project template.

## Goal

All projects should feel like they belong to the same maker without forcing every product to look like the Draftapps portfolio.

The identity is based on:

> **Editorial confidence + technical precision + controlled contrast + one memorable detail.**

**Color is adaptive, not prescriptive.** This package must not replace an existing or already-agreed product palette. The Draft reference palette is a fallback for greenfield/demo work only.

The system keeps the strongest elements of the Draftapps language:
- intentional surface hierarchy in dark/light themes;
- bold readable typography;
- monospace technical metadata;
- disciplined accent usage;
- precise 1px borders;
- square structural geometry, with rounding reserved for semantically rounded controls;
- restrained glassmorphism;
- strong information hierarchy;
- deliberate asymmetry only when useful;
- dry, controlled micro-humor;
- motion tied to state.

It removes the elements that should remain specific to the portfolio:
- deliberately broken grids as a default behavior;
- large decorative orbs on product screens;
- excessive live curiosities;
- playful distortion in operational flows;
- portfolio-style project cards.

## Expression modes

The same tokens/components can be used at three intensities.

### 1. Utility
For admin tools, dashboards, workflows, tables, forms and internal products.

Use:
- product-appropriate neutral surfaces;
- one primary accent from the product palette;
- compact typography;
- almost no decorative movement;
- straight, predictable layout.

### 2. Signature — default
For most Draft-family products.

Use:
- technical eyebrow labels;
- stronger headings;
- one signal color per major region, selected from the product palette;
- selective glass chrome;
- occasional accent rail / offset shadow;
- concise motion;
- one memorable interaction per screen at most.

### 3. Showcase
For demos, marketing surfaces, experimental tools and public launch pages.

Use:
- larger editorial typography;
- more asymmetry;
- multiple accents only when the product palette supports them;
- richer motion;
- project-specific live motifs.

Do not default product UIs to Showcase.

## Package map

- `docs/UI_SYSTEM.md` — master design system.
- `docs/UI_COMPONENTS.md` — component rules.
- `docs/UI_MOTION.md` — motion language.
- `docs/UI_RESPONSIVE.md` — responsive behavior.
- `docs/UI_ACCESSIBILITY.md` — UI accessibility rules.
- `docs/UI_MICROCOPY.md` — interface voice only.
- `assets/brand/colors.md` — adaptive color policy + fallback reference palette.
- `assets/brand/typography.md` — typography system.
- `assets/ui/README.md` — asset/illustration rules.
- `examples/ui/draft-ui-tokens.css` — implementation-ready CSS tokens.
- `examples/ui/draft-ui-reference.css` — reference component styling.
- `examples/ui/reference-product-shell.html` — full product shell example.
- `examples/ui/reference-components.html` — component gallery.
- `examples/ui/UI_IMPLEMENTATION_CHECKLIST.md` — agent/developer checklist.
- `examples/screenshots/README.md` — screenshot note; v1.0 PNGs were removed because they showed the superseded soft-radius geometry. The HTML examples are canonical.

## Integration philosophy

These files should become UI source-of-truth in the target template.

Product-specific needs may extend the system, but should first reuse:
1. the project’s existing semantic color tokens and palette, if present;
2. typography;
3. spacing;
4. geometry;
5. component patterns;
6. motion rules.

### Palette authority
When this package is applied to an existing project, use this order of precedence:
1. existing implemented project palette/tokens;
2. palette explicitly agreed in the product brief or brand system;
3. a palette derived for the product context when no palette exists;
4. the Draft reference colors only as a fallback/demo palette.

Never recolor a product merely to make it resemble the reference examples. A project should only introduce a new visual primitive when the existing language cannot express the requirement cleanly.

## Geometry alignment with DraftApps

The current DraftApps portfolio is intentionally sharper than the first version of this package. Structural surfaces should therefore read as **square by default**. Panels, cards, nav chrome, tables, input frames and ordinary buttons normally use `0px` radius; compact overlays may use `2–4px`. Full pills are reserved for controls whose meaning is genuinely capsule-like: filters, chips, switches and status dots.

This sharper geometry is part of the family identity, not an optional density setting.
