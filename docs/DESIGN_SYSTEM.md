# Modulity Design-System Primitives

## Purpose

The design-system layer provides **presentation-only** React primitives that feature code composes into user interfaces. It is intentionally small and does not replace FormRenderer, the Calendar Engine, or any business capability.

## Boundary

- Presentation only — no Firebase imports, no business state, no authorization.
- One public boundary: `src/design-system/index.js`.
- Dependency direction: `features` → `design-system` → `shared/presentation`.

## Primitive Inventory

| Primitive   | Path                                      | Notes |
|-------------|-------------------------------------------|-------|
| Select      | `src/design-system/components/Select`     | Generic controlled `<select>` wrapper with label, error, helper text. |
| Textarea    | `src/design-system/components/Textarea`   | Generic controlled `<textarea>` wrapper. |
| Table       | `src/design-system/components/Table`     | Low-level semantic table pieces: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`. |
| DataGrid    | `src/design-system/components/DataGrid`   | Higher-level dataset view over `columns` / `rows`. Supports loading, empty, error, row click, optional sorting. |
| Pagination  | `src/design-system/components/Pagination` | Generic previous/next page controls. Cursor logic stays in features/services. |
| Toast       | `src/design-system/components/Toast`    | Transient UI feedback via `ToastProvider` + `useToast`. Not a notification system. |
| FileUpload  | `src/design-system/components/FileUpload` | File selection UI only. No upload or canonical attachment persistence. |
| Tabs        | `src/design-system/components/Tabs`     | Generic accessible tabs with keyboard navigation. |

Existing primitives (`Button`, `Input`, `Label`, `Card`, `Dialog`, etc.) remain in `src/design-system/components/` and continue to be the canonical versions.

## Usage Conventions

- Prefer controlled components with explicit `value` / `onChange` props.
- Use `error`, `helperText`, `disabled`, `required` consistently across form primitives.
- Compose `DataGrid` with `Table` internally; do not duplicate table markup.
- Use `Toast` only for transient feedback (saved, submitted, copied, error). Use the future Notification capability for persistent/business notifications.

## Accessibility Expectations

- Semantic HTML (`<table>`, `<select>`, `<textarea>`, `<button>`, ARIA roles).
- Form controls are associated with visible labels (`htmlFor` / `id`).
- Tabs support `ArrowLeft` / `ArrowRight`, `Home`, `End`, active `tabpanel` linkage.
- Focus states use existing Tailwind `focus-visible:ring` tokens.
- Disabled and loading states are visually and semantically conveyed.

## Responsive Expectations

- Primitives use Tailwind utility classes and existing breakpoints.
- `DataGrid` and `Table` consumers should wrap overflow with `overflow-x-auto` where needed.
- `Pagination`, `Tabs`, `Select`, and `FileUpload` remain usable on mobile widths.

## FileUpload Limitation

`FileUpload` is a client-side presentation primitive. It selects files and exposes them to the feature layer. It does **not** upload to Firebase Storage, create canonical File/Attachment/Document records, or act as a security boundary.

## Migrated Representative UI

- `EntityListPage` — now uses `Select`, `DataGrid`, and `Pagination`.
- `EntityFormPage` — lifecycle status uses `Select`.
- `ModuleDesigner` — description uses `Textarea`.
- `ModuleCapabilitiesPanel` — capability field mapping uses `Select`.
- `WorkspaceResetPanel` — success state uses `Toast` via global `ToastProvider`.
