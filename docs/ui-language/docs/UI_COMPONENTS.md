# UI Components

This document defines visual behavior, not framework-specific implementation.

## Buttons

### Primary
Use for the single strongest action in a region.

- height: 44px;
- radius: 0px by default; 2px only when a compact platform affordance benefits from slight softening;
- background: primary accent;
- foreground: high-contrast;
- weight: 700;
- no gradient;
- optional 2px/4px accent offset only in Signature/Showcase special CTAs.

### Secondary
- neutral surface;
- 1px border;
- same geometry as primary.

### Ghost
For low-priority toolbar/navigation actions.

### Destructive
Use semantic danger, never brand pink.

### Icon button
- 44×44 default;
- 36×36 compact desktop only;
- tooltip/aria label required when icon-only.

---

## Inputs

Default:
- 44px min height;
- 0px radius by default;
- 1px border;
- visible label;
- clear focus ring;
- muted placeholder.

States:
- hover;
- focus;
- filled;
- disabled;
- error;
- success only when meaningful.

Do not rely on border color alone for error.

---

## Select / combobox

Prefer searchable combobox when option set is large.
Menus use raised surface + 1px border + subtle shadow.

Selected item:
- checkmark or icon;
- optional signal rail.

---

## Filters

Pill shape is allowed because filters are semantically capsule-like.

Default:
- neutral border;
- compact label.

Selected:
- filled or strong contrast;
- optional checkmark;
- `aria-pressed=true`.

Do not use pill shape for unrelated controls merely for consistency. Do not round ordinary buttons, fields, cards or table containers to match filter chips.

---

## Tabs

Default tabs are **not pills**.

Use:
- text label;
- bottom indicator or signal rail;
- clear active contrast.

Pill tabs allowed only for 2–4 lightweight view modes.

---

## Panel

Default:
- surface;
- 1px border;
- radius 0px;
- 16–24px padding;
- no shadow.

Variants:
- `active`: signal rail;
- `raised`: surface-raised + subtle shadow;
- `special`: accent offset shadow;
- `flat`: no outer panel, divider-based grouping.

---

## Stat

A stat is not automatically a card.

Recommended:
```text
ACTIVE USERS
12,481
+8.2% vs last month
```

Use a panel only if the statistic needs grouping/action/context.

---

## Table

Header:
- 12px/13px UI or mono where appropriate;
- muted;
- sticky when useful.

Rows:
- min 44px;
- clear hover;
- selected uses surface and rail;
- row actions visible on focus as well as hover.

Numbers:
- tabular numerals;
- right-align.

---

## Badge / status

Statuses use semantic mapping.
Tags use neutral/accent styling.

Do not make every metadata item a badge.

---

## Alert

Structure:
- icon;
- title;
- supporting text;
- optional action.

Use semantic color as a rail/icon/soft surface, not an aggressive full fill except for critical alerts.

---

## Toast

- raised surface;
- concise;
- anchored consistently;
- auto-dismiss only for low-risk confirmation;
- persistent for failures requiring user action.

---

## Modal

- clear title;
- max readable width;
- primary action on predictable side;
- destructive action separated;
- escape closes when safe;
- focus trapped;
- background overlay not overly opaque.

---

## Drawer

Use for:
- contextual details;
- filters;
- secondary editing.

Do not use a drawer for a task that requires full-page concentration.

---

## Empty state

Signature pattern:
- mono eyebrow;
- strong but not huge title;
- short explanation;
- one action;
- technical visual/glyph;
- optional dry microcopy.

Example:

```text
NO DATA / YET
Nothing to compare.
Add the first scenario and this space will become much less existential.

[Create scenario]
```

The humorous line is optional and never replaces the useful explanation.

---

## AI / automated insight block

Use a distinctive but restrained treatment:
- cyan or primary signal rail;
- `SYSTEM / AI` eyebrow;
- explicit confidence/source when relevant;
- actions separated from generated text;
- never style generated content as unquestionably authoritative.

---

## Navigation shell

Default Signature product:
- fixed/sticky chrome;
- subtle glass;
- product/brand name;
- current context;
- main navigation;
- utility controls.

Glass belongs here more than inside content panels.

---

## Search / command palette

Command palette is a natural high-expression component:
- glass/raised surface;
- strong keyboard focus;
- monospace shortcuts;
- calm content rows;
- primary accent selection.
