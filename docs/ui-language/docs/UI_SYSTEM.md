# UI System — Draft UI Language

## 1. Visual direction

The product family should feel **precise, editorial and recognizably technical**, without looking like a generic SaaS template.

The visual signature comes from the combination of:
- deliberate surface hierarchy that works with the product's own palette;
- strong, readable display typography;
- compact monospace labels for metadata/state;
- 1px structural borders;
- accent colors used intentionally rather than decoratively;
- selective glassmorphism in navigation/overlays;
- square structural geometry, with radius used only where the control semantics justify it;
- controlled asymmetry;
- motion that explains state.

### Identity sentence

> **Designed like a tool. Framed like an editorial object. Allowed one strange detail.**

---

## 2. Core principles

### Precision before decoration
Layout, hierarchy and states must work without decorative effects.

### Contrast is structural
Use contrast to identify:
- primary vs secondary;
- content vs chrome;
- action vs metadata;
- selected vs unselected;
- stable vs transient.

Do not add accent colors merely to “make it pop”.

### One memorable detail
A screen may contain one unusual interaction or visual signature.
Not every component should compete for attention.

### Dark and light are equal
Both themes are intentional designs, not automatic inversions.

### Character lives at the edges
Use personality in:
- headings;
- labels;
- dividers;
- accent rails;
- hover/focus behavior;
- empty states;
- transitions.

Keep dense operational content calm.

---

## 3. Expression modes

### Utility
Use for high-density/productivity screens.

Rules:
- one accent family;
- no decorative gradients;
- no rotated layout;
- glass only in app chrome/overlay;
- standard panels;
- motion limited to state transitions;
- page title usually `display-md` or smaller.

### Signature — default
Use for most product screens.

Adds:
- monospace eyebrow above key headings;
- signal rail on selected/important panels;
- optional offset accent shadow on hero/empty-state panels;
- bolder page headers;
- richer selected/hover states;
- one distinctive interaction per page at most.

### Showcase
Use only when the screen is primarily explanatory/promotional/experimental.

May add:
- oversized display headings;
- asymmetric section composition;
- multiple accents;
- richer live previews;
- full-bleed color bands.

Operational tables/forms inside Showcase surfaces must still use Utility component rules.

---

## 4. Layout

### Grid
Desktop foundation: 12 columns.
Tablet: 8 columns.
Mobile: 4 columns.

Use real layout flow.
Never use `translate()` to create normal document structure.

### Shell widths

| Token | Value | Use |
|---|---:|---|
| `--layout-content` | 1180px | default content width |
| `--layout-wide` | 1440px | data-heavy / wide layouts |
| `--layout-reading` | 720px | prose / long descriptions |
| `--layout-sidebar` | 248px | standard desktop navigation |

### Gutters
- desktop: 32px;
- tablet: 24px;
- mobile: 16px;
- dense embedded panel: 12–16px.

### Spacing scale
Use 4px foundation.

`4, 8, 12, 16, 24, 32, 48, 64, 96`

Avoid arbitrary spacing unless solving a specific alignment issue.

---

## 5. Geometry

### Radius

DraftApps uses a deliberately sharp geometry. **Structural surfaces are square by default.**

| Token | Value | Use |
|---|---:|---|
| `--radius-structural` | 0px | panels, cards, tables, nav chrome, standard buttons/inputs |
| `--radius-xs` | 2px | tiny indicators / compact affordances |
| `--radius-sm` | 4px | compact overlays, menus, exceptional soft controls |
| `--radius-md` | 4px | modal / feature surface only when a slight softening helps hierarchy |
| `--radius-lg` | 6px | rare showcase surface; not a product default |
| `--radius-pill` | 999px | filters, chips, switches, status dots only |

Rules:
- default panels/cards: `0px`;
- ordinary buttons and inputs: `0px` unless a platform affordance specifically benefits from `2px`;
- avoid `8px+` radii in operational UI;
- never round a component merely to make it feel "friendly";
- circular and pill geometry is semantic, not decorative.

### Borders
Default:
- 1px;
- subtle;
- structural.

Selected/important surfaces may use:
- a 2–3px **signal rail** on one edge;
- an offset accent shadow of 4–6px only for special objects.

### Signature edge
Preferred distinctive treatment:

```text
┌─────────────────────────────┐
│ ACCENT RAIL                 │
│ content                     │
└─────────────────────────────┘
```

Use a short top/left colored rail rather than gradients or heavy glow.

---

## 6. Surfaces

### Background
Use the target product's background/theme token. Preserve an existing dark/light character rather than replacing it with the reference palette.

### Panel
Slight contrast from background; no large shadow by default.

### Raised
Used for menus, popovers, modals.

### Glass
Use only for:
- top navigation;
- floating toolbars;
- command palette;
- sticky contextual controls;
- overlay chrome.

Glass recipe:
- translucent semantic surface;
- 14–18px backdrop blur;
- 1px border;
- low shadow;
- sufficient opaque fallback.

Do not make all cards glass.

---

## 7. Typography

See `assets/brand/typography.md`.

Key rule:
**bold does not mean compressed.**

Display text should never use tracking tighter than roughly `-0.045em`.

---

## 8. Color

See `assets/brand/colors.md`.

**Color is adaptive, not prescriptive.** The target product's existing or explicitly agreed palette has priority over the Draft reference colors.

Default product behavior:
- Primary interaction = the product's primary interactive token.
- Information/live/system signals = a suitable product semantic/accent token.
- Attention/highlight = a distinct but restrained product token, not automatically the warning color.
- Expressive emphasis = optional and palette-dependent.
- Functional success/warning/error use dedicated semantic roles.

Never replace an established palette simply to match the reference examples. Never use brand accent colors as status colors without semantic mapping.

---

## 9. Page anatomy

Default product page:

1. App chrome
2. Page eyebrow / context
3. Page title + primary action
4. Optional summary/status row
5. Main content
6. Secondary contextual panel
7. Feedback / toast layer

Recommended page heading:

```text
WORKSPACE / ACTIVE PROJECT
Forecast review                       [Create scenario]
Compare actuals, budget and outlook.
```

Eyebrow is optional in Utility mode and expected in Signature mode.

---

## 10. App chrome

### Desktop
Preferred:
- sidebar or top navigation depending product;
- sticky utility bar;
- subtle glass where useful;
- product name + current context;
- one clear primary action zone.

### Mobile
Do not compress desktop chrome indefinitely.
Use:
- compact top bar;
- drawer / bottom navigation only when information architecture requires it;
- contextual actions inside the page.

Decorative elements are the first thing to remove on small screens.

---

## 11. Cards and panels

Panels should represent real information structure, not serve as a default wrapper for every text block.

Default panel:
- 1px border;
- `radius-structural`;
- 16–24px padding;
- no shadow;
- clear header/body separation when needed.

Use accent rail for:
- active panel;
- priority item;
- special AI/system insight;
- empty-state callout.

Avoid “bento dashboard” composition unless the information model genuinely benefits.

---

## 12. Tables

Tables are first-class product UI.

Rules:
- header visually quiet but distinct;
- minimum row height 44px;
- numeric columns right-aligned;
- monospace allowed for IDs, timestamps and dense numeric data;
- selected row uses surface + signal rail, not full saturated fill;
- sticky header for long data;
- horizontal scrolling contained inside table region;
- no hidden essential columns without alternate mobile access.

For mobile:
- either horizontal contained table;
- or intentionally designed record cards.
Do not auto-convert every table into cards without product justification.

---

## 13. Forms

Labels are visible by default.
Placeholder is example/input hint, not label.

Control height:
- default 44px;
- compact 36px only in dense desktop tables/toolbars.

Error:
- clear text;
- semantic error color;
- explain resolution when possible.

Form grouping:
- group related fields;
- use section headings instead of card-per-field;
- primary submit aligned consistently.

---

## 14. Filters and navigation states

Pills are allowed for:
- filters;
- tags;
- status chips;
- small segmented controls.

Pills are not the default shape for:
- navigation;
- every button;
- cards.

Selected filter must have:
- fill or strong border;
- textual/icon indicator where useful;
- `aria-pressed` or equivalent state.

---

## 15. Empty/loading/error states

Empty state should contain:
- precise title;
- one-sentence explanation;
- primary next action;
- optional quiet personality line.

Preferred visual:
- technical glyph;
- line motif;
- data-shaped placeholder;
- signal rail.

Avoid generic abstract blob illustrations.

Loading:
- skeleton for structured content;
- inline progress for actions;
- spinner only when shape cannot be predicted.

---

## 16. Data visualization

Use the product palette sparingly.

Default series strategy:
1. start with the product's primary accent;
2. add compatible secondary accents already present in the product;
3. add neutral or newly derived companion colors only when more series require them;
4. use the Draft reference chart sequence only as a fallback when no product palette exists.

Rules:
- grid lines subtle;
- labels readable;
- never rely only on color;
- use markers/dashes/labels for accessibility;
- no gratuitous gradients;
- highlight one series, mute the rest when focus is required.

---

## 17. Iconography

Use one icon family per project.

Preferred:
- outline icons;
- consistent 1.5–2px stroke;
- 20px standard;
- 16px compact;
- 24px primary action / empty state.

Do not mix emoji with product icons except in deliberately playful content.

---

## 18. Do not do

- No universal bento-grid aesthetic.
- Structural panels are square by default; no soft-card geometry as a generic styling layer.
- No gradient-filled primary buttons by default.
- No excessive glass.
- No ultra-tight display tracking.
- No decorative circles/blobs behind mobile text.
- No random card rotations in operational UI.
- No hover-only essential actions.
- No cursor gimmicks in tools.
- No motion without state meaning.
- No accent colors used as decoration on every panel.
- No huge hero typography inside dense workflow screens.
