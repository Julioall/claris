# Plano de Implementacao — Separacao Frontend e Backend Supabase

Atualizado em `2026-07-21`.

## Objetivo

Remover do frontend o conhecimento sobre tabelas, colunas, joins, RPCs e regras de persistencia do Supabase. O Supabase continua sendo o backend da aplicacao, usando:

- Supabase Auth para autenticacao;
- Edge Functions como API e camada de aplicacao;
- PostgreSQL, funcoes SQL e transacoes para persistencia e operacoes atomicas;
- RLS como defesa adicional, e nao como substituto da autorizacao da API.

Ao final, o frontend deve depender apenas de contratos HTTP orientados a casos de uso. Isso permite substituir as Edge Functions por uma API .NET futuramente sem reescrever componentes e hooks.

## Estado inicial

Baseline levantada em `2026-07-21`:

- 48 arquivos de runtime importam o cliente Supabase;
- 146 chamadas diretas de `supabase.from()`;
- 15 ocorrencias de `.rpc()`;
- 15 invocacoes de Edge Functions;
- 12 acessos a Auth e 1 criacao de channel Realtime;
- 73 escapes de tipagem relacionados a `any`, `never` ou cast de `SupabaseClient`;
- guardrail, typecheck e 491 testes passando.

Esses numeros sao produzidos por `npm run audit:supabase-frontend` e devem ser recalculados no inicio e no final de cada epic. O inventario contabiliza apenas chamadas vinculadas ao objeto `supabase`; por isso nao inclui metodos `.from()` de outras APIs JavaScript.

## Arquitetura alvo desta etapa

```text
React
  -> hooks / TanStack Query
    -> clients HTTP por feature
      -> Supabase Edge Functions
        -> service (caso de uso)
          -> repository (Supabase/PostgreSQL)
            -> tabelas, views, RPCs e transacoes
```

### Responsabilidades do frontend

- renderizacao, formularios e navegacao;
- estado local e cache de server state;
- validacao para experiencia do usuario;
- envio e recebimento de DTOs;
- `supabase.auth` encapsulado em um gateway enquanto Supabase Auth for usado;
- subscriptions Realtime encapsuladas, quando realmente necessarias.

### Responsabilidades do backend Supabase

- autorizacao do caso de uso;
- identidade obtida do token, sem confiar em `userId` enviado pelo cliente;
- validacao autoritativa;
- regras de negocio e transicoes de estado;
- consultas, agregacoes e paginacao;
- transacoes e idempotencia;
- integracoes Moodle, WhatsApp e IA;
- auditoria, telemetria persistida e tratamento padronizado de erros.

## Regras obrigatorias para o Codex

1. Executar os epics na ordem definida e trabalhar em uma task por vez.
2. Antes de editar, ler os arquivos citados e os testes existentes do dominio.
3. Nao misturar refatoracao visual com migracao de fronteira.
4. Nao alterar o comportamento funcional sem uma task explicita.
5. Criar primeiro o endpoint e seus testes; migrar o frontend depois; remover o acesso antigo por ultimo.
6. Manter cada PR pequena, preferencialmente cobrindo um caso de uso ou uma familia coesa de endpoints.
7. Toda Edge Function exposta ao browser deve usar o runtime HTTP compartilhado e autenticacao no handler.
8. Nunca aceitar `userId` comum como identidade do chamador. Usar o usuario autenticado. IDs de terceiros so podem existir em operacoes administrativas autorizadas.
9. Nao retornar linhas do banco diretamente. Mapear para DTOs explicitos e estaveis.
10. Nao importar tipos gerados do Supabase nos contratos consumidos pelo frontend.
11. Operacoes multi-etapa devem ser atomicas via funcao SQL/RPC transacional ou desenho idempotente no backend.
12. Preservar RLS durante toda a migracao.
13. Atualizar este documento marcando `[x]` apenas depois de cumprir os criterios de aceite.
14. Ao concluir uma task, executar os testes proporcionais ao risco e registrar qualquer pendencia.

## Definition of Done geral

Uma task de migracao so esta concluida quando:

- o frontend chama um client orientado ao caso de uso;
- nao ha `.from()`, `.rpc()` ou montagem de query Supabase no codigo migrado;
- regra de negocio autoritativa esta no backend;
- request e response possuem DTOs explicitos;
- autenticacao e autorizacao foram testadas;
- erros usam o envelope HTTP padrao;
- testes do dominio, typecheck e guardrail passam;
- documentacao do endpoint foi atualizada;
- o caminho legado foi removido, salvo quando a task explicita uma janela de compatibilidade.

## Validacao padrao

Executar conforme aplicavel:

```bash
npm run guard:supabase-boundary
npm run typecheck
npm test
npm run smoke:edge
npm run build
```

Para migrations, validar tambem banco local, policies, grants, rollback logico e tipos gerados.

---

## Epic 0 — Baseline e inventario controlado

**Objetivo:** transformar o levantamento inicial em uma lista verificavel e impedir perda de escopo.

- [x] `SB-0001` Criar script de inventario de dependencias Supabase no frontend
  - Contabilizar por arquivo: `from`, `rpc`, `functions.invoke`, `auth`, `storage`, `channel` e imports do client.
  - Ignorar testes, mocks e o adaptador oficial.
  - Produzir saida deterministica apropriada para CI.
  - AC: baseline reproduzivel e diferencas visiveis em cada PR.
  - Implementado por `scripts/inventory-frontend-supabase.mjs` e executado com `npm run audit:supabase-frontend` (`-- --json` para integracao automatizada).

- [x] `SB-0002` Classificar cada acesso em inventario versionado
  - Categorias: `auth`, `realtime`, `query`, `command`, `telemetry`, `edge-function` e `legacy`.
  - Registrar feature, arquivo, caso de uso, tabelas/RPC e epic de destino.
  - AC: todo acesso de runtime possui destino definido.
  - Implementado em `docs/SUPABASE_FRONTEND_ACCESS_INVENTORY.json`; `npm run guard:supabase-inventory` valida cobertura e atualizacao no CI.

- [x] `SB-0003` Registrar ADR da arquitetura intermediaria Supabase
  - Formalizar Edge Functions como API, RLS como defesa adicional e contratos independentes do banco.
  - Registrar excecoes temporarias para Auth e Realtime.
  - AC: ADR aceita e referenciada por `ARCHITECTURE.md` e `FRONTEND_MODULES.md`.
  - Implementado em `docs/DECISIONS/ADR-005-supabase-backend-boundary.md`.

## Epic 1 — Fundacao da API Supabase

**Objetivo:** criar um padrao unico antes de migrar os dominios.

- [x] `SB-0101` Versionar contratos HTTP
  - Definir convencao `/v1`, nomes de actions, paginacao, filtros e datas ISO-8601.
  - Definir envelope de sucesso e `ApiError` com `code`, `message`, `details` e `correlationId`.
  - AC: exemplos documentados e usados por uma function piloto.
  - Implementado de forma opt-in em `_shared/http/contract.ts`; `moodle-reauth-settings` preserva o payload legado e responde no envelope V1 quando solicitado.

- [x] `SB-0102` Completar o runtime HTTP compartilhado
  - Consolidar CORS, parse de body, autenticacao, autorizacao, correlation ID, logs e mapeamento de erros em `_shared/http`.
  - Garantir que logs nao exponham token, credenciais ou dados pessoais desnecessarios.
  - AC: testes para `OPTIONS`, 400, 401, 403, 404, 409, 422 e 500.
  - Implementado em `_shared/http` com correlation ID, logger seguro, `ApiError`, autorizacao e seams de teste; cobertura em `edge-http-handler.test.ts`.

- [x] `SB-0103` Padronizar validacao de payload
  - Expandir `_shared/validation` com parsers reutilizaveis e limites de payload.
  - AC: payload invalido nunca chega ao service/repository.
  - Implementado com limite global configuravel, validadores tipados e testes que comprovam o bloqueio antes do caso de uso.

- [x] `SB-0104` Definir estrutura por caso de uso
  - Convencao: `index.ts`, `payload.ts`, `service.ts`, `repository.ts`, `mapper.ts` e testes.
  - `index.ts` deve apenas adaptar HTTP e chamar o service.
  - AC: template documentado em `EDGE_FUNCTIONS.md`.
  - Implementado e aplicado no piloto `moodle-reauth-settings`, com service testavel por repository injetado.

- [x] `SB-0105` Criar client HTTP unico no frontend
  - Encapsular `functions.invoke`, normalizacao de erro, timeout, abort signal e correlation ID.
  - Nenhuma feature deve invocar Edge Function diretamente apos ser migrada.
  - AC: client testado para sucesso, erro funcional, erro HTTP, timeout e sessao expirada.
  - Implementado em `src/integrations/http/edge-function-client.ts`; o piloto de reautorizacao ja usa exclusivamente esse client.

- [x] `SB-0106` Separar DTOs de tipos do banco
  - Criar convencao de contratos por feature; impedir import de `integrations/supabase/types` em UI e hooks.
  - AC: endpoint piloto faz mapping banco -> DTO -> view model sem cast `any/never`.
  - Implementado no piloto com contracts e mappers explicitos nos dois lados; `guard:frontend-contracts` impede novas dependencias e controla duas dividas versionadas.

- [x] `SB-0107` Criar testes de contrato
  - Cobrir request/response das Edge Functions e seus clients frontend.
  - Preferir fixtures pequenas e estaveis.
  - AC: alteracao incompativel de contrato quebra teste antes do deploy.
  - Implementado com testes do runtime/backend/client e smoke V1 real cobrindo headers, envelopes, autenticacao e validacao.

## Epic 2 — Guardrails e adaptadores permitidos

**Objetivo:** impedir crescimento do acoplamento enquanto a migracao acontece.

- [x] `SB-0201` Endurecer `check-supabase-boundary.mjs`
  - Bloquear import do client fora de uma allowlist explicita.
  - Bloquear `.from()` e `.rpc()` em todo `src/`, inicialmente com snapshot de divida decrescente.
  - AC: acesso novo falha no CI; remocao de acesso reduz o snapshot.
  - Implementado com budget exato em `scripts/supabase-boundary-debt.json` e allowlist explicita apenas para adapters aprovados.

- [x] `SB-0202` Criar `AuthGateway`
  - Encapsular `getSession`, `refreshSession`, eventos e logout.
  - Migrar `useAuthSession` e consumidores de sessao.
  - AC: apenas o gateway importa Supabase Auth diretamente.
  - Implementado em `src/integrations/auth/auth-gateway.ts`, com contrato estavel, renovacao de token, eventos, escrita de sessao e logout; o guardrail permite Auth apenas nesse adapter.

- [x] `SB-0203` Criar `RealtimeGateway`, se necessario
  - Inventariar channels/subscriptions e expor eventos de dominio.
  - AC: nenhuma feature conhece nomes de canais/tabelas.
  - Implementado para o unico channel existente: o gateway traduz INSERT de suporte em evento de dominio, controla cleanup e a migration habilita `support_tickets` na publication Realtime.

- [x] `SB-0204` Migrar telemetria
  - Substituir inserts diretos de `useTrackEvent`, `useErrorLog` e `lib/tracking` por endpoint de telemetria ou coletor apropriado.
  - Tornar falhas de telemetria nao bloqueantes e aplicar limites.
  - AC: frontend nao grava `app_usage_events` nem `app_error_logs` diretamente.
  - Implementado com `app-telemetry`: auth obrigatoria, identidade derivada do token, body de 64 KiB, limites estruturais, redacao de segredos e client best-effort com timeout curto.

- [x] `SB-0205` Remover lookup Supabase de primitive UI
  - Migrar `components/ui/api/tagInput.ts` para clients de busca dos dominios.
  - AC: `components/ui` volta a ser independente de dados e dominio.
  - Implementado com `task-tag-suggestions`, busca autenticada e course-scoped; o componente foi movido para a feature de tasks e a API antiga de `components/ui` foi removida.

## Epic 3 — Dashboard e consultas agregadas

**Objetivo:** retirar do navegador o maior conjunto de agregacoes e regras academicas.

- [x] `SB-0301` Especificar `DashboardSummaryDto`
  - Definir KPIs, alunos em risco, atividades para revisar, feed e metadados de atualizacao.
  - AC: contrato nao referencia tabelas ou tipos Supabase.
  - Implementado como contrato HTTP V1 em `camelCase`, espelhado nas duas bordas e protegido por teste de compatibilidade; identidade e nomes de persistencia nao fazem parte do DTO.

- [x] `SB-0302` Implementar endpoint `dashboard-summary`
  - Mover consultas e composicao de `dashboard.repository.ts` para service/repositories backend.
  - Reutilizar agregados existentes e medir necessidade de nova RPC.
  - AC: uma chamada frontend retorna o dashboard completo ou secoes explicitamente versionadas.
  - Implementado como Edge Function autenticada e autorizada por `dashboard.view`, com handler fino, service testavel, repository exclusivo para Supabase, escopo tutor por token e uma resposta V1 completa.

- [x] `SB-0303` Centralizar regras de pendencia, correcao e risco
  - Garantir uma unica implementacao backend das regras usadas pelo dashboard.
  - Adicionar testes de fronteira para status, notas, datas e atividades ocultas.
  - AC: frontend nao recalcula KPIs.
  - Implementado no dominio backend com escopo por matricula ativa aluno-curso, submissao real, ocultacao, deduplicacao de risco e semanas civis em `America/Sao_Paulo`; testes cobrem as fronteiras e corrigem a divergencia entre conclusao e submissao de assignments.

- [x] `SB-0304` Migrar `useDashboardData`
  - Consumir o novo client e preservar query keys, loading, erro e invalidacoes.
  - AC: `dashboard.repository.ts` deixa de acessar Supabase e e removido ou reduzido a client HTTP.
  - Implementado com client HTTP autenticado, validacao do DTO, cancelamento, timeout e preservacao das query keys/estados; o repository Supabase foi removido e os componentes usam somente contratos `camelCase` enxutos.

- [x] `SB-0305` Benchmark e regressao
  - Comparar requests, bytes, latencia e resultado antes/depois com fixtures equivalentes.
  - AC: nenhuma divergencia funcional nao documentada.
  - Baseline local versionado em `docs/benchmarks/dashboard-summary.*`: requests do navegador cairam de 13 para 1, o resultado normalizado permaneceu igual e as correcoes semanticas estao documentadas; o script permite repetir o benchmark do endpoint.

## Epic 4 — Cursos, matriculas e frequencia

**Objetivo:** encapsular catalogo, painel de curso e comandos relacionados.

- [x] `SB-0401` Migrar catalogo de cursos
  - Endpoint deve obter usuario do token e nao aceitar `p_user_id` do cliente.
  - Encapsular `get_user_courses_catalog_with_stats` no repository backend.
  - AC: frontend desconhece o nome da RPC.
  - Implementado em `courses-catalog`: identidade derivada do token, payload estrito sem campos de ator, RPC restrita a `service_role`, regras de datas/status no backend, matriz explicita para as rotas Cursos/Escolas/Relatorios e DTO V1 independente do schema.

- [x] `SB-0402` Migrar painel de curso
  - Mover queries de curso, alunos e atividades, datas efetivas, deduplicacao e estatisticas.
  - AC: `getCoursePanel` vira uma unica chamada de caso de uso.
  - Implementado em `course-panel`: uma chamada retorna curso, alunos deduplicados, atividades agrupadas deterministicamente, submissoes com workflow, estatisticas, configuracao de frequencia e metadados de atualizacao; overrides manuais prevalecem sobre divergencias do sync.

- [x] `SB-0403` Tornar associacao de curso atomica
  - Implementar seguir, visualizar, ignorar e designorar como comandos autenticados.
  - Substituir sequencias delete/insert por operacao transacional e idempotente.
  - AC: falha intermediaria nao remove estado anterior.
  - Implementado por comandos `set_association_role` e `set_ignored`, com lotes limitados, roles validadas e RPCs PostgreSQL atomicas e idempotentes acessiveis somente pelo backend. O frontend particiona selecoes acima de 200 itens em chunks sequenciais e so atualiza o cache apos concluir todos; a associacao de nao administradores fica limitada a cursos ja acessiveis, sem criar acesso novo. Novos vinculos passam exclusivamente pela elegibilidade substituida pelo sync Moodle e falham atomicamente se a selecao contiver qualquer curso externo.

- [x] `SB-0404` Migrar configuracao de frequencia
  - Endpoints para habilitar/desabilitar e consultar configuracao por curso.
  - AC: autorizacao course-scoped testada.
  - Implementado com leitura nos DTOs de catalogo/painel e comando `set_attendance_enabled`, protegido por `courses.attendance.manage`, acesso ao curso e transacao backend.

- [x] `SB-0405` Migrar visibilidade de atividades
  - Validar permissao, tipo de atividade e escopo do curso no backend.
  - AC: frontend envia apenas a intencao de ocultar/exibir.
  - Implementado por `set_activity_visibility`, protegido por `courses.activities.visibility.manage`; o backend valida curso/atividade e persiste um override reaplicado pelas sincronizacoes posteriores.

- [x] `SB-0406` Migrar consultas e comandos de presenca
  - Remover acesso direto existente em `features/courses/api/index.ts`.
  - AC: operacoes em lote possuem validacao e comportamento transacional definido.
  - Implementado em `course-attendance`: detalhes paginados, totais completos por data, folha correlacionada e salvamento atomico de ate 500 registros, com ordenacao estavel e validacao de status, alunos, curso, permissao e configuracao habilitada.

## Epic 5 — Alunos, historico e relatorios

**Objetivo:** centralizar consultas academicas e seus calculos.

- [x] `SB-0501` Migrar listagem paginada de alunos
  - Encapsular RPC, filtros, ordenacao e mapeamento em endpoint.
  - Derivar escopo de cursos do usuario autenticado.
  - AC: client recebe `items`, `page`, `pageSize` e `total`.
  - Implementado em `students/list_students` com identidade do token, permissao `students.view`, RPC service-only, filtros estritos, total independente da pagina e ordenacao estavel por risco, nome e id.

- [x] `SB-0502` Migrar perfil do aluno
  - Consolidar dados gerais, cursos e atividades em DTO apropriado para a tela.
  - AC: frontend nao executa joins PostgREST.
  - Implementado em `students/get_profile`: o backend intersecta matriculas com cursos acessiveis, devolve 404 indistinguivel para inexistencia/falta de acesso e consolida identidade, notas e atividades ponderadas em DTO camelCase.

- [x] `SB-0503` Migrar historico do aluno
  - Mover as duas consultas e o calculo de pendencias/atrasos de `useStudentHistory`.
  - AC: hook limita-se a consumir e apresentar o DTO.
  - Implementado em `students/get_history` com ate 60 snapshots, paginação interna de atividades, recalculo backend de pendencias/atrasos e ordenacao deterministica; a query key inclui o ator autenticado.

- [x] `SB-0504` Migrar acompanhamento de jobs de sugestao de nota
  - Encapsular tabelas de jobs e suas transicoes.
  - AC: frontend nao consulta `ai_grade_suggestion_jobs` diretamente.
  - Implementado em `grade-suggestion-jobs/find_latest_relevant`, protegido por permissao e curso. Criacao de job+itens e cancelamento agora usam RPCs transacionais, existe unicidade parcial de job ativo e transicoes concorrentes nao reativam jobs cancelados; tabelas de job/auditoria nao possuem grants de browser.

- [x] `SB-0505` Migrar relatorios
  - Mover queries paralelas, joins, filtros e consolidacao de `features/reports/api/index.ts`.
  - Definir endpoints por relatorio, evitando endpoint generico que exponha o banco.
  - AC: exportacao usa dados de contrato e mantem o resultado atual.
  - Implementado em `academic-reports` com actions especificas para cursos, notas e atividades pendentes. Escopo exige associacao tutor para todo o lote, consultas sao paginadas no backend e a exportacao preserva filtros, ordenacoes, estilos e nomes de arquivo existentes.

## Epic 6 — Tarefas e agenda

**Objetivo:** mover CRUD, tags, comentarios, recorrencia e regras de agenda para casos de uso.

- [x] `SB-0601` Migrar consultas de tarefas
  - Listagem, detalhe, comentarios e tags.
  - AC: ordenacao e filtros sao definidos no contrato.
  - Implementado em `tasks` com listagem V1 paginada, filtros tipados, ordenacao estavel e detalhe consolidado de tarefa, comentarios e tags. O frontend recebe DTOs `camelCase` e nao conhece joins ou tabelas.

- [x] `SB-0602` Migrar comandos de tarefas
  - Criar, editar, concluir e excluir com validacao autoritativa.
  - AC: transicoes invalidas retornam erro funcional padronizado.
  - Criacao deriva `createdBy` do token; update reaplica acesso de criador/responsavel e registra alteracoes em `task_history`; delete exige o criador. Status fora da maquina suportada retorna `validation_failed`/422.

- [x] `SB-0603` Tornar `findOrCreateTag` atomico
  - Usar constraint + upsert/RPC transacional para evitar duplicacao por concorrencia.
  - AC: chamadas concorrentes retornam a mesma tag.
  - A migration `20260721160000_secure_tasks_and_calendar.sql` deduplica o legado, cria identidade unica normalizada por ator/entidade e expõe `backend_add_task_tag` somente a `service_role`. Smoke com chamadas concorrentes confirma uma tag e um vinculo.

- [x] `SB-0604` Migrar comentarios e vinculos de tags
  - Validar acesso a tarefa antes de qualquer comando.
  - AC: operacoes sao idempotentes quando aplicavel.
  - Autor e proprietario da tag sao derivados do token. Todo comando revalida o acesso a tarefa; vinculo, remocao de vinculo e exclusao repetida de comentario possuem semantica idempotente sem expor existencia fora do escopo.

- [x] `SB-0605` Migrar agenda e eventos
  - Mover `calendar.repository.ts`, recorrencia e regras de escopo.
  - AC: frontend nao conhece tabelas de agenda.
  - Implementado em `calendar-events`: CRUD, intervalo, ordenacao, paginacao e escopo `owner` sao autoritativos no backend; `owner`, origem e campos de sync nao sao aceitos do browser. A recorrencia de tarefas ja existente permanece no fluxo server-side `generate-recurring-tasks`; o modelo atual de `calendar_events` nao expoe configuracao de recorrencia no frontend.

## Epic 7 — Mensagens, campanhas e WhatsApp

**Objetivo:** manter selecao de publico, estado de campanha e mensageria exclusivamente no backend.

- [x] `SB-0701` Migrar templates de mensagem
  - Listagem, criacao, atualizacao e defaults/seeding.
  - AC: seeding nao e disparado pelo navegador com inserts diretos.
  - Implementado em `message-templates`: CRUD e favoritos sao actor-scoped; os 17 defaults vivem no backend e sao seedados uma unica vez por uma RPC service-only protegida contra corrida. O helper de inserts do browser foi removido.

- [x] `SB-0702` Migrar resolucao do publico de mensagem
  - Mover matriculas, elegibilidade, risco, notas e pendencias de `bulk-messaging.repository.ts`.
  - AC: frontend recebe opcoes/resumo; backend recalcula destinatarios no envio para evitar TOCTOU.
  - `bulk-message-audience` compoe cursos, alunos, risco, notas e pendencias dentro do backend. Envio e agendamento aceitam apenas `studentId` e mensagem personalizada; nome e Moodle ID sao recalculados imediatamente antes da escrita, e alunos fora do escopo falham com 422.

- [x] `SB-0703` Migrar historico e acompanhamento de envios
  - Encapsular jobs e recipients em DTOs paginados.
  - AC: nenhuma tabela de bulk messaging e consultada pelo frontend.
  - `campaigns` expoe lista/detalhe de jobs e recipients com ordenacao e paginacao server-side. O ator vem do token, detalhes de job de outro ator retornam 404 e as tabelas de bulk messaging perderam todos os grants de browser.

- [x] `SB-0704` Migrar CRUD e transicoes de campanhas
  - Criar, editar, agendar, pausar, retomar e cancelar com maquina de estados no backend.
  - AC: status nao pode ser alterado por update generico.
  - O mesmo endpoint `campaigns` executa CRUD actor-scoped e comandos explicitos `pause`, `resume` e `cancel`. Updates aceitam apenas `pending/paused`, transicoes usam precondicao de status e o backend deriva origem, contagem, contextos e snapshots.

- [x] `SB-0705` Centralizar client WhatsApp
  - Fazer todas as operacoes passarem pelo client HTTP comum e contratos versionados.
  - AC: sessao e erros seguem os mesmos padroes dos demais dominios.
  - `whatsapp-messaging` agora lista instancias acessiveis, rejeita campos desconhecidos/identidade, responde no envelope V1 em `camelCase` e nao devolve o payload bruto da Evolution. Chamadas normais e uploads com progresso usam o client HTTP comum; a feature nao acessa Supabase, sessao, URL ou API key.

## Epic 8 — Sincronizacao, risco e background jobs

**Objetivo:** retirar do browser a orquestracao de processos longos e regras de consistencia.

- [x] `SB-0801` Mapear o fluxo de `useCourseSync`
  - Documentar etapas, comandos, progresso, retries, efeitos e invalidacoes.
  - AC: maquina de estados atual possui testes antes da migracao.
  - O fluxo foi reduzido a comandos (`start_initial_sync`/`start_course_sync`) e polling de um DTO. O hook mantem apenas estado visual, toasts, telemetria, retomada de job ativo e invalidacao apos termino; as etapas autoritativas sao `courses -> students -> activities -> grades -> risk`.

- [x] `SB-0802` Criar comando backend para iniciar sincronizacao
  - Cliente envia escopo permitido; backend cria job idempotente e retorna `jobId`.
  - AC: fechar/recarregar o browser nao interrompe o processo.
  - `moodle-sync-jobs` deriva o ator do token, valida permissao/escopo, usa uma chave canonica SHA-256 e um indice unico parcial para impedir jobs ativos duplicados. O worker e agendado por `EdgeRuntime.waitUntil`; o frontend retoma o job mais recente depois de reload.

- [x] `SB-0803` Mover orquestracao Moodle para worker/functions
  - Cursos, alunos, atividades, notas, snapshots, risco e notificacoes.
  - AC: credenciais e regras nao transitam entre etapas controladas pelo browser.
  - O worker resolve a credencial Moodle criptografada no servidor, renova o token, executa cursos/vinculo, alunos, atividades e notas paginadas, atualiza itens/progresso, recalcula risco, registra eventos/activity feed e toca `last_sync`. URL, senha e token Moodle nao fazem parte do contrato do browser.

- [x] `SB-0804` Migrar consulta de progresso
  - Polling ou Realtime via gateway usando DTO de job.
  - AC: UI preserva progresso atual sem consultar tabelas diretamente.
  - Polling e retomada usam DTO V1 agregado por etapa. `BackgroundActivitySyncBridge` consulta `background-jobs.list_active`; `activity-feed` fornece notificacoes actor-scoped. Jobs, itens, eventos e feed perderam grants de browser.

- [x] `SB-0805` Migrar recalculo de risco
  - Remover RPCs de `features/auth/application/risk.service.ts` do frontend.
  - Tornar recalculo um caso de uso autorizado e idempotente.
  - AC: regra e resultados cobertos no backend.
  - O backend tenta a RPC por curso com retry de deadlock e preserva o fallback por aluno quando a RPC ainda nao existe. O frontend envia somente UUIDs de cursos unicos ao endpoint autorizado.

- [x] `SB-0806` Migrar administracao de jobs
  - Listar, detalhar, cancelar e tentar novamente com endpoints administrativos.
  - Implementar transicoes condicionais atomicas.
  - AC: `admin/api/backgroundJobs.ts` nao acessa tabelas.
  - `background-jobs` exige administrador para lista/detalhe/comandos, calcula `canRetry`/`canCancel` no backend e aplica precondicoes de status para agendamentos e syncs. Eventos registram o ator administrativo; o client da pagina apenas mapeia DTOs.

Resultado da epic: o inventario caiu de 30 para 22 arquivos com acesso Supabase, de 52 para 31 chamadas `.from()`, de 13 para 9 RPCs e de 13 para 11 invocacoes diretas. As reducoes remanescentes pertencem aos Epics 9 e 10.

## Epic 9 — Claris, configuracoes, servicos e administracao

**Objetivo:** concluir os dominios administrativos e remover acessos fora de `api`.

- [x] `SB-0901` Migrar conversas e sugestoes da Claris
  - Remover `fromAny`, queries em hooks e acesso direto ao historico.
  - AC: hooks usam clients tipados e nao importam Supabase.
  - Historico e sugestoes usam `claris-conversations` e `claris-suggestions`; aceite/dispensa usam RPC service-only atomica e o feed nao expoe `action_payload`/`trigger_context`. Mensagens Moodle usam client HTTP tipado, credencial renovada no servidor e associacao de aluno limitada aos cursos acessiveis. Disponibilidade e chat principal usam contrato V1, nao leem `app_settings` no navegador e resolvem credencial Moodle no servidor apenas durante confirmacao explicita de envio.

- [x] `SB-0902` Migrar configuracoes globais
  - Leitura e alteracao via endpoints com permissao administrativa.
  - Separar configuracoes publicas, privadas e segredos.
  - AC: frontend nunca recebe credenciais de provedores.
  - `app-settings` oferece DTO publico autenticado e DTO administrativo autorizado; gravacoes de risco, Claris e correcao com IA sao validadas no backend. A chave do provedor e preservada no servidor quando omitida, a resposta expoe apenas `apiKeyConfigured` e o browser perdeu todos os grants diretos sobre `app_settings`. O teste de conexao tambem usa contrato V1 estrito e nao devolve configuracao ou resposta do provedor.

- [x] `SB-0903` Migrar suporte e metricas administrativas
  - Tickets, logs, contagens e resolucao de erros.
  - AC: filtros, paginacao e permissoes executados no backend.
  - `support-tickets` deriva o solicitante do token e reserva listagem/atualizacao a administradores; atribuicao, contexto e resolucao sao server-side. `admin-observability` entrega dashboard agregado, eventos, logs e conversas em DTOs paginados, registra o admin que resolveu cada erro, redige atributos sensiveis e limita o historico retornado. O Realtime de novos tickets permanece encapsulado e somente administradores conservam `SELECT` para a subscription; escritas e as demais tabelas sao service-only.
  - O inventario caiu de 15 para 11 arquivos com acesso Supabase e de 20 para 7 chamadas `.from()`; as quatro APIs administrativas agora dependem apenas do client HTTP compartilhado.

- [x] `SB-0904` Migrar controle de acesso
  - Encapsular RPCs administrativos e contexto de autorizacao.
  - AC: alteracoes de grupo/admin possuem auditoria e verificacao contra auto-lockout.
  - `access-control` deriva o ator do token, entrega contexto e DTOs administrativos em `camelCase` e reserva comandos a application admins. Papel administrativo e grupo agora mudam em uma unica transacao; auto-rebaixamento e administradores protegidos sao bloqueados, e cada alteracao efetiva gera evento imutavel em `app_access_audit_log`.
  - As cinco tabelas de autorizacao e as oito RPCs legadas perderam os grants de browser. O inventario caiu de 11 para 9 arquivos com acesso Supabase (6 legados + 3 adapters aprovados) e de 9 para 1 RPC; permanecem 7 chamadas `.from()` nas tasks seguintes.

- [x] `SB-0905` Migrar servicos e integracoes
  - Listagem, saude, configuracao e eventos operacionais.
  - AC: paginas nao chamam `getSession`; o client injeta autenticacao.
  - `whatsapp-instance-manager` agora expoe um contrato V1 estrito: overview pessoal deriva o proprietario do token, enquanto listagem e operacoes compartilhadas exigem application admin. O handler foi dividido em payload, contrato, service, repository, mapper e gateway da Evolution; respostas omitem IDs externos, metadados livres, contexto bruto de eventos e payloads do provedor.
  - As telas pessoal e administrativa usam comandos tipados pelo client HTTP compartilhado, sem `getSession`, `fetch`, URL Supabase, linha de banco ou action generica. As sete tabelas operacionais de integracoes sao service-only; ownership, ator e correlation ID foram validados no smoke real.
  - O inventario caiu de 9 para 7 arquivos com acesso Supabase (4 legados + 3 adapters aprovados) e de 7 para 4 chamadas `.from()`. Os dois clients migrados sairam do budget de divida.

- [x] `SB-0906` Migrar limpeza e ferramentas de diagnostico
  - `data-cleanup`, grade debug e testes de integracao apenas por endpoints admin.
  - AC: operacoes destrutivas exigem confirmacao explicita, autorizacao e auditoria.
  - `data-cleanup` agora exige a intencao `execute_cleanup`, modo obrigatorio e confirmacao literal; o frontend envia IDs funcionais de categorias, enquanto nomes de tabelas, dependencias e ordem ficam exclusivamente no backend. Erros de banco sao redigidos e cada execucao grava eventos `requested` e `completed`/`failed` em uma tabela service-only imutavel.
  - `admin-diagnostics` substitui queries de cursos/matriculas e o antigo `debug_grades`: somente application admins acessam o contrato, o browser envia UUIDs internos e a credencial Moodle e renovada no servidor. A resposta e limitada a campos de nota normalizados, sem token, IDs Moodle ou payload bruto do provedor.
  - O inventario caiu de 7 para 5 arquivos com acesso Supabase (2 legados + 3 adapters aprovados), de 4 para 1 chamada `.from()` e de 5 para 2 invocacoes diretas. Os dois clients de settings sairam do budget de divida; o smoke real cobre autorizacao, spoof, confirmacao, redaction e auditoria.

## Epic 10 — Encerramento da fronteira Supabase no frontend

**Objetivo:** tornar a separacao completa e verificavel.

- [ ] `SB-1001` Zerar `.from()` e `.rpc()` em runtime frontend
  - Excluir adaptadores legados e atualizar o inventario.
  - AC: contagem igual a zero em `src/`, exceto fixtures/testes explicitamente permitidos.

- [ ] `SB-1002` Zerar invocacoes diretas de Edge Functions nas features
  - Todas devem passar pelo client HTTP compartilhado.
  - AC: `functions.invoke` existe somente no adaptador aprovado.

- [ ] `SB-1003` Restringir imports do SDK Supabase
  - Allowlist final: AuthGateway, RealtimeGateway e client HTTP, conforme necessario.
  - AC: CI falha para qualquer novo import fora da lista.

- [ ] `SB-1004` Remover tipos de banco da camada de apresentacao
  - DTOs e view models nao podem depender de `Database[...]`.
  - AC: guardrail arquitetural automatizado.

- [ ] `SB-1005` Atualizar documentacao e diagramas
  - Revisar `ARCHITECTURE.md`, `FRONTEND_MODULES.md`, `EDGE_FUNCTIONS.md` e ADRs.
  - AC: documentacao descreve o codigo real.

- [ ] `SB-1006` Executar regressao final
  - Testes, build, smoke das Edge Functions e fluxos criticos em staging.
  - AC: baseline funcional aprovada e inventario final anexado ao PR.

## Ordem de execucao

```text
Epic 0 -> Epic 1 -> Epic 2
                    |
                    +-> Epic 3 -> Epic 4 -> Epic 5
                    +-> Epic 6
                    +-> Epic 7
                    +-> Epic 8
                    +-> Epic 9
                                  |
                                  +-> Epic 10
```

Depois das fundacoes e guardrails, os dominios podem ser executados em PRs independentes, mas recomenda-se a ordem `Dashboard -> Cursos -> Alunos -> Sync/Risco -> Mensagens -> Tarefas -> Administracao` por risco e retorno.

## Estrategia de PRs

Para cada caso de uso:

1. PR A: contrato, Edge Function, repository/service e testes backend;
2. PR B: client frontend, migracao do hook e testes de integracao;
3. PR C, somente quando necessario: remocao de compatibilidade, query/RPC antiga e endurecimento do guardrail.

PRs A e B podem ser unidos quando o caso de uso for pequeno e permanecer revisavel.

## Fora de escopo

- implementar backend .NET;
- substituir Supabase Auth;
- trocar PostgreSQL;
- redesenhar telas;
- alterar regras academicas sem especificacao;
- remover RLS;
- migracao big bang.
