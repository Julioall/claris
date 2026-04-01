# Auth Module Architecture

Atualizado em `2026-04-01`.

## Objetivo

O modulo de autenticacao foi dividido para evitar que `AuthContext` continue como ponto monolitico de regra de negocio.

Hoje o objetivo e:

- manter a API publica de `useAuth()` estavel
- isolar sessao Moodle e sincronizacao no slice `features/auth`
- melhorar testabilidade e evolucao incremental do dominio

## Estrutura Atual

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

## Responsabilidades

### Composicao de UI

- `src/contexts/AuthContext.tsx`: composicao publica e compatibilidade de contrato (`useAuth()`).
- `src/features/auth/context/MoodleSessionContext.tsx`: acesso focado para consumidores de credencial Moodle.

### Aplicacao

- `useAuthSession.ts`: login, logout, bootstrap de sessao e estado autenticado.
- `useCourseSync.ts`: sync inicial/incremental, progresso e orquestracao com risco/notificacoes.
- `risk.service.ts`: recalculo de risco por curso/aluno.
- `system-notification.service.ts`: eventos de notificacao de sync.

### Infraestrutura

- `session-storage.ts`: persistencia local de sessao.
- `moodle-api.ts`: chamadas Edge para Moodle com timeout, auth headers e parsing de erro.
- `course-sync.service.ts`: sincronizacao em lote de cursos/alunos/atividades/notas.

### Dominio

- `domain/session.ts`: contratos de sessao Moodle.
- `domain/sync.ts`: entidades de progresso e etapas de sincronizacao.

## Regras Praticas

- Se a UI so precisa de credenciais Moodle, usar `useMoodleSession()`.
- Nova regra de sync deve entrar em `useCourseSync` ou servicos de suporte.
- Persistencia local deve ficar em `session-storage.ts`.
- Chamadas Moodle compartilhadas devem ficar em `moodle-api.ts`.

## Cobertura de Testes

Cobertura atual recomendada:

- testes integrados no contexto publico (`AuthContext`)
- testes unitarios de servicos extraidos do slice, principalmente API Moodle e calculo de risco
