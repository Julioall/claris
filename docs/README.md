# Docs Index

Atualizado em `2026-04-01`.

Este indice organiza os documentos principais do projeto por assunto.

## Visao Geral

- [CLARIS.md](./CLARIS.md): visao funcional do produto, dominio e fluxos.
- [ARCHITECTURE.md](./ARCHITECTURE.md): arquitetura geral frontend + Supabase.

## Frontend

- [FRONTEND_MODULES.md](./FRONTEND_MODULES.md): convencoes de modularizacao por dominio.
- [auth-architecture.md](./auth-architecture.md): arquitetura do slice de autenticacao.

## Backend (Supabase)

- [EDGE_FUNCTIONS.md](./EDGE_FUNCTIONS.md): padroes de Edge Functions e operacao.
- [SUPABASE_RLS.md](./SUPABASE_RLS.md): postura canonica de RLS por dominio.

## Integracao Moodle

- [MOODLE_API.md](./MOODLE_API.md): referencia da integracao Moodle (mantido separadamente).

## Decisoes Arquiteturais

- [DECISIONS/ADR-001-frontend-domain-boundaries.md](./DECISIONS/ADR-001-frontend-domain-boundaries.md)
- [DECISIONS/ADR-002-local-compose-split.md](./DECISIONS/ADR-002-local-compose-split.md)
- [DECISIONS/ADR-003-public-build-repository.md](./DECISIONS/ADR-003-public-build-repository.md)
- [DECISIONS/ADR-004-browser-edge-auth.md](./DECISIONS/ADR-004-browser-edge-auth.md)

## Leitura Recomendada

1. Comeco rapido: `CLARIS.md` e `ARCHITECTURE.md`.
2. Implementacao frontend: `FRONTEND_MODULES.md` e `auth-architecture.md`.
3. Backend e seguranca: `EDGE_FUNCTIONS.md` e `SUPABASE_RLS.md`.
