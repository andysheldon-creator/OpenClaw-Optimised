# Component Libraries Research

Research on React component libraries built on Shadcn/UI and Radix for the Second Brain platform.

---

## Top Component Library Contenders

### Tier 1: Shadcn/Radix Ecosystem (Best Fit)

| Library                                                 | Best Known For                                                                           | Community                           | Compatibility                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| **[Origin UI](https://originui.com/)**                  | 400+ components across 25+ categories. Most comprehensive free library.                  | Growing, active development         | Tailwind 4, React 19, shadcn-native |
| **[Magic UI](https://magicui.design/)**                 | Stunning animations and micro-interactions. 50+ animated components.                     | **15k+ GitHub stars**               | Framer Motion, shadcn, Tailwind     |
| **[Aceternity UI](https://ui.aceternity.com/)**         | "Shadcn for magic effects." Animated dropdowns, hover effects, polish.                   | Trusted by major companies (Cursor) | Framer Motion, Tailwind, Radix      |
| **[Motion Primitives](https://motion-primitives.com/)** | Lightweight, fluid Framer Motion components. Performance-oriented.                       | Battle-tested in large apps         | Framer Motion, shadcn, Tailwind 4   |
| **[Cult UI](https://www.cult-ui.com/)**                 | Dark aesthetic, AI code generation, Apple OS-inspired components (Dynamic Island, Dock). | First shadcn + AI library           | Open source, full-stack templates   |

### Tier 2: Radix-Based Alternatives

| Library                                    | Best Known For                                                       | Community                                                        | Compatibility                          |
| ------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| **[Mantine](https://mantine.dev/)**        | 120+ components, 50+ hooks, SSR support. Highly flexible.            | **28k GitHub stars**, 490k weekly npm downloads                  | React 19, Next.js, Vite                |
| **[NextUI (HeroUI)](https://nextui.org/)** | Modern, beautiful defaults. Sub-40KB gzipped. Tailwind + React Aria. | Growing rapidly                                                  | Tailwind CSS, React Aria, SSR-friendly |
| **[Chakra UI](https://chakra-ui.com/)**    | 60+ accessible components, style props, easy theming.                | **38.8k GitHub stars**, 587k weekly downloads, 600+ contributors | React 19, Emotion/styled-system        |

### Tier 3: Specialized/Emerging

| Library                                           | Best Known For                                                              | Community                   | Compatibility         |
| ------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------- | --------------------- |
| **[Kibo UI](https://www.kiboui.com/)**            | Niche components filling shadcn gaps (stories, reels, mini calendar, deck). | Newer, clean modular design | shadcn, Tailwind      |
| **[shadcn/studio](https://ui.shadcn.com/studio)** | AI-powered tools, pre-built blocks/templates.                               | Official shadcn extension   | Full shadcn ecosystem |
| **[Align UI](https://www.alignui.com/)**          | Perfect design-code alignment. Polished, minimal, accessible.               | Growing                     | shadcn, Tailwind      |

---

## Compatibility Matrix for Second Brain Stack

| Library               | React 19 | Tailwind 4 | TanStack Query | Zustand | React Hook Form | Framer Motion   | ReactFlow |
| --------------------- | -------- | ---------- | -------------- | ------- | --------------- | --------------- | --------- |
| **Origin UI**         | ✅       | ✅         | ✅             | ✅      | ✅              | ✅              | ✅        |
| **Tremor**            | ✅       | ✅         | ✅             | ✅      | ✅              | ⚠️ (own charts) | ⚠️        |
| **Magic UI**          | ✅       | ✅         | ✅             | ✅      | ✅              | ✅ Native       | ✅        |
| **Aceternity UI**     | ✅       | ✅         | ✅             | ✅      | ✅              | ✅ Native       | ✅        |
| **Motion Primitives** | ✅       | ✅         | ✅             | ✅      | ✅              | ✅ Native       | ✅        |
| **Mantine**           | ✅       | ⚠️ Own CSS | ✅             | ✅      | ⚠️ Own forms    | ⚠️ Own motion   | ✅        |
| **Chakra UI**         | ✅       | ❌ Emotion | ✅             | ✅      | ✅              | ⚠️ Own          | ✅        |

---

## Recommended Stack

### Primary Libraries

```
shadcn/ui (base) + Origin UI (extended components) + Aceternity UI (animations)
```

### By Feature Area

| Feature                    | Recommended Library                                 |
| -------------------------- | --------------------------------------------------- |
| **Dashboard/Home**         | Tremor (charts, metrics) + Origin UI                |
| **Chat UI**                | Magic MCP components + shadcn/ui                    |
| **Agent Cards**            | Aceternity UI / Magic UI for status animations      |
| **Workstream DAG**         | ReactFlow + Motion Primitives                       |
| **Forms (Soul, Identity)** | Origin UI + React Hook Form + Zod                   |
| **Activity Feed**          | Origin UI timeline + Magic MCP dashboard-activities |
| **Power User Mode**        | shadcn/ui base components                           |

---

## Sources

- [Makers Den - React UI Libraries 2025](https://makersden.io/blog/react-ui-libs-2025-comparing-shadcn-radix-mantine-mui-chakra)
- [DevKit - Shadcn UI Ecosystem Guide 2025](https://www.devkit.best/blog/mdx/shadcn-ui-ecosystem-complete-guide-2025)
- [Tremor Official](https://www.tremor.so/)
- [Awesome shadcn/ui GitHub](https://github.com/birobirobiro/awesome-shadcn-ui)
- [TanStack Form + shadcn/ui Integration](https://ui.shadcn.com/docs/forms/tanstack-form)
