# Auth Module Architecture

## Objective

The old `AuthContext` had become a monolithic entry point for:

- authentication and logout
- local session persistence
- Moodle integration details
- initial and incremental course sync
- sync progress UI state
- risk recalculation
- system notifications

That made unit testing, reuse, and regression control harder than necessary.

This refactor keeps the public `useAuth()` API compatible, but moves the implementation to a feature slice closer to a light Clean Architecture / Onion Architecture style.

## Current Slice

```text
src/features/auth/
  application/
    risk.service.ts
    system-notification.service.ts
  context/
    MoodleSessionContext.tsx
  domain/
    session.ts
    sync.ts
  hooks/
    useAuthSession.ts
    useCourseSync.ts
  infrastructure/
    course-sync.service.ts
    moodle-api.ts
    session-storage.ts
```

## Responsibility Split

### Presentation / composition

- `src/contexts/AuthContext.tsx`
  - only composes hooks and exposes the legacy `useAuth()` contract
- `src/features/auth/context/MoodleSessionContext.tsx`
  - dedicated access point for Moodle session consumers

### Application

- `src/features/auth/hooks/useAuthSession.ts`
  - login / logout
  - auth bootstrap from Supabase
  - local session hydration
  - authenticated state
- `src/features/auth/hooks/useCourseSync.ts`
  - initial sync
  - incremental sync
  - sync progress tracking
  - orchestration of risk update and notifications
- `src/features/auth/application/risk.service.ts`
  - course risk recalculation
  - fallback from course RPC to student RPC
- `src/features/auth/application/system-notification.service.ts`
  - writes sync lifecycle notifications

### Infrastructure

- `src/features/auth/infrastructure/session-storage.ts`
  - sessionStorage load/save/clear
- `src/features/auth/infrastructure/moodle-api.ts`
  - Moodle auth edge call
  - edge HTTP calls with timeout
  - auth headers / publishable key / bearer token
  - function error parsing
- `src/features/auth/infrastructure/course-sync.service.ts`
  - course resolution
  - batched student/activity/grade sync execution

### Domain

- `src/features/auth/domain/session.ts`
  - `MoodleSession`, stored session, session context
- `src/features/auth/domain/sync.ts`
  - sync entities, step state, sync progress model

## Mapping From The Old AuthContext

- `AuthProvider`: now only composition
- `login/logout`: `useAuthSession`
- `user session / authenticated state`: `useAuthSession`
- `Moodle session`: `MoodleSessionContext` + `useMoodleSession()`
- `sync of courses/students/incremental`: `useCourseSync` + `course-sync.service.ts`
- `progress tracking`: `useCourseSync` + `domain/sync.ts`
- `risk recalculation`: `risk.service.ts`
- `notification creation`: `system-notification.service.ts`
- `invokeMoodleWithTimeout` and edge auth headers: `infrastructure/moodle-api.ts`

## Practical Rules

- New UI that only needs Moodle credentials should prefer `useMoodleSession()` instead of `useAuth()`.
- New sync behavior should be added in `useCourseSync` or its supporting services, not in `AuthContext.tsx`.
- New persistence logic belongs in `session-storage.ts`, not in hooks or components.
- New Moodle edge calls should be centralized in `moodle-api.ts` when they share timeout/auth/error behavior.

## Test Strategy

The refactor keeps integration coverage around `AuthContext`, and adds focused unit tests for extracted services:

- `src/features/auth/__tests__/moodle-api.test.ts`
- `src/features/auth/__tests__/risk.service.test.ts`

This keeps the provider covered end-to-end while also testing the new seams directly.
