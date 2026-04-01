# Frontend Modules

Atualizado em `2026-04-01`.

Este documento descreve a modularizacao atual do frontend, com foco em fronteiras de dominio e manutencao incremental.

## Objetivos

- reduzir acoplamento entre `pages`, `components`, `contexts` e `lib`
- manter `src/app/` para shell global e roteamento
- concentrar regra de negocio e acesso a dados por dominio
- manter `src/components/ui/` como camada de primitives genericas

## Estrutura Alvo

```text
src/
  app/
    providers/
    routes/
  features/
    <dominio>/
      api/
      application/       # quando fizer sentido
      components/
      hooks/
      pages/             # adaptadores de rota, quando houver
      infrastructure/    # quando fizer sentido
      types.ts
  components/
    ui/
  integrations/
  lib/
  pages/
  hooks/
```

## Regras de Fronteira

- `src/app/` concentra providers globais e composicao de rotas.
- `src/features/<dominio>/api` concentra acesso a Edge Functions, Supabase e repositorios do dominio.
- `src/features/<dominio>/hooks` expoe hooks de dominio.
- `src/features/<dominio>/types.ts` e a fonte primaria de contratos de tipo.
- `src/components/ui/` nao deve carregar regra de negocio.
- `src/pages/` deve ficar restrito ao shell publico.
- UI de runtime nao deve importar `@/integrations/supabase/client` diretamente.

## Estado Atual (Resumo)

- `src/app/` concentra providers e roteamento principal.
- `src/pages/` ficou no shell publico (`Index`, `Login`, `NotFound`).
- Slices ativos em `src/features/`:
  - `admin`
  - `agenda`
  - `auth`
  - `background-jobs`
  - `campaigns`
  - `claris`
  - `courses`
  - `dashboard`
  - `messages`
  - `reports`
  - `services`
  - `settings`
  - `students`
  - `tasks`
  - `whatsapp`
- O guardrail de fronteira de dados segue em `scripts/check-supabase-boundary.mjs` (`npm.cmd run guard:supabase-boundary`).

## Sequencia Recomendada Para Evolucao

1. manter `App.tsx` fino (apenas composicao de providers e router)
2. implementar novas features direto em `src/features/<dominio>/...`
3. consolidar acesso a dados em `api/application/infrastructure`
4. manter contratos no slice e evitar barrels globais de tipos
5. remover wrappers legados conforme imports antigos desaparecerem

## Fora de Escopo

- migracao big bang de toda a base de uma vez
- centralizar toda a integracao Supabase em um unico refactor
