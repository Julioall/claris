# ADR-001: Frontend por dominio e fronteira de dados

Data: `2026-04-01`
Status: Aceita

## Contexto

O frontend cresceu inicialmente por pastas tecnicas e concentrou regras em `App.tsx`, `pages/`, `contexts/` e `lib/`. Isso aumentou acoplamento e tornou regressao dificil de prever.

## Decisao

Adotar:

- shell global em `src/app/`
- dominios em `src/features/<dominio>/`
- `src/components/ui/` apenas para primitives genericas
- acesso ao Supabase apenas nas fronteiras `api/`, `application/`, `infrastructure/` e excecoes documentadas

## Consequencias

- `App.tsx` e o roteamento principal ficam pequenos
- tipos passam a morar perto do dominio
- React Query pode ser padronizado por slice
- pages e components deixam de carregar SQL-like queries inline

## Reforco operacional

O repositorio passa a validar essa decisao com `npm run guard:supabase-boundary`.

## Referencias

- `docs/ARCHITECTURE.md`
- `docs/FRONTEND_MODULES.md`
- `docs/auth-architecture.md`
