# Visual Design System - Second Brain Platform

## Design Philosophy

**Warm, playful, and approachable** - while remaining professional and functional.

Inspired by: Notion, Linear, Figma - products that feel personal and delightful without sacrificing utility.

### Core Principles

1. **Warmth over coldness** - Soft colors, rounded corners, friendly shadows
2. **Personality with restraint** - Delightful details that don't distract
3. **Clarity first** - Information hierarchy is never sacrificed for aesthetics
4. **Accessible by default** - WCAG AA contrast, keyboard navigation, screen reader support
5. **Dark mode as first-class** - Not an afterthought; designed alongside light mode

---

## Color System

### Semantic Color Tokens

Using CSS custom properties for easy theming:

```css
:root {
  /* Background layers */
  --background: 0 0% 100%; /* Main background */
  --background-subtle: 30 20% 98%; /* Slightly off-white, warm */
  --background-muted: 30 15% 96%; /* Cards, elevated surfaces */

  /* Foreground */
  --foreground: 30 10% 10%; /* Primary text */
  --foreground-muted: 30 5% 45%; /* Secondary text */

  /* Card surfaces */
  --card: 30 20% 99%;
  --card-foreground: 30 10% 10%;

  /* Primary accent */
  --primary: 25 90% 55%; /* Warm orange */
  --primary-foreground: 0 0% 100%;

  /* Secondary */
  --secondary: 30 15% 94%;
  --secondary-foreground: 30 10% 25%;

  /* Muted elements */
  --muted: 30 15% 94%;
  --muted-foreground: 30 5% 45%;

  /* Accent for highlights */
  --accent: 30 20% 96%;
  --accent-foreground: 30 10% 25%;

  /* Semantic states */
  --success: 142 70% 45%;
  --success-foreground: 0 0% 100%;

  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 100%;

  --error: 0 84% 60%;
  --error-foreground: 0 0% 100%;

  --info: 210 100% 50%;
  --info-foreground: 0 0% 100%;

  /* Borders */
  --border: 30 10% 90%;
  --border-subtle: 30 10% 94%;

  /* Input elements */
  --input: 30 10% 90%;
  --ring: 25 90% 55%;

  /* Radius */
  --radius: 0.75rem;
}

/* Dark mode */
.dark {
  --background: 30 10% 8%;
  --background-subtle: 30 10% 10%;
  --background-muted: 30 10% 12%;

  --foreground: 30 20% 95%;
  --foreground-muted: 30 10% 60%;

  --card: 30 10% 10%;
  --card-foreground: 30 20% 95%;

  --primary: 25 90% 60%;
  --primary-foreground: 30 10% 8%;

  --secondary: 30 10% 15%;
  --secondary-foreground: 30 20% 90%;

  --muted: 30 10% 15%;
  --muted-foreground: 30 10% 60%;

  --accent: 30 10% 15%;
  --accent-foreground: 30 20% 90%;

  --border: 30 10% 18%;
  --border-subtle: 30 10% 15%;

  --input: 30 10% 15%;
  --ring: 25 90% 60%;
}
```

### Color Palette Visualization

**Light Mode:**

```
Background:      ████████████  #FFFFFF → #FBF9F7 (warm white)
Cards:           ████████████  #FDFCFB (cream)
Text Primary:    ████████████  #1A1815 (warm black)
Text Secondary:  ████████████  #6B6560 (warm gray)
Accent:          ████████████  #E86A17 (sunset orange)
Success:         ████████████  #22A55B (forest green)
Warning:         ████████████  #F59E0B (amber)
Error:           ████████████  #EF4444 (coral red)
```

**Dark Mode:**

```
Background:      ████████████  #141210 (warm dark)
Cards:           ████████████  #1C1917 (elevated dark)
Text Primary:    ████████████  #F5F3F0 (cream white)
Text Secondary:  ████████████  #9C9590 (muted cream)
Accent:          ████████████  #F07A2E (brighter orange)
Success:         ████████████  #34D072 (bright green)
Warning:         ████████████  #FBBF24 (bright amber)
Error:           ████████████  #F87171 (soft coral)
```

### Status Colors

| Status           | Light     | Dark      | Usage                       |
| ---------------- | --------- | --------- | --------------------------- |
| Online/Active    | `#22A55B` | `#34D072` | Connected, running, healthy |
| Offline/Inactive | `#9CA3AF` | `#6B7280` | Disconnected, paused        |
| Busy/Working     | `#F59E0B` | `#FBBF24` | Processing, in progress     |
| Error/Failed     | `#EF4444` | `#F87171` | Errors, failures            |
| Pending          | `#3B82F6` | `#60A5FA` | Waiting, queued             |

---

## Typography

### Font Stack

```css
:root {
  /* Primary font - for UI and body text */
  --font-sans:
    "Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", sans-serif;

  /* Monospace - for code, technical values */
  --font-mono: "JetBrains Mono", "Fira Code", "SF Mono", Monaco, "Cascadia Code", monospace;

  /* Display - for large headings (optional, can use Inter) */
  --font-display: "Inter", var(--font-sans);
}
```

### Type Scale

Using a 1.25 ratio (Major Third) for harmonious scaling:

| Token       | Size | Line Height | Weight | Usage                        |
| ----------- | ---- | ----------- | ------ | ---------------------------- |
| `text-xs`   | 12px | 16px        | 400    | Captions, labels             |
| `text-sm`   | 14px | 20px        | 400    | Secondary text, descriptions |
| `text-base` | 16px | 24px        | 400    | Body text, inputs            |
| `text-lg`   | 18px | 28px        | 500    | Emphasized body              |
| `text-xl`   | 20px | 28px        | 600    | Card titles                  |
| `text-2xl`  | 24px | 32px        | 600    | Section headings             |
| `text-3xl`  | 30px | 36px        | 700    | Page titles                  |
| `text-4xl`  | 36px | 40px        | 700    | Hero headings                |

### Font Weights

| Weight   | Value | Usage                           |
| -------- | ----- | ------------------------------- |
| Regular  | 400   | Body text, descriptions         |
| Medium   | 500   | Labels, emphasized text         |
| Semibold | 600   | Headings, buttons               |
| Bold     | 700   | Page titles, important headings |

### Typography Utilities

```tsx
// Heading styles
<h1 className="text-3xl font-bold text-foreground">Page Title</h1>
<h2 className="text-2xl font-semibold text-foreground">Section</h2>
<h3 className="text-xl font-semibold text-foreground">Card Title</h3>

// Body styles
<p className="text-base text-foreground">Body text</p>
<p className="text-sm text-muted-foreground">Secondary text</p>
<span className="text-xs text-muted-foreground">Caption</span>

// Monospace
<code className="font-mono text-sm">technical-value</code>
```

---

## Spacing System

Using a 4px base unit for consistency:

| Token       | Value | Usage            |
| ----------- | ----- | ---------------- |
| `space-0`   | 0     | None             |
| `space-0.5` | 2px   | Micro spacing    |
| `space-1`   | 4px   | Tight spacing    |
| `space-1.5` | 6px   | Compact          |
| `space-2`   | 8px   | Small gaps       |
| `space-3`   | 12px  | Medium-small     |
| `space-4`   | 16px  | Standard padding |
| `space-5`   | 20px  | Medium           |
| `space-6`   | 24px  | Large padding    |
| `space-8`   | 32px  | Section spacing  |
| `space-10`  | 40px  | Large sections   |
| `space-12`  | 48px  | Page sections    |
| `space-16`  | 64px  | Major divisions  |

### Common Spacing Patterns

```tsx
// Card padding
<Card className="p-4">...</Card>           // 16px all around
<Card className="p-6">...</Card>           // 24px for larger cards

// Content gaps
<div className="space-y-4">...</div>       // 16px vertical gaps
<div className="space-y-6">...</div>       // 24px for sections
<div className="gap-4">...</div>           // 16px flex/grid gaps

// Page layout
<main className="p-6">...</main>           // 24px page padding
<main className="p-8">...</main>           // 32px for desktop

// Component spacing
<Button className="px-4 py-2">...</Button> // Standard button
<Badge className="px-2 py-0.5">...</Badge> // Compact badge
```

---

## Border Radius

Creating a soft, friendly feel:

| Token          | Value  | Usage                   |
| -------------- | ------ | ----------------------- |
| `rounded-none` | 0      | Sharp edges (rare)      |
| `rounded-sm`   | 4px    | Small elements, inputs  |
| `rounded`      | 6px    | Badges, small buttons   |
| `rounded-md`   | 8px    | Standard buttons, tags  |
| `rounded-lg`   | 12px   | Cards, dialogs          |
| `rounded-xl`   | 16px   | Large cards, containers |
| `rounded-2xl`  | 20px   | Hero sections           |
| `rounded-full` | 9999px | Avatars, pills          |

### Border Radius Patterns

```tsx
// Avatars
<Avatar className="rounded-full" />

// Buttons
<Button className="rounded-md" />           // Standard
<Button className="rounded-full" />         // Pill buttons

// Cards
<Card className="rounded-lg" />             // Standard cards
<Card className="rounded-xl" />             // Feature cards

// Inputs
<Input className="rounded-md" />

// Badges/Tags
<Badge className="rounded-full" />          // Status badges
<Badge className="rounded-md" />            // Label badges
```

---

## Shadows

Soft, subtle shadows for depth:

```css
:root {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.03);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.05), 0 8px 10px -6px rgb(0 0 0 / 0.05);
}

.dark {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.2);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.3), 0 4px 6px -4px rgb(0 0 0 / 0.3);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.3), 0 8px 10px -6px rgb(0 0 0 / 0.3);
}
```

### Shadow Usage

| Shadow      | Usage                              |
| ----------- | ---------------------------------- |
| `shadow-sm` | Subtle separation, input focus     |
| `shadow`    | Default cards, buttons             |
| `shadow-md` | Elevated cards, dropdowns          |
| `shadow-lg` | Modals, popovers                   |
| `shadow-xl` | Command palette, important dialogs |

---

## Icons

### Icon Library

Using **Lucide React** for consistency with Shadcn:

```bash
npm install lucide-react
```

### Icon Sizes

| Size      | Pixels | Usage                    |
| --------- | ------ | ------------------------ |
| `size-3`  | 12px   | Inline with small text   |
| `size-4`  | 16px   | Standard inline, buttons |
| `size-5`  | 20px   | Larger buttons, emphasis |
| `size-6`  | 24px   | Section headers          |
| `size-8`  | 32px   | Feature icons            |
| `size-10` | 40px   | Hero icons               |

### Icon Colors

```tsx
// Match text colors
<User className="size-4 text-foreground" />
<User className="size-4 text-muted-foreground" />

// Status colors
<Circle className="size-3 fill-success text-success" />  // Online
<Circle className="size-3 fill-error text-error" />      // Error

// In buttons
<Button>
  <Plus className="size-4 mr-2" />
  Add Item
</Button>
```

---

## Animation & Motion

### Timing

```css
:root {
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --duration-slower: 500ms;

  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Common Animations

```tsx
// Fade in
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.2 }}
/>

// Slide in from bottom
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
/>

// Scale in
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
/>

// Pulse for status indicators
<motion.div
  animate={{ scale: [1, 1.2, 1] }}
  transition={{ duration: 2, repeat: Infinity }}
/>
```

### Reduced Motion

```tsx
// Always respect user preferences
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

<motion.div
  initial={prefersReducedMotion ? false : { opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
/>;
```

---

## Tailwind Configuration

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--error-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "slide-in-bottom": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "slide-in-bottom": "slide-in-bottom 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

---

## Component Examples

### Card with Hover

```tsx
<Card
  className="p-4 rounded-lg shadow-sm border border-border/50
                 hover:shadow-md hover:border-border
                 transition-all duration-200"
>
  <CardHeader>
    <CardTitle>Agent Name</CardTitle>
  </CardHeader>
</Card>
```

### Status Badge

```tsx
<Badge variant="outline" className="bg-success/10 text-success border-success/20">
  <Circle className="size-2 fill-current mr-1 animate-pulse-soft" />
  Online
</Badge>
```

### Button Variants

```tsx
// Primary
<Button className="bg-primary text-primary-foreground hover:bg-primary/90">
  Get Started
</Button>

// Secondary
<Button variant="secondary" className="hover:bg-secondary/80">
  Learn More
</Button>

// Ghost
<Button variant="ghost" className="hover:bg-accent">
  Cancel
</Button>
```

---

## Accessibility Checklist

- [ ] All interactive elements have visible focus states
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Status is not conveyed by color alone (icons + color)
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Touch targets are at least 44x44px on mobile
- [ ] All images have alt text
- [ ] Modals trap focus and restore on close
- [ ] Landmarks and heading hierarchy are correct
