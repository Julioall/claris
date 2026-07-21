# Frontend Modules

Atualizado em `2026-07-21`.

Este documento descreve a modularizacao atual do frontend, com foco em fronteiras de dominio e manutencao incremental.

## Objetivos

- reduzir acoplamento entre `pages`, `components`, `contexts` e `lib`
- manter `src/app/` para shell global e roteamento
- concentrar comportamento de apresentacao e clientes de API por dominio
- manter regras de negocio e acesso ao banco fora do navegador
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
- `src/features/<dominio>/api` concentra clientes de casos de uso expostos pelas Edge Functions e nao acessa tabelas ou RPCs diretamente.
- `src/features/<dominio>/hooks` expoe hooks de dominio.
- `src/features/<dominio>/types.ts` e a fonte primaria de contratos de tipo.
- `src/components/ui/` nao deve carregar regra de negocio.
- `src/pages/` deve ficar restrito ao shell publico.
- codigo novo no frontend nao deve chamar `supabase.from()` nem `supabase.rpc()`.
- tipos gerados do banco nao devem fazer parte dos DTOs ou view models da apresentacao.
- Supabase Auth e Realtime sao excecoes temporarias apenas por adapters dedicados; elas nao autorizam acesso ao banco.

Essas regras sao definidas na [ADR-005](./DECISIONS/ADR-005-supabase-backend-boundary.md). A validacao client-side existe para UX; regras de permissao, elegibilidade e estado persistido sempre sao revalidadas no backend.

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
- A migracao dos acessos diretos existentes e incremental e esta controlada por [SUPABASE_BACKEND_SEPARATION_PLAN.md](./SUPABASE_BACKEND_SEPARATION_PLAN.md).
- O guardrail de fronteira de dados segue em `scripts/check-supabase-boundary.mjs` (`npm run guard:supabase-boundary`) e sera ampliado conforme o legado for removido.

## Sequencia Recomendada Para Evolucao

1. manter `App.tsx` fino (apenas composicao de providers e router)
2. implementar novas features direto em `src/features/<dominio>/...`
3. expor novos casos de uso por Edge Functions e consumi-los por clientes em `api/`
4. manter contratos no slice e evitar barrels globais de tipos
5. migrar os acessos Supabase inventariados sem alterar contratos de UI desnecessariamente
6. remover wrappers legados e endurecer o guardrail conforme os imports antigos desaparecerem

## Fora de Escopo

- migracao big bang de toda a base de uma vez
- implementar o backend .NET antes de concluir a separacao de responsabilidades no Supabase
