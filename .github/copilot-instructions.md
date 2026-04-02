# Copilot Instructions

## Project Overview

**Claris** is a React + TypeScript web application for tutors and academic monitors to track students and courses from Moodle. All follow-up records, notes, pending tasks, and risk status are persisted in Supabase.

## Product Maturity

The project is still in active development and should not be treated as a production system with a consolidated active user base.

When proposing or implementing changes:
- Do not assume high production scale or large active-user traffic patterns.
- Avoid premature complexity driven by hypothetical scale.
- Prefer incremental, maintainable solutions aligned with current development-stage constraints.
- Explicitly document assumptions when a decision depends on future real-user validation.

The project is a full-stack educational management platform with:
- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui (Radix UI components)
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **State management**: TanStack Query v5
- **Routing**: React Router v6

## Build, Test, and Lint

```bash
# Install dependencies
npm ci

# Run development server
npm run dev

# Build for production
npm run build

# Lint
npm run lint

# Supabase boundary guard
npm run guard:supabase-boundary

# Typecheck
npm run typecheck

# Run tests (single run)
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

Tests use **Vitest** with `@testing-library/react`. Test files live alongside the frontend code and use the setup in `src/test/setup.ts`.

## Architecture

```text
src/
  app/                  # global providers, route groups, guards, lazy pages
  components/
    ui/                 # generic primitives only
  contexts/             # public composition roots such as AuthContext
  features/             # domain slices
  hooks/                # cross-domain or shell-level hooks only
  integrations/         # external clients and generated integration types
  lib/                  # shared utilities that are not owned by a domain slice
  pages/                # public shell pages only (Index, Login, NotFound)
  App.tsx
  main.tsx

supabase/
  functions/            # Edge Functions (Deno runtime)
```

### Auth Module
- `src/contexts/AuthContext.tsx` remains the public composition root for auth-related UI state.
- The auth slice lives under `src/features/auth/` and owns session, Moodle credentials, sync orchestration, timeout/error handling, and risk recalculation.
- UI that only needs Moodle credentials should prefer `useMoodleSession()` from `src/features/auth/context/MoodleSessionContext.tsx`.

### App Shell
- `src/app/providers/` owns app-wide providers and global shell composition.
- `src/app/routes/` owns route groups, route guards, lazy page loading, and router setup.
- Keep `src/App.tsx` thin; it should wire `AppProviders` and `AppRouter`, not define business rules.

### Feature Modules
- Prefer `src/features/<domain>/...` for new domain work instead of adding more logic to `src/pages/`, `src/hooks/`, `src/services/`, or `src/lib/`.
- Reference slices already live under `src/features/agenda/`, `src/features/auth/`, `src/features/automations/`, `src/features/claris/`, `src/features/courses/`, `src/features/dashboard/`, `src/features/messages/`, `src/features/reports/`, `src/features/services/`, `src/features/settings/`, `src/features/students/`, `src/features/tasks/`, `src/features/whatsapp/`, and `src/features/admin/`.
- `src/pages/` is reserved for public shell pages, and `src/hooks/` should stay limited to truly cross-domain hooks or shell concerns.
- Keep domain contracts inside `src/features/<domain>/types.ts`; do not recreate a shared compatibility barrel under `src/types/`.
- For staged continuity and maintenance follow-up, consult `docs/FRONTEND_REFACTOR_PLAN.md`, `docs/SUPABASE_CONSOLIDATION_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/EDGE_FUNCTIONS.md`, and `docs/DECISIONS/`.

## Coding Conventions

### TypeScript
- Prefer explicit types over `any`.
- Use the `@/` path alias for `src/` imports.
- Prefer domain types from `src/features/<domain>/types.ts`.
- Supabase database types are auto-generated in `src/integrations/supabase/types.ts`; do not manually edit this file.

### React Components
- Functional components only with hooks.
- Use shadcn/ui components as building blocks and extend them with Tailwind utilities via `cn()` from `@/lib/utils`.
- Component files use PascalCase.

### Data Fetching
- Use **TanStack Query** for server state.
- Prefer domain hooks in `src/features/<domain>/hooks/`.
- Keep auth/session/sync integration logic in `src/features/auth/` instead of growing `AuthContext.tsx`.
- Do not add `supabase.from(...)` or `supabase.functions.invoke(...)` directly inside feature pages or UI components when the domain already has a slice; prefer `api/`, `application/`, `infrastructure/`, and domain hooks.
- Import the Supabase client from `@/integrations/supabase/client` only inside the data boundary or explicit cross-domain exceptions.
- Run `npm run guard:supabase-boundary` after moving data access to keep the UI boundary clean.

### Styling
- Use Tailwind CSS utility classes and `cn()` from `@/lib/utils` for conditional class merging.
- Design tokens and theme customisation live in `tailwind.config.ts`.
- Dark mode is supported via `next-themes`.

### Forms
- Use `react-hook-form` with `zod` schema validation via `@hookform/resolvers/zod`.

### Edge Functions
- Edge Functions are written in TypeScript for the **Deno** runtime.
- They live in `supabase/functions/<function-name>/index.ts`.
- Use `npm run smoke:edge` to test them locally before pushing.

## Domain Glossary

| Term (PT) | Meaning |
|-----------|---------|
| Aluno | Student |
| Tutor / Monitor | Academic tutor or teaching assistant |
| Pendencia | Pending task or unresolved activity |
| Acao | Registered intervention (contact, meeting, etc.) |
| Risco | Risk classification of a student's academic status |
| Sincronizacao | Data sync from Moodle to Supabase |

### Risk Levels

| Level | Colour | Meaning |
|-------|--------|---------|
| `normal` | Green | No issues identified |
| `atencao` | Yellow | Warning signs, requires monitoring |
| `risco` | Orange | Concerning situation, intervention needed |
| `critico` | Red | Urgent situation, immediate action required |

## Data Sources

| Source | Responsibility |
|--------|---------------|
| **Moodle** | Courses, students, activities (primary source) |
| **Supabase** | Follow-up data, pending tasks, risk history, and Moodle cache |

If a Moodle sync fails, use the cached data in Supabase and indicate that it is stale.

## Key Environment Variables

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

For local Docker-based development, see `docker-compose.yml` and `docker-compose.dev.yml` for the versioned defaults used by the stack.

## CI/CD

The CI pipeline (`.github/workflows/ci.yml`) runs on every push or PR to `main`:
1. **Supabase Boundary** - `npm run guard:supabase-boundary`
2. **Lint** - `npm run lint`
3. **Test** - `npm run test`
4. **Typecheck** - `npm run typecheck`
5. **Build** - `npm run build`
6. **Deploy** - GitHub Pages deployment on `main` push

Edge Function smoke tests (`.github/workflows/edge-smoke.yml`) gate Supabase deployments.

## Versioning

When implementing changes, always update the project version in `package.json` according to semantic versioning:

- `patch` (`x.y.Z`): bug fixes, refactors without behavior changes, or internal maintenance.
- `minor` (`x.Y.z`): backward-compatible new features or meaningful behavior enhancements.
- `major` (`X.y.z`): breaking changes, removals, or incompatible contract changes.

Do not skip version bump when code is changed for implementation work.
