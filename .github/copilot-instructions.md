# Copilot Instructions

## Project Overview

**Claris** is a React + TypeScript web application for tutors and academic monitors to track students and courses from Moodle. All follow-up records (actions, notes, pending tasks, risk status) are persisted in Supabase.

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

# Run tests (single run)
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

Tests use **Vitest** with `@testing-library/react`. Test files live in `src/__tests__/` and use the test setup in `src/test/setup.ts`.

## Architecture

```
src/
├── components/         # Reusable UI components
│   ├── dashboard/      # Dashboard-specific components
│   ├── layout/         # App layout (AppLayout, AppSidebar, TopBar)
│   └── ui/             # shadcn/ui + custom primitives (RiskBadge, StatCard, etc.)
├── contexts/           # React contexts (AuthContext)
├── hooks/              # Custom React hooks (useCoursesData, useDashboardData, etc.)
├── integrations/
│   └── supabase/       # Supabase client and auto-generated types
├── lib/                # Utilities (utils.ts, mock-data.ts)
├── pages/              # Route-level page components
├── types/              # Shared TypeScript interfaces
├── App.tsx             # Root component with router setup
└── main.tsx            # Application entry point

supabase/
└── functions/          # Supabase Edge Functions (Deno runtime)
    ├── moodle-api/     # Moodle LMS integration proxy
    ├── claris-chat/    # AI assistant chat function
    └── claris-llm-test/
```

### Auth Module
- `src/contexts/AuthContext.tsx` remains the public composition root for auth-related UI state.
- The extracted auth slice lives under `src/features/auth/` and owns session, Moodle credentials, sync orchestration, timeout/error handling, and risk recalculation.
- New UI that only needs Moodle credentials should prefer `useMoodleSession()` from `src/features/auth/context/MoodleSessionContext.tsx`.

### App Shell
- `src/app/providers/` owns app-wide providers and global shell composition.
- `src/app/routes/` owns route groups, route guards, lazy page loading, and router setup.
- Keep `src/App.tsx` thin; it should wire `AppProviders` and `AppRouter`, not define business rules.

### Feature Modules
- Prefer `src/features/<domain>/...` for new domain work instead of adding more logic to `src/pages/`, `src/hooks/`, or `src/lib/`.
- `src/features/agenda/`, `src/features/courses/`, `src/features/students/`, and `src/features/tasks/` are the current reference slices for page + hook + repository organization.
- Some legacy files in `src/pages/` and `src/hooks/` may still exist for unmigrated domains, but migrated slices should be imported directly and new logic should not be added there by default.
- For staged continuity, consult `docs/FRONTEND_REFACTOR_PLAN.md` before continuing the frontend modularization work.

## Coding Conventions

### TypeScript
- Strict TypeScript throughout; prefer explicit types over `any`
- Use the `@/` path alias for `src/` imports (e.g., `import { cn } from "@/lib/utils"`)
- Prefer domain types from `src/features/<domain>/types.ts`
- `src/types/index.ts` is a compatibility barrel during migration; do not add new domain contracts there by default
- Supabase database types are auto-generated in `src/integrations/supabase/types.ts` — do not manually edit this file

### React Components
- Functional components only with hooks
- Use shadcn/ui components as building blocks; extend with Tailwind utilities via the `cn()` helper from `@/lib/utils`
- New shadcn components can be added with: `npx shadcn@latest add <component>`
- Component files use PascalCase (e.g., `StudentProfile.tsx`)

### Data Fetching
- Use **TanStack Query** (`useQuery`, `useMutation`) for all server state
- Prefer domain hooks in `src/features/<domain>/hooks/`; keep `src/hooks/` only for truly cross-domain hooks or yet-to-be-migrated domains
- Keep auth/session/sync integration logic in `src/features/auth/` instead of growing `AuthContext.tsx`
- Supabase client is imported from `@/integrations/supabase/client`

### Styling
- Tailwind CSS utility classes; `cn()` from `@/lib/utils` for conditional class merging
- Design tokens and theme customisation are in `tailwind.config.ts`
- Dark mode is supported via `next-themes`

### Forms
- Use `react-hook-form` with `zod` schema validation via `@hookform/resolvers/zod`

### Edge Functions
- Written in TypeScript for the **Deno** runtime
- Located in `supabase/functions/<function-name>/index.ts`
- Use `npm run smoke:edge` to test Edge Functions locally before pushing

## Domain Glossary

| Term (PT) | Meaning |
|-----------|---------|
| Aluno | Student |
| Tutor / Monitor | Academic tutor or teaching assistant |
| Pendência | Pending task or unresolved activity |
| Ação | Registered intervention (contact, meeting, etc.) |
| Risco | Risk classification of a student's academic status |
| Sincronização | Data sync from Moodle to Supabase |

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
| **Supabase** | Follow-up data (actions, notes, pending tasks, risk history) and Moodle cache |

If a Moodle sync fails, use the cached data in Supabase and indicate it is stale.

## Key Environment Variables

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key

See `.env` for local development values (never commit secrets).

## CI/CD

The CI pipeline (`.github/workflows/ci.yml`) runs on every push/PR to `main`:
1. **Lint** — `npm run lint`
2. **Test** — `npm run test`
3. **Build** — `npm run build`
4. **Deploy** — GitHub Pages deployment on `main` push

Edge Function smoke tests (`.github/workflows/edge-smoke.yml`) gate Supabase deployments.
