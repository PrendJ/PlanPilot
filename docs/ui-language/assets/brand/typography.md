# Typography — Draft UI Language

## Core idea

Typography carries most of the identity.

The system should feel bold and editorial without becoming narrow or difficult to read.

## Font families

### Primary
Preferred:
`Inter`

Fallback:
`ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`

Projects may use a metrically compatible modern grotesk if documented, but should preserve the same scale/tracking principles.

### Monospace
`ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`

Use monospace for:
- eyebrow labels;
- IDs;
- timestamps;
- technical metadata;
- compact status text;
- numeric data where alignment matters.

Do not use monospace for long body text.

---

## Weight

| Role | Weight |
|---|---:|
| Display | 800–900 |
| Heading | 700–800 |
| UI action | 650–750 |
| Body | 400–500 |
| Label | 650–800 |

---

## Tracking

| Role | Tracking |
|---|---|
| Hero/display | `-0.035em` to `-0.045em` |
| Large heading | `-0.025em` to `-0.035em` |
| Small heading | `-0.015em` |
| Body | `0` |
| Mono eyebrow | `0.07em` to `0.10em` |

Never use tracking tighter than roughly `-0.045em` in the shared product system.

---

## Line height

| Role | Line height |
|---|---:|
| Display | `.90–.98` |
| Heading | `1.00–1.15` |
| UI | `1.2–1.35` |
| Body | `1.5–1.7` |
| Mono label | `1.2–1.35` |

---

## Scale

Suggested fluid scale:

| Token | CSS | Use |
|---|---|---|
| `display-xl` | `clamp(3.5rem, 8vw, 7rem)` | showcase only |
| `display-lg` | `clamp(2.8rem, 6vw, 5rem)` | major landing/page moment |
| `display-md` | `clamp(2.2rem, 4vw, 3.5rem)` | product page title |
| `h2` | `clamp(1.75rem, 3vw, 2.5rem)` | section |
| `h3` | `1.5rem` | subsection |
| `h4` | `1.125rem` | panel |
| `body-lg` | `1.125rem` | intro/supporting |
| `body` | `1rem` | default |
| `ui` | `.875rem` | controls |
| `caption` | `.75rem` | metadata |
| `eyebrow` | `.6875rem` | technical label |

---

## Responsive rules

On mobile:
- preserve weight;
- reduce scale before reducing legibility;
- do not use display text that forces 3–5 awkward word wraps;
- do not place decorative elements behind text;
- keep body at least 16px for reading-heavy content.

---

## Example hierarchy

```text
WORKSPACE / FORECAST
Q4 Outlook
Compare actuals, budget and scenario assumptions.

Revenue
€1.82M
```

The eyebrow provides character.
The title provides hierarchy.
The body remains neutral and easy to read.
