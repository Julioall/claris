# Supabase RLS Canônico

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
- `student_course_grades`: leitura por escopo de curso, escrita automática por `service_role`.
- `task_action_history`: insert permitido para `service_role` e, no fluxo autenticado, somente com validação de ownership e integridade cruzada.
- `courses`: insert continua aceitando `auth.uid() IS NOT NULL`; isso depende do fluxo controlado pelas Edge Functions.
- `user_sync_preferences`: usa `auth.uid()::text` por compatibilidade com o tipo atual da coluna.

## Usuários E Preferências

Tabelas:

- `users`
- `user_courses`
- `user_ignored_courses`
- `user_sync_preferences`
- `action_types`

Regra canônica:

- `users`: o usuário só lê, insere e atualiza a própria linha por `id = auth.uid()`.
- `user_courses`, `user_ignored_courses` e `action_types`: o usuário só opera linhas cujo `user_id = auth.uid()`.
- `user_sync_preferences`: mesmo padrão de posse, com cast para `auth.uid()::text`.

Migrations de referência:

- `20260210031713_1babdea9-fba0-4880-a900-6da75596b250.sql`
- `20260211041244_0ef98547-ca60-4110-a1de-2cc1df4d6c1b.sql`
- `20260205003909_72a4c7fd-cd18-4289-90ce-5a5a1c74050f.sql`

Observações:

- A migration `20260211041244...` é a consolidação que remove o estado mais permissivo anterior.
- O cast em `user_sync_preferences` é aceito, mas deve ser revisitado se o tipo da coluna mudar.

## Sync Acadêmico

Tabelas:

- `courses`
- `students`
- `student_courses`
- `student_activities`
- `student_course_grades`

Regra canônica:

- `courses`: leitura e update por vínculo em `user_courses`; insert autenticado por `auth.uid() IS NOT NULL`.
- `students`: leitura e update apenas se o aluno estiver em algum curso vinculado ao usuário.
- `student_courses`: leitura e escrita validadas pelo `course_id` acessível em `user_courses`.
- `student_activities`: leitura por escopo de curso; escrita automática por `service_role`.
- `student_course_grades`: leitura por escopo de curso; escrita automática por `service_role`.

Migrations de referência:

- `20260203225612_3d928bd1-a5e7-4bb6-a1ec-8754acfeffc5.sql`
- `20260204224551_0df9807b-b129-4c6d-8b68-77bf43bdd29a.sql`
- `20260204194036_0737e748-5485-4860-a650-48737a3eee5d.sql`
- `20260205183218_fix_rls_remove_null_auth.sql`
- `20260211041244_0ef98547-ca60-4110-a1de-2cc1df4d6c1b.sql`

Observações:

- O padrão correto aqui é sempre curso como unidade de autorização, nunca acesso amplo por aluno ou atividade isolada.
- As Edge Functions de sync dependem explicitamente das policies `service_role` em atividades e notas.

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
- `activity_feed`: leitura pelo dono ou por escopo de curso; insert pelo próprio usuário.
- `risk_history`: leitura pelo dono ou por vínculo entre aluno e curso acessível; insert pelo próprio usuário.

Migrations de referência:

- `20260204175801_7c71d9c3-1b20-43a2-8998-a803206a2fab.sql`
- `20260205214915_add_actions_trash.sql`
- `20260205183218_fix_rls_remove_null_auth.sql`
- `20260211041244_0ef98547-ca60-4110-a1de-2cc1df4d6c1b.sql`

Observações:

- A política final de `actions` pressupõe soft delete como regra operacional.
- `activity_feed` e `risk_history` seguem o mesmo princípio de visibilidade contextual por curso já usado no domínio acadêmico.

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
- `message_templates`: user-owned por `user_id = auth.uid()`.
- `bulk_message_jobs`: user-owned por `user_id = auth.uid()`.
- `bulk_message_recipients`: acesso e insert condicionados à posse do job pai.

Migrations de referência:

- `20260218053748_9ccf508c-1a1d-4414-a8b7-9757903c75d6.sql`
- `20260309210021_77bab771-f56d-43d3-8fa7-28d8bacbe2ef.sql`
- `20260310103000_message_template_defaults_and_seed.sql`

Observações:

- `bulk_message_recipients` não deve ganhar política independente por usuário direto; a fronteira correta é o job.
- `message_templates` segue o mesmo padrão user-owned de `task_templates` e `action_types`.

## Attendance

Tabelas:

- `attendance_course_settings`
- `attendance_records`

Regra canônica:

- `attendance_course_settings`: leitura, insert e delete apenas para o próprio `user_id = auth.uid()`.
- `attendance_records`: leitura e delete por `user_id = auth.uid()`.
- `attendance_records` insert e update: exigem `user_id = auth.uid()` e existência de configuração de frequência do mesmo curso para o mesmo usuário.

Migrations de referência:

- `20260212120000_add_attendance_management.sql`
- `20260313143000_reconcile_attendance_schema.sql`
- `20260313133313_1467ce71-94c4-4fd8-86fa-c2a088adf784.sql`

Observações:

- `20260313133313...` deve permanecer como artefato no-op documentado; ela não define o estado final.
- `20260313143000...` é a migration canônica para frequência: remove políticas permissivas duplicadas, reconstrói as policies e corrige FKs para `public.users`.

## Templates E Configurações Auxiliares

Tabelas:

- `task_templates`
- `message_templates`

Regra canônica:

- Ambas são user-owned, com `SELECT`, `INSERT`, `UPDATE` e `DELETE` limitados ao `user_id = auth.uid()`.

Migrations de referência:

- `20260227175940_2627352f-cede-4ca7-9337-405e9ca2cb7d.sql`
- `20260309210021_77bab771-f56d-43d3-8fa7-28d8bacbe2ef.sql`

Observações:

- Embora vivam em domínios funcionais diferentes, a fronteira de autorização é a mesma e deve permanecer consistente.

## Checklist De Revisão Para Novas Migrations

- Atualizar este documento sempre que uma migration criar, dropar ou reescrever policy.
- Confirmar que nenhuma policy nova usa `true`, `auth.uid() IS NULL` ou escopo amplo desnecessário.
- Confirmar se a tabela é user-owned, course-scoped ou service-role managed antes de escolher a expressão RLS.
- Em tabelas relacionais, preferir validar ownership pelo pai de negócio em vez de repetir `user_id` redundante quando o modelo já possui uma fronteira natural.
