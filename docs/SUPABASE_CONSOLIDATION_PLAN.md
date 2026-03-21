# Supabase Consolidation Plan

Atualizado em `2026-03-21`.

Este documento e o plano operacional do ciclo pos-refactor. Ele cobre a consolidacao da fronteira de dados entre frontend e Supabase, sem reabrir a modularizacao estrutural que ja foi concluida.

## Objetivo

Reduzir o acoplamento entre UI e banco, com foco em:

- mover acesso a dados de `pages/` e `components/` para `src/features/<dominio>/api/`, `hooks/`, `application/` ou `infrastructure/`
- concentrar fluxos multi-tabela, operacoes sensiveis e automacoes em Edge Functions
- evitar duplicacao entre frontend e backend para o mesmo fluxo operacional
- manter RLS, migrations e Edge Functions sincronizados com a arquitetura do frontend
- criar guardrails para que o acoplamento nao volte a crescer

## Como Retomar

1. ler [FRONTEND_MODULES.md](./FRONTEND_MODULES.md)
2. ler [SUPABASE_RLS.md](./SUPABASE_RLS.md)
3. ler este arquivo inteiro
4. rodar `git status --short`
5. escolher a proxima fase com status `planned`
6. executar a fase sem reintroduzir acesso direto ao Supabase em page/componente
7. atualizar este arquivo ao final da fase
8. validar com `npm.cmd run lint`, `npm.cmd run test` e `npm.cmd run typecheck`
9. se houver mudanca em `supabase/functions/` ou `supabase/migrations/`, rodar tambem `npm.cmd run smoke:edge`
10. commitar a fase antes de iniciar a proxima

## Diagnostico Inicial

Baseline levantada em `2026-03-21`:

- `48` arquivos de runtime ainda importam `@/integrations/supabase/client`
- `29` desses arquivos ainda sao `pages/` ou `components/` fora das camadas de fronteira esperadas (`api/`, `hooks/`, `application/`, `infrastructure/`)
- os maiores hotspots atuais sao:
  - `src/features/messages/components/BulkSendTab.tsx`
  - `src/features/reports/pages/ReportsPage.tsx`
  - `src/features/settings/components/DataCleanupCard.tsx`
  - `src/features/admin/pages/*`
  - `src/features/automations/components/*`

Leitura arquitetural:

- o refactor estrutural do frontend foi concluido
- o schema e as policies RLS ja possuem documentacao canonica em [SUPABASE_RLS.md](./SUPABASE_RLS.md)
- o proximo ganho relevante esta em consolidar a camada de dados, nao em reorganizar mais pastas da UI

## Regras de Execucao

- `pages/` e `components/` nao devem chamar `supabase.from(...)` diretamente quando o dominio ja possui slice em `src/features/`
- `pages/` e `components/` nao devem chamar `supabase.functions.invoke(...)` diretamente para fluxos de negocio; preferir `api/` ou `application/`
- operacoes multi-tabela, com side effects relevantes, idempotencia, auditoria ou necessidade de `service_role` devem morar em Edge Functions
- leituras pesadas ou read models com muitas tabelas devem ser extraidas para repositories e, quando fizer sentido, avaliadas para `rpc`, `view` ou composicao server-side
- toda migration que criar, remover ou reescrever policy deve atualizar [SUPABASE_RLS.md](./SUPABASE_RLS.md)
- depois de cada fase, atualizar este documento com status, observacoes, validacao e commit correspondente

## Excecoes Aceitaveis

Estes casos ainda podem falar com o client do Supabase diretamente, desde que o motivo seja claro:

- `src/integrations/supabase/client.ts`
- hooks transversais de telemetria e erro, como `useTrackEvent`, `useErrorLog` e utilitarios equivalentes
- infraestrutura de autenticacao e sync em `src/features/auth/`
- utilitarios de integracao que sejam explicitamente cross-domain e nao pertencam a uma UI especifica

Se um caso de excecao comecar a carregar regra de negocio, ele deve sair desta lista e ganhar fronteira propria.

## Definicao de Conclusao por Fase

Uma fase so e considerada concluida quando:

- os consumidores principais usam `api/`, `application/`, `infrastructure/` ou hooks do slice em vez de chamar tabelas diretamente
- os componentes/paginas alvo deixam de montar queries e mutations SQL-like inline
- testes dos fluxos alterados foram atualizados
- `lint`, `test` e `typecheck` passam
- `smoke:edge` passa quando houve alteracao em Edge Functions ou migrations
- a fase foi commitada antes do inicio da proxima

## Fases Planejadas

### Fase S1: Mensagens e Automacoes

Status: `in_progress`

Objetivo:

- consolidar os fluxos de mensageria e jobs em uma fronteira de dados consistente

Progresso atual:

- `BulkSendTab`, `MessageTemplatesTab`, `BulkJobsTab`, `JobDetailDialog` e `ScheduledMessagesTab` deixaram de importar `@/integrations/supabase/client` diretamente
- `src/features/messages/api/` agora concentra audience loading, templates, envios recentes e disparo inicial do job de envio em massa
- `src/features/automations/api/` agora concentra listagem de jobs, detalhes, destinatarios, agendamentos e lookup de instancias de WhatsApp
- `ScheduledMessagesTab` passou a persistir `channel` e `whatsapp_instance_id` dentro de `filter_context`, evitando perder esse contexto ao reabrir um agendamento

Pendencias para concluir a fase:

- mover a criacao de job + recipients + disparo inicial para uma unica operacao de backend, evitando orquestracao parcial no frontend
- adicionar a migration de `bulk_message_jobs.origin` para diferenciar origem manual vs IA
- revisar se ainda ha acessos diretos ao Supabase nesse fluxo fora dos repositories novos e atualizar testes adicionais se o backend mudar

Escopo alvo:

- criar `src/features/messages/api/` para templates, filtros de envio, criacao de job e polling de status
- criar `src/features/automations/api/` para jobs, detalhes, mensagens agendadas e operacao associada
- tirar de `BulkSendTab`, `MessageTemplatesTab`, `BulkJobsTab`, `JobDetailDialog` e `ScheduledMessagesTab` o acesso direto a tabelas
- mover a criacao de job + recipients + disparo inicial para uma unica operacao de backend, evitando orquestracao parcial na UI
- adicionar uma migration para `bulk_message_jobs.origin` e fechar o TODO atual de origem manual vs IA
- garantir idempotencia minima para evitar disparos duplicados no envio em massa

Validacao minima:

- testes de mensagens e automacoes atualizados
- `lint`, `test`, `typecheck`
- `smoke:edge` se Edge Functions ou migrations forem alteradas

### Fase S2: Admin, Settings e Services

Status: `planned`

Objetivo:

- retirar da UI administrativa e operacional o acoplamento direto com tabelas sensiveis

Escopo alvo:

- criar `src/features/admin/api/` para `app_settings`, `app_feature_flags`, `support_tickets`, metricas, logs e RBAC
- extrair `src/features/services/pages/MyServicesPage.tsx` para uma fronteira de dados dedicada do slice
- fazer `DataCleanupCard` consumir apenas a Edge Function de cleanup, removendo deletes diretos do componente
- revisar `SettingsPage`, `GradeDebugCard`, `SupportButton` e consumidores afins para mover queries/mutations a `api/`
- preservar comportamento atual do painel admin, sem reescrever UX nesta fase

Validacao minima:

- testes de admin, settings e services atualizados
- `lint`, `test`, `typecheck`
- `smoke:edge` se houver alteracao em backend

### Fase S3: Read Models Academicos e Shared Components

Status: `planned`

Objetivo:

- atacar as leituras pesadas ainda montadas dentro da UI

Escopo alvo:

- extrair a composicao de dados de `ReportsPage` para `src/features/reports/api/` e hooks do dominio
- avaliar se parte do relatorio deve virar `rpc`, `view` ou composicao server-side para reduzir fan-out de queries
- mover acessos diretos ao Supabase em `StudentGradesTab`, `CourseAttendanceTab`, `TopBar`, `TagInput` e componentes compartilhados similares
- padronizar query keys e estados de carga/erro dos novos hooks

Validacao minima:

- testes de reports e dos shared components afetados atualizados
- `lint`, `test`, `typecheck`
- `smoke:edge` se houver mudancas no backend

### Fase S4: Guardrails e Endurecimento

Status: `planned`

Objetivo:

- impedir regressao arquitetural apos a consolidacao

Escopo alvo:

- adicionar guardrail para impedir novos `supabase.from(...)` em `pages/` e `components/` fora das excecoes previstas
- ampliar testes de contrato para repositories e Edge Functions criticas
- revisar se a tipagem gerada do Supabase precisa entrar no fluxo operacional de atualizacao
- manter [SUPABASE_RLS.md](./SUPABASE_RLS.md) sincronizado com o estado final das migrations
- documentar o estado final da fronteira de dados e os casos de excecao remanescentes

Validacao minima:

- `lint`, `test`, `typecheck`
- `smoke:edge` se houver alteracao em backend

## Prioridade Recomendada

Ordem sugerida:

1. `Fase S1: Mensagens e Automacoes`
2. `Fase S2: Admin, Settings e Services`
3. `Fase S3: Read Models Academicos e Shared Components`
4. `Fase S4: Guardrails e Endurecimento`

Motivo:

- `S1` combina alto acoplamento de UI, fluxo multi-tabela e automacao assicrona
- `S2` reduz risco operacional em areas sensiveis do produto
- `S3` limpa os read models mais pesados apos a fronteira transacional estar mais organizada
- `S4` fecha o ciclo e evita regressao

## Debitos Abertos Para Nao Esquecer

- decidir quais leituras pesadas realmente merecem `rpc` ou `view`, em vez de apenas repository no frontend
- revisar se jobs e automacoes devem registrar mais auditoria server-side
- alinhar qualquer migration nova com o documento [SUPABASE_RLS.md](./SUPABASE_RLS.md)
- manter os warnings antigos de testes fora do escopo deste plano, salvo quando uma fase tocar diretamente nesses componentes

## Ao Concluir Uma Fase

Sempre atualizar:

- o status da fase neste arquivo
- a secao `Estado atual` em [FRONTEND_MODULES.md](./FRONTEND_MODULES.md), se a fronteira de dados mudar de forma relevante
- [SUPABASE_RLS.md](./SUPABASE_RLS.md), se migrations ou policies mudarem
- [../.github/copilot-instructions.md](../.github/copilot-instructions.md), se a convencao operacional mudar
