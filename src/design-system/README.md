# Modulity 2.0 — Design System

This folder contains the shared design system for Modulity 2.0.

## Tokens

- `tokens.js` — single source of truth for colors, spacing, typography, radius, shadows, breakpoints and semantic states.
- Consumed by `tailwind.config.js`.
- No component should use hardcoded values; always reference tokens via Tailwind utilities.

## Reusable Primitives (future)

Planned components:

- Button
- Input
- Select
- Checkbox
- Radio
- Textarea
- DatePicker
- FileUpload
- Dialog
- Drawer
- Card
- Badge
- Tabs
- Table
- DataGrid
- Pagination
- Toolbar
- Dropdown
- Toast
- EmptyState
- LoadingState
- ErrorState

## Rules

- No business logic in design-system components.
- Components must be accessible (`aria-label`, `alt`, keyboard nav).
- Mobile-first responsive behavior.
- Components are configured via props, not module-specific code.
