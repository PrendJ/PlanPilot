# Integration map

This package mirrors the UI-related areas of the agent-ready template.

Recommended merge:

| Package file | Template destination | Action |
|---|---|---|
| `docs/UI_SYSTEM.md` | `docs/UI_SYSTEM.md` | Replace TODO scaffold / merge project-specific rules below shared rules |
| `docs/UI_COMPONENTS.md` | `docs/UI_COMPONENTS.md` | Add as shared reference |
| `docs/UI_MOTION.md` | `docs/UI_MOTION.md` | Add |
| `docs/UI_RESPONSIVE.md` | `docs/UI_RESPONSIVE.md` | Add |
| `docs/UI_ACCESSIBILITY.md` | `docs/UI_ACCESSIBILITY.md` | Add |
| `docs/UI_MICROCOPY.md` | `docs/COPY.md` or separate UI microcopy doc | Merge only interface tone |
| `assets/brand/colors.md` | `assets/brand/colors.md` | Merge policy only; preserve existing project palette/tokens and use Draft colors as fallback |
| `assets/brand/typography.md` | `assets/brand/typography.md` | Replace TODO scaffold |
| `assets/ui/README.md` | `assets/ui/README.md` | Replace/extend |
| `examples/ui/*` | `examples/ui/*` | Add |
| `examples/screenshots/README.md` | `assets/ui/reference/README.md` or `examples/ui/screenshots/README.md` | Keep note; render fresh screenshots from the HTML examples after integration |

## Important

Do not automatically copy the HTML examples into production.

They are visual contracts:
- hierarchy;
- density;
- geometry;
- states;
- theme behavior;
- component relationships.

Production code should use the project's actual stack and component architecture.

### Color integration rule
Do **not** copy the reference palette over an existing project theme. First inspect and preserve the target project's current or agreed colors, then map Draft UI semantic roles onto those tokens. The bundled colors are fallback/demo values only.
