# UI Motion

## Principle

Motion explains:
- state;
- hierarchy;
- cause and effect.

Motion does not exist to prove the interface is animated.

## Timing

| Token | Duration | Use |
|---|---:|---|
| `fast` | 120ms | hover, pressed, micro state |
| `base` | 180ms | controls, tabs, menus |
| `medium` | 260ms | panels, drawers |
| `slow` | 360ms | page-level morph / showcase |

Preferred easing:
`cubic-bezier(.22, 1, .36, 1)`

## Product motion patterns

### State fade
Opacity + 2–4px translate.
Use for helper text, menu, popover.

### Selection
Background/border/rail transitions.
Avoid scale bounce.

### Panel enter
Opacity + max 8px translate.

### Drawer
Translate along opening axis.

### Number update
Prefer content update without animation.
If meaningful, use restrained digit/fade transition.

### Loading
Skeleton shimmer should be subtle and disabled under reduced motion.

## Signature motion

Allowed:
- accent rail draws in;
- panel lifts 1–2px on hover;
- selected card shadow shifts;
- glass toolbar softly appears;
- one project-specific animation.

Not allowed in normal tools:
- random rotation;
- floating decorative blobs;
- grid disruption;
- parallax everywhere;
- mouse-follow effects.

## Showcase-only motion

May use:
- shared element morphs;
- larger reveal;
- controlled displacement;
- live visual motifs.

These are not product defaults.

## Reduced motion

Under `prefers-reduced-motion: reduce`:
- remove spatial transitions where possible;
- keep state changes immediate;
- disable marquee/parallax/looping decorative motion;
- preserve usability and state visibility.
