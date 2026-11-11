# Lotuz — Design System

## Purpose

Present one recognizable, minimalist and professional Lotuz brand across the website and independent SaaS frontends. Product workflows may differ; visual foundations should remain consistent. The shared component implementation lives in `packages/ui`.

## Brand tokens

Customer-facing names use **Lotuz** and **Lotuz Inventory**. Future products follow
the same pattern (for example, Lotuz POS, Lotuz Invoicing and Lotuz CRM).
UseLotuz is the domain/repository identity; `uselotuz.io` and technical asset names
stay unchanged. This naming decision does not change the approved lotus artwork,
Geist typography, color tokens or layouts.

| Semantic token | Light-mode value | Usage                                       |
| -------------- | ---------------- | ------------------------------------------- |
| Primary        | `#2563EB`        | Lotus brand blue, primary actions and links |
| Primary hover  | `#1D4ED8`        | Interactive hover                           |
| Background     | `#F8FAFC`        | Page background                             |
| Surface        | `#FFFFFF`        | Cards, forms and dialogs                    |
| Text primary   | `#0F172A`        | Main content                                |
| Text secondary | `#64748B`        | Supporting content                          |
| Border         | `#E2E8F0`        | Dividers and outlines                       |
| Success        | `#16A34A`        | Positive states                             |
| Warning        | `#D97706`        | Caution states                              |
| Error          | `#DC2626`        | Error/destructive states                    |

Implement semantic tokens in the shared theme rather than scattering hex values across components. Check text/control contrast and keyboard focus visibility, especially for status colors.

## Typography and spacing

- **Geist** is the approved primary font, self-hosted in the static build through Next.js font tooling.
- **Comfortaa Regular (400)** is used only for the lowercase `lotuz` header/footer wordmark, self-hosted through Next.js font tooling. All other website typography remains Geist; formal brand and product names remain Lotuz and Lotuz Inventory.
- Clear heading hierarchy, readable body sizes and line heights; avoid decorative typography.
- Follow Tailwind's spacing scale with consistent content widths and form spacing.
- Suggested radius: **8px** for common controls, **12px** for cards; adjust via shared tokens, not per-app overrides.

## Shared components

Create reusable buttons, inputs, selects, forms, dialogs, tables, cards, notifications, navigation, pagination, loading and empty states as needed. Use the selected shadcn/ui primitives and Lucide React icons through the shared UI approach; avoid competing component libraries or duplicated app-specific versions without a reason.

Components should support keyboard navigation, accessible labels, useful focus states and responsive layouts. Tables may scroll horizontally or use an appropriate compact mobile presentation.

## Brand assets

- Use the approved blue lotus icon for the parent Lotuz identity, with appropriate clear space and without unnecessary text in icon-only placements.
- Header and footer branding pair the unchanged lotus SVG at 44px with a 26px lowercase `lotuz` wordmark in Comfortaa Regular (400), no added flex gap and -0.03em letter spacing. Below 640px, use a 40px icon and 22px wordmark with the same zero-gap treatment. Vertically center both so the visible lotus extends slightly above and below the text. The SVG's built-in clear space provides separation so the mark and name read as one unit. Preserve existing header padding/navigation.
- Approved parent-brand files are organized in `apps/web/public/brand/`. Use the original lotus SVG alongside the Comfortaa wordmark for responsive website branding, the supplied ICO for browser fallback, blue-background PNGs for touch/application icons, and the approved 1200×630 PNG for social sharing. Preserve the artwork's colors, aspect ratio and clear space; do not generate substitutes. See [the asset audit](BRAND_ASSETS.md) for source mappings and unused files.
- Product icons may extend the lotus visual language while being distinct.
- Supplied source bundles are archived outside the website at `assets/brand-source/uselotuz/` and `assets/brand-source/inventory/`. Only selected production files belong in `apps/web/public/brand/`; do not publish the source archives or use Inventory artwork for parent-brand placements.
- Use consistent Lucide icon sizing/strokes for interface actions; avoid emojis as interface icon substitutes.

## Responsive and themes

Design for desktop, tablet and mobile. **Light mode first**; dark mode is a possible later enhancement. Use semantic tokens so themes can be added without rewriting component styles.

## Frontend Design Inspiration & Animations

Use the following websites as inspiration for modern, polished SaaS frontend experiences:

- **Mixpanel:** https://mixpanel.com/home/
- **Superwall:** https://superwall.com/solutions/agencies

Use these as quality references, not designs to copy. Maintain Lotuz's original branding and design tokens.

### Design Guidelines

- Clean, premium layouts with excellent typography, spacing, and subtle gradients.
- Smooth scroll-triggered animations, transitions, and hover effects.
- Modern product showcases, interactive cards, and engaging hero sections.
- Use CSS transitions or Motion for React for simple animations; GSAP only when advanced animations are necessary.
- Keep animations subtle, performant, accessible, and respectful of reduced-motion preferences.
- Prioritize visual polish on marketing pages and speed, clarity, and productivity in SaaS dashboards.
- Avoid unnecessary dependencies, excessive animations, and generic-looking interfaces.

## Design review checklist

Check token use, consistency with shared components, readability/contrast, responsive behavior, keyboard interaction, loading/empty/error states and consistency with existing product screens.

Technology selection and repository architecture are defined in `ARCHITECTURE.md`; this file defines visual behavior only.
