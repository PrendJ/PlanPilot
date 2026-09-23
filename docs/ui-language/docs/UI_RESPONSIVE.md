# Responsive UI

## Principle

Mobile is an edited composition, not a compressed desktop.

Priority:
1. content;
2. primary action;
3. navigation;
4. state;
5. brand expression;
6. decoration.

Decoration is the first thing removed.

## Breakpoint guidance

Use content-driven breakpoints; suggested anchors:

- small mobile: `< 420px`
- mobile: `< 720px`
- tablet: `720–1023px`
- desktop: `1024–1439px`
- wide: `>= 1440px`

## Desktop

- 12-column grid;
- 32px page gutter;
- sidebar up to 248px;
- multi-column tables/forms allowed;
- contextual side panels allowed.

## Tablet

- 8-column grid;
- reduce simultaneous side panels;
- collapse secondary toolbar actions;
- preserve tables where possible.

## Mobile

- 4-column grid;
- 16px gutter;
- one primary content column;
- large decorative shapes hidden;
- glass effects simplified;
- heading scale reduced but tracking stays readable;
- 44px touch targets;
- filter chips can horizontally scroll if necessary;
- avoid nested horizontal scroll regions.

## Tables

Choose deliberately:
1. contained horizontal table; or
2. purpose-built record view.

Do not automatically hide critical columns.

## Forms

- single column by default;
- related small fields may share row only when comfortable at >=390px;
- sticky primary action only when it improves completion.

## Navigation

If desktop uses sidebar:
- mobile uses drawer or product-appropriate bottom nav.

If desktop uses top nav:
- simplify labels and move secondary controls into overflow.

## Showcase expression on mobile

Reduce by at least one level:
- Showcase desktop often becomes Signature mobile;
- Signature desktop may become Utility-leaning mobile.

Never place decorative accent shapes behind reading text.
