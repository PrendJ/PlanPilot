# UI Accessibility

These are shared visual/interface requirements.

## Keyboard

- every interactive control reachable;
- focus order matches reading order;
- no hover-only essential action;
- visible focus ring;
- modal/drawer focus management.

## Focus

Use dedicated semantic focus token.
Do not remove outline without replacing it.

Focus must remain visible on:
- accent fills;
- light surfaces;
- dark surfaces;
- glass surfaces.

## Contrast

Target WCAG AA for normal text.

Muted text must still be readable.
Do not use very low-opacity text for essential metadata.

## Target size

Default interactive target:
44×44px.

Compact 36px controls allowed only in dense desktop contexts and never for critical mobile actions.

## Motion

Respect `prefers-reduced-motion`.

Looping decorative animation must stop or simplify.

## Color

Never communicate state by color alone.

Pair with:
- icon;
- text;
- shape;
- pattern;
- position.

## Typography

- body text generally >=16px on mobile;
- labels may be smaller when non-essential;
- avoid extreme negative tracking;
- do not use uppercase for long text.

## Forms

- persistent labels;
- errors tied to fields;
- instructions available before submission;
- disabled controls visually and semantically disabled.

## Tables

- proper headers;
- scope/association;
- sortable states announced;
- keyboard-accessible row actions.

## Charts

- provide text equivalents/labels where decisions depend on values;
- distinguish series beyond color;
- visible focus/tooltips for interactive marks.

## Glass

Backdrop blur is aesthetic, not a contrast strategy.
Glass surfaces must have enough background tint/border to remain readable without blur support.
