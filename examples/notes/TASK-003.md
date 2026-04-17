# TASK-003 Notes — Implement dashboard UI

_Created 2026-01-11. Captures context that would otherwise be lost at session end or compaction._

## Summary

Building the main dashboard: header, sidebar nav, metric cards, data grid. Design
locked in mockups. Using shadcn/ui to match the rest of the codebase and CSS Grid
for the layout. Header/sidebar shells in progress; data grid is the risk item.

## Patterns Discovered

- shadcn/ui copy-paste model keeps the component source in the repo — easier to patch than a locked npm dependency.
- Tailwind CSS Grid utilities (`grid-cols-{n}`, `gap-{n}`, responsive variants) cover the dashboard layout without custom CSS.
- Radix primitives under shadcn give accessibility for free — focus trap, roving tabindex, ARIA.

## Gotchas

- shadcn components depend on specific Radix versions — bumping Radix unilaterally can break them; update via `pnpm dlx shadcn add <component>` to stay in sync.
- CSS Grid on the dashboard shell requires an explicit `min-height: 100vh` on the parent or rows collapse when the content is short.

## Decisions

- shadcn/ui over MUI or Chakra — matches existing codebase patterns and Tailwind-first styling.
- CSS Grid layout (not Flexbox) — two-dimensional is natural for dashboards, and `grid-template-areas` will make responsive breakpoints readable.
- Card component as the unit of metric display — consistent spacing, alignment, and hover affordances across the whole board.

## Resources

- https://ui.shadcn.com/docs — component library reference
- https://tailwindcss.com/docs/grid-template-columns — grid utilities
- https://www.radix-ui.com/primitives — underlying primitives for accessibility

## Open Questions

- Do we need virtualized rows in the data grid now, or wait until row count justifies it? Defer unless real traffic shows jank.
