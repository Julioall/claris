# Architecture

Atualizado em `2026-04-01`.

## Visao Geral

O projeto esta organizado em duas camadas principais:

- frontend React + TypeScript em `src/`
- backend Supabase em `supabase/` com schema, RLS e Edge Functions

O objetivo da arquitetura atual e manter o shell da aplicacao pequeno, empurrar regra de negocio para slices de dominio no frontend e concentrar integracoes sensiveis e fluxos multi-etapa nas Edge Functions.

## Frontend

### Shell global

- `src/App.tsx` ficou fino e apenas monta `AppProviders` e `AppRouter`
- `src/app/providers/` concentra providers globais
- `src/app/routes/` concentra roteamento, guards e lazy loading
- `src/pages/` ficou reservado ao shell publico (`Index`, `Login`, `NotFound`)

### Slices de dominio

Cada dominio vive em `src/features/<dominio>/` e pode expor:

- `api/` para queries, mutations e acesso a Edge Functions
- `components/` para UI especifica do dominio
- `hooks/` para estado e comportamento do dominio
- `pages/` para adaptadores de rota
- `types.ts` para contratos do dominio

Os slices ativos hoje incluem `auth`, `courses`, `students`, `tasks`, `agenda`, `dashboard`, `claris`, `messages`, `campaigns`, `background-jobs`, `services`, `settings`, `reports`, `admin`, `whatsapp`.

### Fronteira de dados

O frontend usa Supabase apenas dentro das camadas de fronteira:

- `src/features/**/api`
- `src/features/auth/application` e `src/features/auth/infrastructure`
- hooks transversais explicitamente aceitos, como telemetria e sessao
- `src/components/ui/api/` para primitives compartilhadas que precisam de lookup leve

`pages/` e `components/` nao devem importar `@/integrations/supabase/client` diretamente. O guardrail automatizado fica em `scripts/check-supabase-boundary.mjs` e roda no CI via `npm run guard:supabase-boundary`.

### Estado e cache

- TanStack Query e a fonte padrao de server state
- query keys vivem com o dominio que as consome
- carregamentos pesados e sincronizacoes passaram para hooks/repositorios do slice
- invalidacao substitui parte relevante do antigo controle manual com `useState` e `useEffect`

### TypeScript

O endurecimento planejado foi concluido em etapas:

- `strictNullChecks: true`
- `noImplicitAny: true`
- `noUnusedLocals: true`
- `strict: true` no app

Novos contratos devem nascer no slice do dominio. O antigo barrel central de tipos nao faz mais parte da convencao.

## Backend

### Banco e RLS

- schema e migrations ficam em `supabase/`
- policies e convencoes de acesso estao documentadas em [SUPABASE_RLS.md](./SUPABASE_RLS.md)
- tipos do banco sao regenerados em `src/integrations/supabase/types.ts` e espelhados para `supabase/functions/_shared/db/generated.types.ts`

### Edge Functions

As Edge Functions seguem um runtime compartilhado em `supabase/functions/_shared/` com:

- `http/` para handler, CORS e respostas padronizadas
- `db/` para clients e tipos
- `validation/` para parsing de payload
- modulos de dominio em `_shared/domain/`

O padrao preferencial e:

- `index.ts` fino
- `payload.ts` para contrato de entrada
- services/repositories/mappers em `_shared/` ou no dominio da function

Mais detalhes estao em [EDGE_FUNCTIONS.md](./EDGE_FUNCTIONS.md).

## Seguranca e sessao

- a autenticacao primaria do app continua em Supabase Auth
- a sessao Moodle fica encapsulada no slice `features/auth`
- tokens de terceiros que controlam integracoes estruturais devem permanecer no backend ou em `app_settings` consumido por Edge Functions
- o frontend deve atuar como cliente autenticado, nao como orquestrador de segredos de terceiros

Na pratica:

- LLM provider e chave ficam em configuracao global consumida server-side
- operacoes de WhatsApp e disparos em massa passam por Edge Functions
- tokens Moodle continuam disponiveis apenas para fluxos do tutor autenticado e encapsulados no dominio de auth

## Ambiente local

O ambiente local foi dividido em dois niveis:

- `docker-compose.yml`: stack base do Supabase local
- `docker-compose.dev.yml`: frontend Vite e Evolution API para desenvolvimento integrado

Isso permite rodar:

- somente backend local para smoke e migrations
- stack completa para desenvolvimento manual

## Onde fica cada regra de negocio

- regras academicas e de acompanhamento: `src/features/students`, `src/features/courses`, `src/features/tasks`, `src/features/agenda`
- sessao, sincronizacao Moodle e risco: `src/features/auth`
- configuracao e operacao administrativa: `src/features/admin`, `src/features/settings`, `src/features/services`
- chat, sugestoes e historico da Claris: `src/features/claris`
- fluxos multi-etapa, integracoes externas e efeitos colaterais relevantes: Edge Functions em `supabase/functions`

## Leitura complementar

- [README.md](./README.md)
- [FRONTEND_MODULES.md](./FRONTEND_MODULES.md)
- [auth-architecture.md](./auth-architecture.md)
