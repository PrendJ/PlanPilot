# UI implementation checklist

Use this before closing a UI task.

## Foundations
- [ ] Existing/agreed project palette was identified before styling changes.
- [ ] Draft reference colors did not overwrite a coherent existing palette.
- [ ] Uses semantic theme tokens instead of raw colors in components.
- [ ] If no palette existed, the chosen palette fits the product context rather than mechanically copying the Draft fallback.
- [ ] Dark and light both look intentional.
- [ ] Typography follows shared tracking/line-height rules.
- [ ] Spacing comes from the shared scale.
- [ ] Structural panels/cards/nav/table frames are square by default (`0px`).
- [ ] Ordinary buttons and inputs are square or at most subtly softened (`0–2px`).
- [ ] Pill/circle geometry is reserved for filters, chips, switches and status dots.

## Identity
- [ ] Technical/mono labels used only where useful.
- [ ] One dominant accent per screen, drawn from the product palette.
- [ ] Glass is limited to chrome/overlays.
- [ ] Product screen uses Utility or Signature by default.
- [ ] No generic SaaS/bento styling introduced without need.

## Components
- [ ] Buttons have clear hierarchy.
- [ ] Labels are visible on form fields.
- [ ] Tables are treated as first-class UI.
- [ ] Empty/error/loading states are designed.
- [ ] Status colors use semantic tokens.

## Responsive
- [ ] 360–390px checked.
- [ ] 768px checked.
- [ ] 1024px checked.
- [ ] 1440px checked where relevant.
- [ ] Decorative elements removed/reduced on mobile.
- [ ] No horizontal page overflow.
- [ ] 44px mobile targets.

## Accessibility
- [ ] Keyboard path works.
- [ ] Focus visible.
- [ ] Contrast checked.
- [ ] State is not color-only.
- [ ] Reduced motion works.
- [ ] Hover-only actions have focus/touch alternative.

## Motion
- [ ] Motion explains state.
- [ ] No gratuitous looping motion.
- [ ] Hover movement <=2px in product surfaces.
- [ ] Showcase-only effects have not leaked into operational UI.

## Final visual review
- [ ] The screen preserves the product’s own color identity where one existed.
- [ ] Screen still reads clearly with all accents mentally removed.
- [ ] Personality appears in hierarchy/edges, not everywhere.
- [ ] It looks related to other Draft-family projects without looking cloned.
