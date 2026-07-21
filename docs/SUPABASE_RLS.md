# Supabase RLS Canônico

Atualizado em `2026-07-21`.

Este documento resume o estado RLS efetivo do schema atual.

Ele existe para evitar que a leitura de segurança dependa de reconstruir toda a trilha histórica das migrations a cada revisão. A fonte de verdade continua sendo a pasta `supabase/migrations`, mas este arquivo registra a postura final esperada por domínio.

## Princípios

- Tabelas orientadas ao usuário usam `auth.uid()` como fronteira principal de posse.
- Tabelas orientadas a curso usam `EXISTS (...)` sobre `user_courses` para validar acesso ao `course_id`.
- Escritas automáticas de sincronização ficam restritas a `service_role` apenas onde a automação precisa escrever em massa.
- Não deve existir política final com `USING (true)`, `WITH CHECK (true)` ou `auth.uid() IS NULL`.

## Resumo Executivo

- Tabelas sem RLS final: nenhuma.
- Políticas permissivas remanescentes: nenhuma conhecida após as correções de 2026-03-13.

Posturas especiais válidas:

- `student_activities`: leitura por escopo de curso, escrita automática por `service_role`.
- `course_activity_visibility_overrides`: acesso exclusivo de `service_role`; o estado manual e reaplicado em sincronizacoes por trigger.
- `student_course_grades`: leitura por escopo de curso, escrita automática por `service_role`.
- `dashboard_course_activity_aggregates`: leitura por escopo de curso; escrita automática por `service_role`.
- `student_sync_snapshots`: acesso direto removido; leitura e escrita somente por `service_role`.
- `ai_grade_suggestion_jobs`, `ai_grade_suggestion_job_items` e `ai_grade_suggestion_history`: acesso exclusivo do backend `service_role`.
- `task_action_history`: insert permitido para `service_role` e, no fluxo autenticado, somente com validação de ownership e integridade cruzada.
- `courses`: insert continua aceitando `auth.uid() IS NOT NULL`; isso depende do fluxo controlado pelas Edge Functions.
- `user_sync_preferences`, `activity_feed`, `background_jobs`, `background_job_items` e `background_job_events`: policies contextuais permanecem como defesa, mas os grants de browser foram revogados e o acesso da aplicacao passa por Edge Functions service-only.
- `claris_suggestions` e `claris_suggestion_cooldowns`: policies de dono permanecem como defesa, mas os grants de browser foram revogados; feed e comandos passam por `claris-suggestions`.
- `app_permission_definitions`, `app_groups`, `app_group_permissions`, `user_group_memberships` e `admin_user_roles`: policies permanecem como defesa, mas os grants de browser foram revogados; contexto e administracao passam por `access-control`.
- As sete tabelas `app_service_*` de instancias, eventos, jobs, limites, saude, webhooks e permissoes de grupo sao exclusivas de `service_role`; a aplicacao usa `whatsapp-instance-manager`.

## Usuários E Preferências

Tabelas:

- `users`
- `user_courses`
- `user_course_catalog_eligibility`
- `user_ignored_courses`
- `user_sync_preferences`
- `action_types`

Regra canônica:

- `users`: o usuário só lê, insere e atualiza a própria linha por `id = auth.uid()`.
- `user_courses` e `user_ignored_courses`: leitura continua protegida por ownership; escritas de `authenticated` e `anon` foram revogadas e passam pelos comandos backend atomicos.
- `user_course_catalog_eligibility`: sem acesso de browser; registra somente cursos descobertos pelo sync Moodle autenticado e limita a criacao de novos vinculos.
- `action_types`: o usuário só opera linhas cujo `user_id = auth.uid()`.
- `user_sync_preferences`: policies preservam o padrao de posse, com cast para `auth.uid()::text`, mas nao ha grant direto para `anon` ou `authenticated`; leitura e escrita passam por `moodle-sync-jobs`.

Migrations de referência:

- `20260210031713_1babdea9-fba0-4880-a900-6da75596b250.sql`
- `20260211041244_0ef98547-ca60-4110-a1de-2cc1df4d6c1b.sql`
- `20260205003909_72a4c7fd-cd18-4289-90ce-5a5a1c74050f.sql`
- `20260721140000_secure_course_management.sql`
- `20260721200000_secure_sync_and_background_jobs.sql`

Observações:

- A migration `20260211041244...` é a consolidação que remove o estado mais permissivo anterior.
- O cast em `user_sync_preferences` é aceito, mas deve ser revisitado se o tipo da coluna mudar.
- `backend_set_user_course_roles` e `backend_set_user_courses_ignored` sao `SECURITY DEFINER`, executaveis apenas por `service_role`; recebem a identidade ja autenticada pela Edge Function, validam lotes de ate 200 cursos e executam cada comando em uma transacao.
- `get_user_courses_catalog_with_stats` deixou de ser executavel por `PUBLIC`, `anon` e `authenticated`; seu nome e o parametro de usuario ficam restritos ao repository backend.
- `backend_replace_user_course_eligibility` e `backend_link_eligible_user_courses` sao exclusivas de `service_role`; a segunda rejeita o lote completo quando qualquer UUID nao foi descoberto para o ator.

## Sync Acadêmico

Tabelas:

- `courses`
- `students`
- `student_courses`
- `student_activities`
- `course_activity_visibility_overrides`
- `student_course_grades`
- `dashboard_course_activity_aggregates`
- `student_sync_snapshots`
- `ai_grade_suggestion_jobs`
- `ai_grade_suggestion_job_items`
- `ai_grade_suggestion_history`

Regra canônica:

- `courses`: leitura e update por vínculo em `user_courses`; insert autenticado por `auth.uid() IS NOT NULL`.
- `students`: leitura e update apenas se o aluno estiver em algum curso vinculado ao usuário.
- `student_courses`: leitura e escrita validadas pelo `course_id` acessível em `user_courses`.
- `student_activities`: leitura por escopo de curso; escrita automática por `service_role`.
- `course_activity_visibility_overrides`: sem acesso direto de browser; leitura e escrita exclusivas de `service_role`.
- `student_course_grades`: leitura por escopo de curso; escrita automática por `service_role`.
- `dashboard_course_activity_aggregates`: leitura por escopo de curso; insert/update exclusivos de `service_role`.
- `student_sync_snapshots`: todos os grants de browser foram revogados; `students/get_history` reaplica permissao e escopo antes da leitura.
- tabelas `ai_grade_suggestion_*`: todos os grants de browser foram revogados; leitura, criacao, processamento e auditoria passam pelas Edge Functions.

Migrations de referência:

- `20260203225612_3d928bd1-a5e7-4bb6-a1ec-8754acfeffc5.sql`
- `20260204224551_0df9807b-b129-4c6d-8b68-77bf43bdd29a.sql`
- `20260204194036_0737e748-5485-4860-a650-48737a3eee5d.sql`
- `20260205183218_fix_rls_remove_null_auth.sql`
- `20260211041244_0ef98547-ca60-4110-a1de-2cc1df4d6c1b.sql`
- `20260326183000_add_dashboard_course_activity_aggregates.sql`
- `20260721130000_harden_dashboard_backend_queries.sql`
- `20260721140000_secure_course_management.sql`
- `20260721150000_secure_students_queries.sql`
- `20260721152000_secure_grade_suggestion_jobs.sql`

Observações:

- O padrão correto aqui é sempre curso como unidade de autorização, nunca acesso amplo por aluno ou atividade isolada.
- As Edge Functions de sync dependem explicitamente das policies `service_role` em atividades e notas.
- `dashboard_course_activity_aggregates` materializa a fila do dashboard por curso para evitar recálculo completo de `student_activities` em toda abertura da tela.
- `refresh_course_dashboard_aggregate(uuid)` e `SECURITY DEFINER`, mas seu `EXECUTE` foi revogado de `PUBLIC`, `anon` e `authenticated`; apenas `service_role` pode recalcular agregados.
- `dashboard-summary` usa `service_role` internamente e, por isso, reaplica em todas as consultas o escopo de cursos `tutor` derivado do usuario autenticado.
- `backend_set_course_activity_visibility` valida o acesso ao curso e exclui atividades `scorm`; o override persistido e reaplicado por trigger para impedir que um sync reverta a escolha manual.
- `backend_list_students_page` e a RPC legada de listagem sao executaveis apenas por `service_role`; a primeira recebe a identidade derivada do token e preserva o total mesmo quando a pagina solicitada esta vazia.
- `backend_create_grade_suggestion_job_with_items` valida curso/atividades e grava job+itens atomicamente. `backend_cancel_grade_suggestion_job` encerra job e itens pendentes na mesma transacao; ambas sao exclusivas de `service_role`.

## Tarefas E Automação

Tabelas:

- `pending_tasks`
- `task_recurrence_configs`
- `task_actions`
- `task_action_history`
- `task_templates`

Regra canônica:

- `pending_tasks`: leitura por criação, atribuição ou vínculo de curso; insert por `created_by_user_id = auth.uid()`; update por criador ou responsável.
- `task_recurrence_configs`: posse do criador com possibilidade de leitura contextual por curso.
- `task_actions`: leitura e escrita limitadas ao executor legítimo e ao contexto da pendência relacionada.
- `task_action_history`: leitura contextual; insert só é válido para `service_role` ou quando `changed_by_user_id = auth.uid()` e a pendência pertence ao criador ou ao responsável, com validação de consistência entre `task_action_id` e `pending_task_id`.
- `task_templates`: tabela user-owned por `user_id = auth.uid()`.

Migrations de referência:

- `20260219012400_add_advanced_pending_tasks_system.sql`
- `20260227175940_2627352f-cede-4ca7-9337-405e9ca2cb7d.sql`
- `20260301193000_allow_generic_pending_and_recurrence_tasks.sql`
- `20260311003000_add_weekly_day_to_task_recurrence_configs.sql`
- `20260313153000_tighten_task_action_history_insert_rls.sql`

Observações:

- `20260313153000...` é obrigatória para interpretar corretamente o estado final de `task_action_history_insert`; antes dela o insert estava permissivo demais.
- A remoção das constraints de pendência genérica não afrouxa RLS; ela só amplia o modelo de dados para tarefas sem aluno específico.

## Ações, Anotações, Feed E Risco

Tabelas:

- `actions`
- `notes`
- `activity_feed`
- `risk_history`

Regra canônica:

- `actions`: user-owned; leitura exclui itens em lixeira por padrão; delete só se o item já estiver marcado como removido logicamente.
- `notes`: user-owned por `user_id = auth.uid()`.
- `activity_feed`: policies de dono/curso permanecem como defesa adicional, mas os grants de browser foram removidos; `activity-feed` le actor-scoped e workers inserem com `service_role`.
- `risk_history`: leitura pelo dono ou por vínculo entre aluno e curso acessível; insert pelo próprio usuário.

Migrations de referência:

- `20260204175801_7c71d9c3-1b20-43a2-8998-a803206a2fab.sql`
- `20260205214915_add_actions_trash.sql`
- `20260205183218_fix_rls_remove_null_auth.sql`
- `20260211041244_0ef98547-ca60-4110-a1de-2cc1df4d6c1b.sql`
- `20260721200000_secure_sync_and_background_jobs.sql`

Observações:

- A política final de `actions` pressupõe soft delete como regra operacional.
- `risk_history` segue visibilidade contextual por curso. `activity_feed` preserva policies equivalentes como defesa, mas deixou de ser uma porta de dados do browser.

## Mensageria

Tabelas:

- `moodle_conversations`
- `moodle_messages`
- `message_templates`
- `bulk_message_jobs`
- `bulk_message_recipients`

Regra canônica:

- `moodle_conversations`: user-owned por `user_id = auth.uid()`.
- `moodle_messages`: acesso herdado do contexto do usuário da conversa relacionada.
- `message_templates`, `bulk_message_jobs` e `bulk_message_recipients`: sem grants para `anon` ou `authenticated`; acesso da aplicacao exclusivamente por Edge Functions com `service_role`, que reaplicam o escopo do ator.

Migrations de referência:

- `20260218053748_9ccf508c-1a1d-4414-a8b7-9757903c75d6.sql`
- `20260309210021_77bab771-f56d-43d3-8fa7-28d8bacbe2ef.sql`
- `20260310103000_message_template_defaults_and_seed.sql`
- `20260721170000_secure_communications.sql`

Observações:

- `bulk_message_recipients` e sempre escopada pelo job pai; o endpoint valida a posse do job antes de paginar recipients.
- Defaults de `message_templates` sao inseridos por `backend_seed_message_templates`, exclusiva de `service_role` e serializada por ator com advisory lock.
- As policies user-owned anteriores permanecem como defesa em profundidade, mas nao constituem uma porta de acesso do browser.

## Jobs E Observabilidade

Tabelas:

- `background_jobs`
- `background_job_items`
- `background_job_events`
- `scheduled_messages`
- `user_moodle_reauth_credentials`

Regra canônica:

- `background_jobs`, `background_job_items` e `background_job_events`: policies de owner/admin permanecem como defesa, mas todos os grants de browser foram revogados. Polling actor-scoped e operacoes administrativas passam por `moodle-sync-jobs`/`background-jobs`, que usam `service_role` e reaplicam autorizacao.
- `scheduled_messages`: continua user-owned, mas application admin pode fazer `SELECT` e `UPDATE` para operações administrativas de cancelamento e reenfileiramento.
- `user_moodle_reauth_credentials`: leitura apenas pelo owner ou application admin; escritas ficam concentradas nas Edge Functions com `service_role`.

Migrations de referência:

- `20260317230000_add_scheduled_messages.sql`
- `20260327160000_add_background_jobs_hangfire_foundation.sql`
- `20260327170000_sync_more_legacy_automation_flows_to_background_jobs.sql`
- `20260327183000_prepare_scheduled_message_execution.sql`
- `20260327193000_add_moodle_reauth_credentials.sql`
- `20260327204500_allow_admin_manage_scheduled_messages.sql`
- `20260721200000_secure_sync_and_background_jobs.sql`

Observações:

- `scheduled_messages` e `background_jobs` compartilham o mesmo `id` quando o job nasce do agendador, preservando rastreabilidade operacional.
- Cancelar ou reenfileirar jobs agendados deve atuar sobre `scheduled_messages`; alterar apenas `background_jobs` quebraria a fonte de verdade do scheduler.
- `user_moodle_reauth_credentials` guarda apenas material cifrado; rotacionar `MOODLE_REAUTH_SECRET` invalida credenciais armazenadas e exige novo opt-in dos usuários.
- Jobs Moodle ativos possuem indice unico parcial por ator, tipo e requisicao canonica. Claims, cancelamentos e retries usam precondicao de status para nao sobrescrever transicoes concorrentes.

### Suporte e observabilidade administrativa

Tabelas:

- `app_usage_events`
- `app_error_logs`
- `claris_conversations`
- `support_tickets`

Regra canônica:

- `app_usage_events`, `app_error_logs` e `claris_conversations` nao possuem grants para `anon` ou `authenticated`; leitura e comandos passam pelos casos de uso com `service_role`.
- `support_tickets` nao permite `INSERT`, `UPDATE` ou `DELETE` pelo browser. Abertura e alteracao passam por `support-tickets`, que deriva usuario, atribuicao, contexto e resolucao no servidor.
- `support_tickets` preserva somente `SELECT` para `authenticated`, protegido pela policy `support_tickets_admin_realtime_select`, para que o `RealtimeGateway` administrativo receba notificacoes de novos tickets.
- `admin-observability` exige application admin, pagina e filtra no backend, registra `resolved_by` com o ator e redige chaves sensiveis antes de produzir DTOs.

Migration de referência:

- `20260721230000_secure_admin_observability.sql`

### Controle de acesso

Tabelas:

- `app_permission_definitions`
- `app_groups`
- `app_group_permissions`
- `user_group_memberships`
- `admin_user_roles`
- `app_access_audit_log`

Regra canônica:

- `anon` e `authenticated` nao possuem grants diretos nessas seis tabelas; as policies anteriores permanecem apenas como defesa em profundidade.
- `access-control` deriva o ator autenticado e usa RPCs exclusivas de `service_role` para contexto, consultas e comandos administrativos.
- `backend_set_user_access` altera papel administrativo e grupo na mesma transacao, bloqueia auto-rebaixamento e administradores de contingencia protegidos.
- `app_access_audit_log` aceita apenas `SELECT`/`INSERT` de `service_role`; trigger rejeita `UPDATE` e `DELETE`, inclusive fora da API.
- As oito RPCs legadas baseadas em `auth.uid()` nao sao mais executaveis por roles de browser.

Migration de referência:

- `20260721240000_secure_access_control.sql`

### Integrações de serviços

Tabelas:

- `app_service_instances`
- `app_service_instance_events`
- `app_service_instance_jobs`
- `app_service_instance_limits`
- `app_service_instance_health_logs`
- `app_service_webhook_events`
- `app_service_instance_group_permissions`

Regra canônica:

- `anon` e `authenticated` nao possuem grants de leitura ou escrita nessas tabelas; policies historicas permanecem como defesa em profundidade.
- `whatsapp-instance-manager` usa `service_role`, deriva a instancia pessoal do ator autenticado e exige application admin para instancias compartilhadas.
- O DTO publico omite `external_id`, ownership, metadados livres, contexto/correlation de eventos e respostas brutas da Evolution. Somente o telefone normalizado necessario a UI e projetado explicitamente.
- Eventos de comandos registram ator e correlation ID definidos pelo backend. Health details e payloads operacionais permanecem internos.

Migration de referência:

- `20260721250000_secure_service_integrations.sql`

## Referencias

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [EDGE_FUNCTIONS.md](./EDGE_FUNCTIONS.md)
- [README.md](./README.md)

## Attendance

Tabelas:

- `attendance_course_settings`
- `attendance_records`

Regra canônica:

- `attendance_course_settings`: leitura permanece limitada ao próprio `user_id`; insert e delete de `authenticated` e `anon` foram revogados e passam pelo backend.
- `attendance_records`: leitura permanece limitada ao próprio `user_id`; insert, update e delete de `authenticated` e `anon` foram revogados e passam pelo backend.

Migrations de referência:

- `20260212120000_add_attendance_management.sql`
- `20260313143000_reconcile_attendance_schema.sql`
- `20260313133313_1467ce71-94c4-4fd8-86fa-c2a088adf784.sql`
- `20260721140000_secure_course_management.sql`

Observações:

- `20260313133313...` deve permanecer como artefato no-op documentado; ela não define o estado final.
- `20260313143000...` é a migration canônica para frequência: remove políticas permissivas duplicadas, reconstrói as policies e corrige FKs para `public.users`.
- `backend_set_course_attendance_enabled` e `backend_save_attendance_sheet` sao exclusivas de `service_role`. A folha valida permissao, acesso ao curso, configuracao habilitada, alunos, status, duplicidade e tamanho do lote antes do unico upsert transacional.
- `backend_get_attendance_date_summaries` tambem e exclusiva de `service_role` e agrega todo o historico por data, sem depender da pagina limitada de detalhes retornada ao frontend.

## Templates E Configurações Auxiliares

Tabelas:

- `task_templates`
- `message_templates`

Regra canônica:

- `task_templates` permanece user-owned pela fronteira RLS atual.
- `message_templates` preserva policies user-owned como defesa em profundidade, mas os grants de browser foram revogados e o CRUD passa por `message-templates`.

Migrations de referência:

- `20260227175940_2627352f-cede-4ca7-9337-405e9ca2cb7d.sql`
- `20260309210021_77bab771-f56d-43d3-8fa7-28d8bacbe2ef.sql`
- `20260721170000_secure_communications.sql`

Observações:

- A autorizacao efetiva de `message_templates` e `messages.bulk_send` mais o `actorId` derivado do token; `user_id` nao faz parte do contrato HTTP.

## Tarefas (schema tasks) E Agenda

Tabelas:

- `tasks`
- `task_comments`
- `task_history`
- `tags`
- `task_tags`
- `calendar_events`

Regra canônica:

- `anon` e `authenticated` nao possuem grants diretos em nenhuma das seis tabelas; as policies anteriores permanecem como defesa adicional, mas o acesso da aplicacao passa por `tasks` e `calendar-events` com `service_role`.
- `tasks`: o backend lista/atualiza apenas registros do criador (`created_by`) ou responsavel (`assigned_to`), deriva o criador no insert e permite delete somente ao criador.
- `task_comments`: o backend valida acesso a tarefa, deriva `author_id` no insert e limita delete ao autor, retornando resultado idempotente.
- `task_history`: alteracoes efetivas de tarefa sao registradas com `changed_by` derivado do token.
- `tags`: identidade unica normalizada por `created_by`, label e entidade; find-or-create e vinculo ocorrem atomicamente na RPC service-only `backend_add_task_tag`.
- `task_tags`: adicao valida criador/responsavel e usa `ON CONFLICT DO NOTHING`; remocao e limitada ao criador da tarefa e e idempotente.
- `calendar_events`: consultas e comandos usam `owner` derivado do token; origem manual e intervalos sao definidos/validados no backend.

Migrations de referência:

- `20260317200000_create_tasks_and_agenda.sql` — criação inicial (policies permissivas, substituídas abaixo).
- `20260317210000_extend_tasks_and_agenda_for_ia.sql` — campos adicionais para IA.
- `20260317260000_tighten_tasks_calendar_rls.sql` — **canônica**: remove policies `auth.uid() IS NOT NULL` e substitui por escopo de propriedade real.
- `20260721160000_secure_tasks_and_calendar.sql` — revoga grants de browser, cria consultas service-only e torna tags atomicas por identidade normalizada.

Observações:

- A migration `20260317200000` usava `USING (auth.uid() IS NOT NULL)` — qualquer usuário autenticado lia e gravava todos os registros. Isso foi corrigido pela migration `20260317260000`.
- A política de `calendar_events` é análoga à de `moodle_conversations` (owner-only).
- Tasks do sistema criadas por Edge Functions são inseridas via `service_role` e ficam fora do escopo de RLS.
- A recorrencia do sistema legado (`task_recurrence_configs`) continua processada pela Edge Function `generate-recurring-tasks`; o CRUD moderno de agenda nao delega regras de recorrencia ao navegador.

## Sugestoes da Claris

Tabelas:

- `claris_suggestions`
- `claris_suggestion_cooldowns`

Regra canônica:

- `anon` e `authenticated` nao possuem grants diretos de leitura ou escrita; a aplicacao usa `claris-suggestions` com `service_role` e identidade derivada do token.
- O feed retorna apenas sugestoes pendentes e nao expiradas do ator. `action_payload` e `trigger_context` continuam internos ao backend.
- `backend_act_on_claris_suggestion` e `SECURITY DEFINER`, executavel somente por `service_role`, bloqueia a sugestao com `FOR UPDATE` e atualiza lifecycle, tarefa/evento e cooldown na mesma transacao.
- Retries sobre uma sugestao ja processada retornam conflito e nao duplicam entidades. Payload de acao invalido mantem a sugestao pendente sem escrita parcial.

Migrations de referência:

- `20260317220000_add_claris_suggestions.sql`
- `20260317240000_extend_claris_suggestions_proactive.sql`
- `20260721210000_secure_claris_suggestions.sql`

## Auditoria de Ações da IA

Tabelas:

- `claris_ai_actions`

Regra canônica:

- `claris_ai_actions`: leitura apenas pelo próprio usuário (`user_id = auth.uid()`). Insert autenticado exige `user_id = auth.uid()`; as Edge Functions (service_role) inserem diretamente. Nenhuma policy de UPDATE ou DELETE — linhas são imutáveis.

Migrations de referência:

- `20260317270000_add_claris_ai_audit.sql`

Observações:

- Cada ação mutante iniciada pela IA (create_task, update_task, change_task_status, create_event, update_event, delete_event, confirm_bulk_message_send, cancel_bulk_message_send) grava uma linha nesta tabela via `auditAiAction()` nos executores.
- O payload de args é truncado em 4 KB e campos de texto livre em 500 chars para evitar armazenamento excessivo.
- A imutabilidade é garantida pela ausência de policies de UPDATE/DELETE para roles não-service_role.

## Checklist De Revisão Para Novas Migrations

- Atualizar este documento sempre que uma migration criar, dropar ou reescrever policy.
- Confirmar que nenhuma policy nova usa `true`, `auth.uid() IS NULL` ou escopo amplo desnecessário.
- Confirmar se a tabela é user-owned, course-scoped ou service-role managed antes de escolher a expressão RLS.
- Em tabelas relacionais, preferir validar ownership pelo pai de negócio em vez de repetir `user_id` redundante quando o modelo já possui uma fronteira natural.
