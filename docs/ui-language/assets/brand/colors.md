# Colors — Draft UI Language

## Core rule: color adapts to the product

This package **does not own the target product palette**. Its visual identity must survive a palette change.

When applying Draft UI Language, preserve the project's colors whenever a coherent palette already exists or has been explicitly agreed. Reuse the UI language through hierarchy, geometry, typography, borders, density, component behavior and motion — not by automatically importing DraftApps colors.

## Palette authority

Use this precedence order:

1. **Existing implemented palette/tokens** in the target product.
2. **Explicitly agreed brand or product palette** from the brief/design system.
3. **Product-derived palette** chosen for the tool's purpose, audience and context when no palette exists.
4. **Draft reference palette** below, only as a fallback for greenfield prototypes, demos and examples.

A lower-priority source must never overwrite a higher-priority source without an explicit request.

## Adaptation workflow

Before changing colors:

- inspect existing CSS variables, theme tokens, Tailwind/theme configuration, design tokens and visible product screens;
- identify semantic roles such as `bg`, `surface`, `text`, `primary`, `border`, `success`, `warning`, `danger` and `info`;
- map Draft components to those semantic roles instead of copying raw hex values;
- preserve established brand/accent colors when they remain accessible and coherent;
- extend an incomplete palette minimally rather than replacing it;
- create a new palette only when the project has no usable palette or the user explicitly asks for a redesign.

If a project already has dark/light themes, preserve their character. Do not force warm paper, near-black, electric blue, cyan, yellow or pink simply because they appear in the reference examples.

## Semantic color rules

- Prefer one dominant accent per operational screen.
- The primary action uses the project's primary/interactive color.
- Status colors are semantic, not decorative.
- Do not reuse a brand accent as success/warning/error unless the semantic mapping is intentional and accessible.
- Focus indicators must remain visible independently of the primary fill.
- Never rely on color alone to communicate state.
- Charts should first draw from the project palette, then add distinguishable companion colors only as needed.

## Reference fallback palette

The following values exist so the HTML examples render consistently and so greenfield work has a usable fallback. **They are not mandatory product colors.**

### Dark reference theme

| Token | Value | Usage |
|---|---|---|
| `bg` | `#101010` | app background |
| `surface` | `#181818` | default panel |
| `surface-raised` | `#202020` | popover/modal |
| `surface-soft` | `#151515` | subtle grouped region |
| `text` | `#F6F3EB` | primary text |
| `text-muted` | `#B9B5AC` | secondary text |
| `text-subtle` | `#7D7972` | tertiary metadata |
| `border` | `rgba(255,255,255,.16)` | structural border |
| `border-strong` | `rgba(255,255,255,.28)` | stronger separation |

### Light reference theme

| Token | Value | Usage |
|---|---|---|
| `bg` | `#F2EFE7` | reference background |
| `surface` | `#FFFDF6` | default panel |
| `surface-raised` | `#FFFFFF` | popover/modal |
| `surface-soft` | `#ECE8DE` | grouped region |
| `text` | `#171717` | primary text |
| `text-muted` | `#625D56` | secondary text |
| `text-subtle` | `#858078` | tertiary metadata |
| `border` | `rgba(16,16,16,.16)` | structural border |
| `border-strong` | `rgba(16,16,16,.28)` | stronger separation |

### Reference accents

| Token | Value | Reference use |
|---|---|---|
| `accent-primary` | `#6977FF` | interactive accent |
| `accent-cyan` | `#5FE6FF` | live/system/info signal |
| `accent-yellow` | `#E7F542` | highlight / attention |
| `accent-pink` | `#FF5B92` | expressive emphasis |

These accents illustrate **roles and contrast**, not required hues. In a target product, map each role to the nearest suitable project color.

### Reference functional colors

| Token | Value | Usage |
|---|---|---|
| `success` | `#5ED39A` | successful state |
| `warning` | `#E9B949` | warning |
| `danger` | `#FF6B6B` | destructive/error |
| `info` | `#5FC4FF` | informational state |

Existing project semantic status tokens take precedence. These are fallback values only.

### Reference focus

Dark: `#5FE6FF`  
Light: `#245DE8`

Use the project's focus token instead when one exists, provided contrast remains adequate.

### Reference chart sequence

Fallback only:

1. `#6977FF`
2. `#5FE6FF`
3. `#FF5B92`
4. `#E7F542`
5. `#8D91A5`
6. `#5ED39A`

For real products, derive chart colors from the project palette first and always add non-color distinction when series meaning is critical.
