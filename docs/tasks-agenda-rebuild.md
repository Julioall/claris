# Tarefas & Agenda — Architecture Document

## Overview

This document describes the architecture of the **Tarefas** (Tasks) and **Agenda** (Calendar Events) modules added to Claris. Both modules are fully functional, persisted in Supabase, and follow the existing React + TanStack Query + shadcn/ui patterns.

---

## Database Schema

### Tasks (`public.tasks`)

Represents an operational task managed by a tutor or monitor.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `title` | text | Task title (required) |
| `description` | text | Optional description |
| `status` | text | `todo` \| `in_progress` \| `done` |
| `priority` | text | `low` \| `medium` \| `high` \| `urgent` |
| `assigned_to` | uuid | FK → `auth.users` |
| `created_by` | uuid | FK → `auth.users` |
| `due_date` | date | Optional due date |
| `project_id` | uuid | Reserved for future Projects feature |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Auto-updated via trigger |

### Task Comments (`public.task_comments`)

Thread of comments on a task, ordered chronologically.

### Task History (`public.task_history`)

Audit log of field changes. Tracked fields: `title`, `description`, `status`, `priority`, `assigned_to`, `due_date`. Each change records `old_value`, `new_value`, `changed_by`, and `created_at`.

### Tag System (`public.tags` + `public.task_tags`)

Tags are reusable across tasks. They support:

- **Free-text tags**: `label` only, `entity_type = 'custom'`
- **Entity-linked tags**: Linked to a Claris entity (`aluno`, `uc`, `curso`, `turma`) via `prefix`, `entity_id`, and `entity_type`

The `task_tags` join table is a many-to-many relation between tasks and tags.

### Calendar Events (`public.calendar_events`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `title` | text | Event title |
| `description` | text | Optional description |
| `start_at` | timestamptz | Start datetime (required) |
| `end_at` | timestamptz | Optional end datetime |
| `type` | text | `manual` \| `webclass` \| `meeting` \| `alignment` \| `delivery` \| `other` |
| `owner` | uuid | FK → `auth.users` |
| `external_source` | text | `manual` \| `teams` \| `future_sync` |
| `external_provider` | text | Reserved for future Teams/OAuth integration |
| `external_event_id` | text | External system event ID |
| `sync_status` | text | `none` \| `synced` \| `pending` \| `error` |
| `last_sync_at` | timestamptz | Last sync timestamp |

---

## Tag System

The `TagInput` component (`src/components/ui/TagInput.tsx`) provides an interactive tag experience:

### Free-text tags
Type any text and press **Enter** or **,** to add a custom tag.

### Entity-linked tags
Type `/` to see available prefixes:
- `/uc` — links to a Unidade Curricular (course)
- `/aluno` — links to a student
- `/turma` — links to a class group
- `/curso` — links to a course

After selecting a prefix (e.g., `/aluno:`), the component fetches matching entities from Supabase and shows them as suggestions. Selecting one creates a tag with `entity_id`, `entity_type`, and `prefix` populated.

Tags are persisted via `findOrCreateTag()` — deduplication is done by `label` + `entity_id`.

---

## Architecture Decisions

### Service Layer (`src/services/`)
Business logic and Supabase calls are separated into service files:
- `tasks.service.ts` — CRUD for tasks, comments, history, and tags
- `calendar.service.ts` — CRUD for calendar events

Services use `as never` / `as any` casts to bypass the auto-generated Supabase types (which don't include the new tables). This avoids modifying the auto-generated `types.ts`.

### Hooks (`src/hooks/`)
- `useTasks()` — list, create, update, delete tasks with optimistic invalidation
- `useTaskDetail(taskId)` — comments, history, and tags for a single task
- `useCalendarEvents(from?, to?)` — list, create, update, delete calendar events

All hooks use TanStack Query v5 patterns (`useQuery`, `useMutation`, `useQueryClient`).

### Components
```
src/components/
├── tasks/
│   ├── TaskCard.tsx          — Task list item with inline checkbox
│   ├── TaskForm.tsx          — Create/edit form (react-hook-form + zod)
│   └── TaskDetailDrawer.tsx  — Side drawer with comments, history, tags
└── agenda/
    ├── CalendarEventCard.tsx — Event list item with type icon
    └── CalendarEventForm.tsx — Create/edit form (react-hook-form + zod)
```

### Pages
- `src/pages/Tarefas.tsx` — Full task management page with status/priority filters
- `src/pages/Agenda.tsx` — Calendar events grouped by time period

---

## Future Roadmap

### Projects Feature
The `project_id` column on `tasks` is reserved. A future `projects` table will allow grouping tasks by academic project.

### Microsoft Teams Integration
`calendar_events` already has `external_provider`, `external_event_id`, `sync_status`, and `last_sync_at` columns. A future Supabase Edge Function can sync Teams calendar events using the Microsoft Graph API, setting `external_source = 'teams'`.

### Tag Autocomplete Enhancement
The `TagInput` currently fetches from `students` and `courses`. Future iterations can:
- Add `turma` (class group) lookups
- Cache frequently used tags client-side
- Allow tag color customization

### Task Assignment
The `assigned_to` field exists in the schema. The UI can be extended to show a user picker once a team/members model is defined.
