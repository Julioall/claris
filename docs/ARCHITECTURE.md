# Architecture

Atualizado em `2026-07-21`.

## Visao Geral

O projeto esta organizado em duas camadas principais:

- frontend React + TypeScript em `src/`
- backend Supabase em `supabase/` com schema, RLS e Edge Functions

O objetivo da arquitetura intermediaria e manter o shell da aplicacao pequeno, organizar a UI em slices de dominio e concentrar regras de negocio, autorizacao, persistencia e integracoes sensiveis nas Edge Functions. A decisao e os limites dessa transicao estao formalizados na [ADR-005](./DECISIONS/ADR-005-supabase-backend-boundary.md).

## Frontend

### Shell global

- `src/App.tsx` ficou fino e apenas monta `AppProviders` e `AppRouter`
- `src/app/providers/` concentra providers globais
- `src/app/routes/` concentra roteamento, guards e lazy loading
- `src/pages/` ficou reservado ao shell publico (`Index`, `Login`, `NotFound`)

### Slices de dominio

Cada dominio vive em `src/features/<dominio>/` e pode expor:

- `api/` para clientes dos casos de uso expostos pelas Edge Functions
- `components/` para UI especifica do dominio
- `hooks/` para estado e comportamento do dominio
- `pages/` para adaptadores de rota
- `types.ts` para contratos do dominio

Os slices ativos hoje incluem `auth`, `courses`, `students`, `tasks`, `agenda`, `dashboard`, `claris`, `messages`, `campaigns`, `background-jobs`, `services`, `settings`, `reports`, `admin`, `whatsapp`.

### Fronteira de backend

O estado-alvo nao permite `supabase.from()` nem `supabase.rpc()` no frontend. Os slices consomem contratos HTTP independentes do schema do banco, e `api/` representa clientes desses contratos, nao repositories executados no navegador.

Os dominios `dashboard`, `courses`, `students`, `reports`, `tasks`, `agenda`, `messages`, `campaigns`, `whatsapp`, `claris` e os fluxos de sincronizacao/background jobs ja operam por essa fronteira. Na Claris, historico, sugestoes, disponibilidade, chat principal e mensagens Moodle usam DTOs HTTP actor-scoped. Aceitar ou dispensar uma sugestao e uma transacao backend que inclui entidade gerada e cooldown; configuracao do modelo e credenciais Moodle permanecem no servidor. Em comunicacoes, o browser envia apenas intencao e selecao: templates, publico, identidade Moodle, historico, snapshots e transicoes sao autoritativos no backend. Em sincronizacao, o browser envia cursos/entidades e acompanha um DTO; credencial, token renovado, etapas, risco e notificacoes ficam no servidor.

As excecoes temporarias, ambas protegidas por allowlist explicita, sao:

- Supabase Auth encapsulado por `src/integrations/auth/auth-gateway.ts`
- Realtime encapsulado por `src/integrations/realtime/realtime-gateway.ts`, sem consultas ou mutacoes no banco

Os acessos diretos existentes sao legado em migracao conforme [SUPABASE_BACKEND_SEPARATION_PLAN.md](./SUPABASE_BACKEND_SEPARATION_PLAN.md), e nao precedente para codigo novo. O guardrail automatizado atual fica em `scripts/check-supabase-boundary.mjs` e sera endurecido ao longo dessa migracao.

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

As Edge Functions formam a API e a camada de aplicacao do backend Supabase. Elas autenticam e autorizam o ator a partir do token, validam contratos, executam casos de uso e acessam a persistencia. RLS permanece como defesa em profundidade.

As functions seguem um runtime compartilhado em `supabase/functions/_shared/` com:

- `http/` para handler, CORS e respostas padronizadas
- `db/` para clients e tipos
- `validation/` para parsing de payload
- modulos de dominio em `_shared/domain/`

O padrao preferencial e:

- `index.ts` fino
- `payload.ts` para contrato de entrada
- services/repositories/mappers em `_shared/` ou no dominio da function
- DTOs HTTP independentes dos tipos gerados do banco
- RPC PostgreSQL para comandos com varias escritas que precisam ser atomicas

O client HTTP do frontend tambem possui transporte XHR encapsulado para uploads com progresso. Assim, nem mesmo fluxos de midia precisam ler sessao, API key ou URL do Supabase dentro de uma feature.

Processos longos usam `background_jobs` como modelo operacional. O service cria uma requisicao idempotente, um worker server-side assume o estado `pending`, persiste progresso por item e conclui em `completed`, `failed` ou `cancelled`. Services recebem runtime/repository por injecao; contratos e regras de aplicacao nao dependem do SDK Supabase, deixando persistencia e integracoes substituiveis por adaptadores futuros, inclusive uma API .NET.

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

## Onde fica cada responsabilidade

- apresentacao, interacao, cache e estado de tela: slices em `src/features/<dominio>`
- contratos de transporte e query keys: `api/` e hooks do respectivo slice
- regras academicas, autorizacao, sincronizacao, configuracao e demais casos de uso: Edge Functions e modulos server-side de dominio
- transacoes atomicas: funcoes PostgreSQL chamadas pelo backend
- acesso ao banco: repositories server-side, protegido por RLS sempre que possivel
- integracoes externas e efeitos colaterais: Edge Functions, com idempotencia e tratamento explicito de falhas

## Leitura complementar

- [README.md](./README.md)
- [FRONTEND_MODULES.md](./FRONTEND_MODULES.md)
- [auth-architecture.md](./auth-architecture.md)
- [ADR-005: Edge Functions como fronteira de backend Supabase](./DECISIONS/ADR-005-supabase-backend-boundary.md)
