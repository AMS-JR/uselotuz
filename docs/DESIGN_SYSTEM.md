# UseLotuz — Design System

## Purpose

Present one recognizable, minimalist and professional UseLotuz brand across the website and independent SaaS frontends. Product workflows may differ; visual foundations should remain consistent. The shared component implementation lives in `packages/ui` when created.

## Brand tokens

| Semantic token | Light-mode value | Usage |
| --- | --- | --- |
| Primary | `#2563EB` | Lotus brand blue, primary actions and links |
| Primary hover | `#1D4ED8` | Interactive hover |
| Background | `#F8FAFC` | Page background |
| Surface | `#FFFFFF` | Cards, forms and dialogs |
| Text primary | `#0F172A` | Main content |
| Text secondary | `#64748B` | Supporting content |
| Border | `#E2E8F0` | Dividers and outlines |
| Success | `#16A34A` | Positive states |
| Warning | `#D97706` | Caution states |
| Error | `#DC2626` | Error/destructive states |

Implement semantic tokens in the shared theme rather than scattering hex values across components. Check text/control contrast and keyboard focus visibility, especially for status colors.

## Typography and spacing

- Choose **Inter or Geist** at implementation time and use consistently; choice is still TBD.
- Clear heading hierarchy, readable body sizes and line heights; avoid decorative typography.
- Follow Tailwind's spacing scale with consistent content widths and form spacing.
- Suggested radius: **8px** for common controls, **12px** for cards; adjust via shared tokens, not per-app overrides.

## Shared components

Create reusable buttons, inputs, selects, forms, dialogs, tables, cards, notifications, navigation, pagination, loading and empty states as needed. Use the selected shadcn/ui primitives and Lucide React icons through the shared UI approach; avoid competing component libraries or duplicated app-specific versions without a reason.

Components should support keyboard navigation, accessible labels, useful focus states and responsive layouts. Tables may scroll horizontally or use an appropriate compact mobile presentation.

## Brand assets

- Use the approved blue lotus icon for the parent UseLotuz identity, with appropriate clear space and without unnecessary text in icon-only placements.
- Product icons may extend the lotus visual language while being distinct.
- Use consistent Lucide icon sizing/strokes for interface actions; avoid emojis as interface icon substitutes.

## Responsive and themes

Design for desktop, tablet and mobile. **Light mode first**; dark mode is a possible later enhancement. Use semantic tokens so themes can be added without rewriting component styles.

## Design review checklist

Check token use, consistency with shared components, readability/contrast, responsive behavior, keyboard interaction, loading/empty/error states and consistency with existing product screens.

Technology selection and repository architecture are defined in `ARCHITECTURE.md`; this file defines visual behavior only.
