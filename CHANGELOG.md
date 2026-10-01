# Changelog

All notable changes to Modulity 2.0 will be documented in this file.

## [Unreleased]

### Added

- Step 0: Architecture Blueprint & Project Constitution.
  - Created architecture documentation in `docs/`.
  - Created minimal project scaffolding: Vite + React + Tailwind CSS + ESLint + Prettier + Vitest + Playwright.
  - Defined design system tokens and project structure.
- Step 1: Application Foundation.
  - Centralized configuration loader in `src/infrastructure/config/`.
  - Provider-independent identity contract and Firebase Auth adapter.
  - User model boundary mapping Firebase User to `UserIdentity`.
  - Auth Provider, protected/guest routes, login and registration pages.
  - Responsive authenticated shell with header, sidebar, and mobile drawer.
  - First Design System components: Button, IconButton, Input, PasswordInput, Label, Card, Badge, Alert, Dialog, Drawer, Dropdown, Spinner, LoadingState, ErrorState, EmptyState, PageContainer, PageHeader.
  - Application error model translating provider errors to user-safe messages.
  - Unit tests for configuration, identity mapping, auth state, protected routes, form validation, and Design System primitives.
  - GitHub Actions CI workflow running install, lint, test, and build.

### Notes

- No Modulity V1 code imported.
- Organization, modules, records, ledger, agents, billing checkout, widgets, and reports are intentionally out of scope for Step 1.
