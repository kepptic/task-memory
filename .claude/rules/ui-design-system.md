# Task Memory Design System

> A design language for memory tools in the AI age. Not cold. Not generic. Purposeful.

## Philosophy

Task Memory is where developers preserve insights that survive context resets. The UI should feel like:
- **A research journal** - warm, personal, trustworthy
- **A workbench** - functional, focused, no decoration for decoration's sake
- **An archive** - permanent, organized, respectful of the work inside

### Anti-Patterns (What We Reject)
- Generic SaaS gradients and glass morphism
- Cold corporate blue/gray palettes
- Excessive shadows and depth for "modern" looks
- Rounded everything (pill buttons, excessive border-radius)
- Trendy but meaningless animations

### Core Principles
1. **Substance over style** - Every visual choice serves function
2. **Warmth without whimsy** - Professional but human
3. **Density without clutter** - Respect information, don't pad it
4. **Permanence** - Design that feels archival, not ephemeral

---

## Color System

Use CSS variables for semantic naming. Colors have *meaning*, not just aesthetics.

### Semantic Tokens

```css
:root {
  /* Surface hierarchy - warm neutrals, not gray */
  --surface-ground: oklch(12% 0.01 60);      /* Deepest background */
  --surface-base: oklch(16% 0.01 60);        /* Primary canvas */
  --surface-elevated: oklch(20% 0.015 60);   /* Cards, panels */
  --surface-overlay: oklch(24% 0.02 60);     /* Modals, dropdowns */

  /* Text hierarchy */
  --text-primary: oklch(92% 0.01 60);        /* Main content */
  --text-secondary: oklch(70% 0.01 60);      /* Supporting text */
  --text-muted: oklch(50% 0.01 60);          /* Subtle, metadata */
  --text-inverse: oklch(12% 0.01 60);        /* On light backgrounds */

  /* Accent colors - purposeful, not decorative */
  --accent-primary: oklch(65% 0.15 45);      /* Amber/gold - warmth, focus */
  --accent-primary-hover: oklch(70% 0.18 45);
  --accent-secondary: oklch(60% 0.12 200);   /* Teal - calm action */
  --accent-secondary-hover: oklch(65% 0.15 200);

  /* Status - functional feedback only */
  --status-active: oklch(65% 0.15 145);      /* Green - in progress, success */
  --status-pending: oklch(70% 0.12 85);      /* Yellow - waiting, todo */
  --status-complete: oklch(55% 0.08 200);    /* Muted teal - done */
  --status-critical: oklch(60% 0.18 25);     /* Red-orange - urgent */

  /* Borders - subtle structure */
  --border-subtle: oklch(25% 0.01 60);
  --border-default: oklch(30% 0.015 60);
  --border-emphasis: oklch(40% 0.02 60);

  /* Focus - accessibility, always visible */
  --focus-ring: oklch(65% 0.15 45 / 0.5);
}
```

### Priority Badge Colors
```css
/* Priority uses saturation to indicate urgency */
--priority-critical: oklch(60% 0.2 25);   /* High saturation red-orange */
--priority-high: oklch(65% 0.15 45);      /* Amber */
--priority-medium: oklch(60% 0.08 200);   /* Desaturated teal */
--priority-low: oklch(55% 0.05 145);      /* Muted green */
```

---

## Typography

### Font Stack
```css
--font-sans: "Inter", system-ui, -apple-system, sans-serif;
--font-mono: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
```

### Scale (based on 1rem = 16px)
```css
--text-xs: 0.75rem;     /* 12px - metadata, timestamps */
--text-sm: 0.8125rem;   /* 13px - secondary content */
--text-base: 0.875rem;  /* 14px - body text (denser than typical) */
--text-lg: 1rem;        /* 16px - emphasis, card titles */
--text-xl: 1.125rem;    /* 18px - section headers */
--text-2xl: 1.375rem;   /* 22px - page titles */
```

### Weight
- **400 Regular** - Body text
- **500 Medium** - Labels, emphasis
- **600 Semibold** - Headings, buttons

### Line Height
- **1.4** - Headings (tight)
- **1.5** - Body text (comfortable)
- **1.6** - Long-form content

---

## Spacing

Use a 4px base unit. Spacing should feel *tight but not cramped*.

```css
--space-1: 0.25rem;   /* 4px - inline spacing */
--space-2: 0.5rem;    /* 8px - tight padding */
--space-3: 0.75rem;   /* 12px - default gap */
--space-4: 1rem;      /* 16px - section spacing */
--space-5: 1.25rem;   /* 20px - card padding */
--space-6: 1.5rem;    /* 24px - major sections */
--space-8: 2rem;      /* 32px - page margins */
```

---

## Border Radius

Minimal rounding. Sharp corners convey precision and permanence.

```css
--radius-sm: 0.25rem;   /* 4px - buttons, badges */
--radius-md: 0.375rem;  /* 6px - cards, inputs */
--radius-lg: 0.5rem;    /* 8px - modals */
```

---

## Shadows

Subtle depth. No dramatic shadows. Elevation through color shift, not drop shadows.

```css
--shadow-sm: 0 1px 2px oklch(0% 0 0 / 0.1);
--shadow-md: 0 2px 4px oklch(0% 0 0 / 0.1), 0 1px 2px oklch(0% 0 0 / 0.06);
--shadow-lg: 0 4px 8px oklch(0% 0 0 / 0.1), 0 2px 4px oklch(0% 0 0 / 0.06);
```

---

## Component Patterns

### Cards (Task Cards)
```
- Background: --surface-elevated
- Border: 1px solid --border-subtle
- Radius: --radius-md
- Padding: --space-4
- Hover: border-color transitions to --border-default
- No shadow at rest, --shadow-sm on hover
```

### Buttons
```
Primary:
- Background: --accent-primary
- Text: --text-inverse
- Radius: --radius-sm
- Padding: --space-2 --space-4
- Hover: --accent-primary-hover
- Transition: 120ms background

Ghost:
- Background: transparent
- Text: --text-secondary
- Hover: background --surface-elevated
```

### Inputs
```
- Background: --surface-base
- Border: 1px solid --border-default
- Radius: --radius-md
- Padding: --space-2 --space-3
- Focus: border --accent-primary, ring 2px --focus-ring
```

### Badges
```
- Font: --text-xs, --font-mono, uppercase, letter-spacing 0.05em
- Padding: --space-1 --space-2
- Radius: --radius-sm
- Background: color at 15% opacity
- Text: color at full saturation
```

### Modals
```
- Background: --surface-overlay
- Border: 1px solid --border-default
- Radius: --radius-lg
- Shadow: --shadow-lg
- Backdrop: oklch(0% 0 0 / 0.6)
```

---

## Animation

Motion should be **functional, not decorative**. Fast, subtle, purposeful.

### Durations
```css
--duration-fast: 100ms;    /* Micro-interactions: hover, focus */
--duration-base: 150ms;    /* State changes: open/close */
--duration-slow: 250ms;    /* Page transitions, modals */
```

### Easing
```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);  /* Enter animations */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1); /* State changes */
```

### Principles
- **Hover states**: 100ms, background color only
- **Focus rings**: instant (0ms)
- **Modals**: 150ms fade + 150ms scale from 0.98 to 1
- **Drag and drop**: 150ms transform, opacity to 0.6 while dragging
- **No bouncing, no spring physics** - this is a productivity tool

---

## Kanban-Specific Patterns

### Column Headers
```
- Background: transparent
- Left border: 2px solid column-color
- Font: --text-sm, --font-sans, semibold
- Task count: badge, --text-xs, muted
```

### Column Colors (semantic by workflow state)
```css
--column-todo: oklch(70% 0.12 85);       /* Warm yellow - waiting */
--column-progress: oklch(65% 0.15 45);   /* Amber - active focus */
--column-review: oklch(60% 0.12 280);    /* Purple - needs attention */
--column-done: oklch(55% 0.08 145);      /* Muted green - complete */
```

### Task Card States
```
Default: border --border-subtle
Hover: border --border-default, shadow --shadow-sm
Dragging: opacity 0.6, scale 1.02, rotate 1deg
Drop target: border dashed --accent-primary
```

---

## Accessibility Requirements

- **Contrast**: Minimum 4.5:1 for body text, 3:1 for large text
- **Focus indicators**: Always visible, never remove outline
- **Motion**: Respect prefers-reduced-motion
- **Keyboard**: All interactive elements focusable
- **ARIA**: Proper roles for drag-and-drop

---

## What Makes This NOT Generic

1. **Warm neutrals** - Brown-tinted grays instead of pure gray
2. **Amber as primary** - Not blue, not purple, not gradient
3. **Sharp corners** - Minimal radius conveys precision
4. **Dense typography** - 14px base, not wasteful 16px
5. **Monospace for IDs** - Technical, archival aesthetic
6. **Column colors tied to meaning** - Yellow=waiting, Amber=active, Green=done
7. **No decorative shadows** - Depth through border/color, not drop shadows
8. **Fast animations** - 100-150ms max, no bouncing

---

## Implementation Notes

### Tailwind Config Extensions
```js
// Extend Tailwind with semantic tokens
theme: {
  extend: {
    colors: {
      surface: {
        ground: 'var(--surface-ground)',
        base: 'var(--surface-base)',
        elevated: 'var(--surface-elevated)',
        overlay: 'var(--surface-overlay)',
      },
      // ... etc
    }
  }
}
```

### Class Naming Convention
- Use semantic names: `bg-surface-elevated` not `bg-zinc-800`
- State classes: `hover:border-emphasis` not `hover:border-zinc-600`
- Component prefixes: `task-card`, `kanban-column`, `priority-badge`

---

## Theme Variants

This system supports theming by overriding CSS variables:

### "Midnight" (Default Dark)
Current warm dark theme with amber accents.

### "Parchment" (Light)
Inverted: cream backgrounds, dark text, same accent colors.

### "Terminal"
High contrast: pure black background, green/amber text, monospace everywhere.

To create a new theme, override the `:root` variables in a `[data-theme="name"]` selector.
