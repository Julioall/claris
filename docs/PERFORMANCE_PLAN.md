# Plano de Entrega — Auditoria de Performance

> Referência: [`docs/PERFORMANCE_AUDIT.md`](./PERFORMANCE_AUDIT.md)  
> Branch: `perf/auditoria-2026`

---

## Epics

- [Plano de Entrega — Auditoria de Performance](#plano-de-entrega--auditoria-de-performance)
  - [Epics](#epics)
  - [Epic 1 — Quick Wins: staleTime e cache frontend](#epic-1--quick-wins-staletime-e-cache-frontend)
    - [Tarefas](#tarefas)
  - [Epic 2 — Banco: Índices críticos ausentes](#epic-2--banco-índices-críticos-ausentes)
    - [Tarefas](#tarefas-1)
  - [Epic 3 — RLS: Auditar e corrigir policies problemáticas](#epic-3--rls-auditar-e-corrigir-policies-problemáticas)
    - [Tarefas](#tarefas-2)
  - [Epic 4 — N+1 em catálogo de cursos: RPC](#epic-4--n1-em-catálogo-de-cursos-rpc)
    - [Tarefas](#tarefas-3)
  - [Epic 5 — Dashboard: agregações e redução de queries](#epic-5--dashboard-agregações-e-redução-de-queries)
    - [Tarefas](#tarefas-4)
  - [Epic 6 — Auth: desacoplar bootstrap e sync](#epic-6--auth-desacoplar-bootstrap-e-sync)
    - [Tarefas](#tarefas-5)
  - [Epic 7 — Retenção de tabelas históricas](#epic-7--retenção-de-tabelas-históricas)
    - [Tarefas](#tarefas-6)
  - [Epic 8 — Observabilidade e baseline](#epic-8--observabilidade-e-baseline)
    - [Tarefas](#tarefas-7)
  - [Ordem de Execução Sugerida](#ordem-de-execução-sugerida)

---

## Epic 1 — Quick Wins: staleTime e cache frontend

**Objetivo:** Reduzir refetch desnecessário adicionando `staleTime` nos hooks sem configuração explícita e implementando cache de configurações estáticas nas Edge Functions.

**Impacto esperado:**
- -70% de refetch em window focus para dados estáveis
- -1 DB query por mensagem no claris-chat

**Labels:** `performance`, `frontend`, `quick-win`

### Tarefas

- [ ] Adicionar `staleTime: 5 * 60_000` em `useCoursesCatalogQuery`
  - Base de `useCoursesData` e `useAllCoursesData`; todo foco de janela reconstrói catálogo com N+1 queries
  - Arquivo: `src/features/courses/hooks/useCoursesCatalogQuery.ts`
  - AC: window focus não dispara refetch dentro de 5 min

- [ ] Adicionar `staleTime: 2 * 60_000` em `useDashboardData`
  - Dispara 9 sub-queries paralelas a cada foco de janela
  - Arquivo: `src/features/dashboard/hooks/useDashboardData.ts`
  - AC: validar que dados permanecem frescos para o caso de uso

- [ ] Adicionar `staleTime: 5 * 60_000` em `useTasks` e `useCalendarEvents`
  - Tarefas e calendário são dados estáveis entre edições
  - AC: optimistic updates continuam funcionando

- [ ] Adicionar `staleTime: 3 * 60_000` nos hooks de campaigns e messages
  - Todos os `useQuery` em `src/features/campaigns/` e `src/features/messages/`
  - AC: nenhum refetch desnecessário em window focus para listas paradas

- [ ] Cache module-level de `app_settings` em `claris-chat` (TTL 10 min)
  - A Edge Function busca `app_settings` a cada mensagem enviada (20 queries por sessão ativa)
  - Arquivo: `supabase/functions/claris-chat/index.ts`
  - AC: `pg_stat_statements` confirma redução de queries

---

## Epic 2 — Banco: Índices críticos ausentes

**Objetivo:** Criar índices que protegem as políticas de RLS course-scoped e as queries mais frequentes do dashboard, histórico e jobs.

**Labels:** `performance`, `database`, `quick-win`

### Tarefas

- [ ] Índice composto `(user_id, course_id)` em `user_courses`
  - Âncora de todas as políticas RLS course-scoped; sem índice, EXISTS lookup faz seq scan
  - ```sql
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_courses_user_course
      ON public.user_courses (user_id, course_id);
    ```
  - AC: EXPLAIN ANALYZE mostra Index Scan em vez de Seq Scan

- [ ] Índices em `student_courses` e `risk_history` para JOIN duplo do RLS
  - Policies de `students` e `risk_history` usam JOIN duplo via `user_courses`
  - `idx_student_courses_course_student`: `(course_id, student_id)`
  - `idx_risk_history_student_recorded`: `(student_id, recorded_at DESC)`
  - `idx_risk_history_user_recorded`: `(user_id, recorded_at DESC)`
  - AC: seq_scan em risk_history cai após criação

- [ ] Índice composto em `student_activities (course_id, student_id, status)`
  - Maior tabela transacional do sync Moodle; filtros compostos do dashboard sem índice
  - Índice parcial: `WHERE hidden = false`
  - AC: queries do dashboard usam Index Scan; monitorar write overhead no sync

- [ ] Índices em `bulk_message_recipients` e `student_sync_snapshots`
  - `bulk_message_recipients`: retry filtra por `(job_id, status)` sem índice
  - `student_sync_snapshots`: `useStudentHistory` carrega 60 snapshots sem índice temporal
  - AC: retry de bulk message não executa seq scan

---

## Epic 3 — RLS: Auditar e corrigir policies problemáticas

**Objetivo:** Confirmar o estado atual das políticas de RLS, corrigir `USING (true)` remanescentes e documentar intenção das policies com `OR auth.uid() IS NULL`.

**Labels:** `performance`, `database`

### Tarefas

- [ ] Auditar policies `USING(true)` ativas no banco atual
  - A migration inicial definiu `USING (true)` em várias tabelas core; migrations posteriores podem ter corrigido algumas
  - Executar queries de diagnóstico em produção/staging e documentar estado real
  - AC: lista de policies problemáticas documentada

- [ ] Corrigir policies `USING(true)` remanescentes em tabelas core
  - `actions`, `notes`, `activity_feed` permitem acesso cross-user (segurança + performance)
  - Depende dos resultados da auditoria anterior
  - AC: nenhuma policy com `USING(true)` para tabelas user-owned; CI passa após migration

- [ ] Avaliar materialização de permissões para tabelas course-scoped
  - Queries que retornam 1000+ rows fazem 1000+ lookups em `user_courses`
  - Avaliar custo/benefício antes dos índices simples do Epic 2
  - AC: análise de volume documentada; decisão registrada (materializar ou não)

---

## Epic 4 — N+1 em catálogo de cursos: RPC

**Objetivo:** Eliminar o padrão N+1 em `listCatalogCoursesForUser()` que executa 2 queries por curso.

**Contexto:** Para 20 cursos = 41 queries. Invalidado em 10+ mutações.

**Impacto esperado:** 41 queries → 1 chamada RPC.

**Labels:** `performance`, `database`, `frontend`

### Tarefas

- [ ] Criar RPC `get_user_courses_catalog_with_stats`
  - Função SQL que retorna cursos + `student_count`, `at_risk_count`, `pending_activities_count` em join único
  - `SECURITY DEFINER`, acesso apenas para `authenticated` com `p_user_id`
  - AC: retorna mesmo resultado; execução < 500ms para 50 cursos; tipos gerados atualizados

- [ ] Migrar `listCatalogCoursesForUser` para usar a RPC
  - Arquivo: `src/features/courses/api/courses.repository.ts`
  - Validar `useCoursesData`, `useAllCoursesData`, `useCoursesCatalogQuery`
  - AC: 1 request no Network tab em vez de 41; `npm run typecheck` passa; nenhum teste quebrado

---

## Epic 5 — Dashboard: agregações e redução de queries

**Objetivo:** Reduzir queries na abertura do dashboard expandindo `dashboard_course_activity_aggregates`.

**Contexto:** Dashboard dispara 9 sub-queries paralelas; queries de listagem ainda vão direto nas tabelas transacionais.

**Impacto esperado:** 9 queries → 3-4 na abertura.

**Labels:** `performance`, `database`, `frontend`

### Tarefas

- [ ] Expandir `dashboard_course_activity_aggregates` com métricas adicionais
  - Adicionar: `at_risk_student_count`, `active_student_count`, `uncorrected_activities_count`, `new_at_risk_this_week`
  - AC: dashboard usa agregados em vez de queries transacionais para essas métricas

- [ ] Criar job de atualização incremental dos agregados
  - Trigger/chamada ao final do sync de atividades e após atualização de risco
  - Função: `refresh_course_dashboard_aggregate(p_course_id uuid)`
  - AC: chamada no final da Edge Function `moodle-sync-activities`; `updated_at` reflete sync real

- [ ] Avaliar consolidação das queries do dashboard em RPC única
  - Após expandir os agregados, medir quais queries ainda vão direto nas tabelas transacionais
  - AC: benchmark antes/depois; decisão documentada com evidências de latência

---

## Epic 6 — Auth: desacoplar bootstrap e sync

**Objetivo:** Exibir conteúdo do cache Supabase imediatamente após autenticação, sem bloquear a UI no sync com Moodle.

**Contexto:** Bootstrap atual bloqueia UI enquanto sync de cursos + atividades + risco corre sequencialmente.

**Labels:** `performance`, `auth`, `frontend`

### Tarefas

- [ ] Paralelizar queries em `useStudentHistory` (eliminar waterfall)
  - 2 queries sequenciais independentes (`student_sync_snapshots` e `student_activities`)
  - Substituir por `Promise.all([...])`
  - AC: DevTools mostra requests simultâneos; mesma lógica de composição

- [ ] Garantir exibição do cache Supabase antes do sync Moodle terminar
  - Verificar se o app renderiza dados cached enquanto sync ainda está em progresso
  - AC: dashboard visível com dados cached antes do sync terminar; indicador de staleness exibido

- [ ] Avaliar quebra de `useCourseSync` em serviço de background puro
  - Hook de 1000+ linhas concentra sync, progresso, risco, notificações e jobs
  - Medir tempo real de sync para N cursos em staging antes de qualquer decisão
  - AC: análise custo/benefício documentada; se aprovado, RFC de arquitetura antes de implementar

---

## Epic 7 — Retenção de tabelas históricas

**Objetivo:** Implementar políticas de retenção para tabelas de crescimento contínuo sem histórico infinito.

**Tabelas afetadas:** `background_job_events`, `risk_history`, `activity_feed`, `student_sync_snapshots`.

**Labels:** `performance`, `database`

### Tarefas

- [ ] Job de retenção para `background_job_events` e `background_jobs`
  - ~50-100 eventos por sync; podem acumular dezenas de milhares de linhas em meses
  - TTL sugerido: 90 dias para jobs completados/falhos
  - AC: job implementado (via `data-cleanup` ou scheduled); testado sem deletar jobs ativos

- [ ] Job de retenção para `risk_history` e `activity_feed`
  - `risk_history`: TTL sugerido 6 meses; `activity_feed`: TTL sugerido 60 dias
  - Avaliar Opção A (delete) vs Opção B (mover para tabela de arquivo)
  - AC: TTL definido com justificativa de negócio; primeiro run testado em staging

- [ ] Avaliar retenção e compressão de `student_sync_snapshots`
  - 500 alunos × 10 cursos × 365 dias = 1,8M linhas/ano; `useStudentHistory` usa apenas últimos 60
  - Medir volume atual antes de decidir TTL
  - AC: volume atual medido; política de retenção definida (90 dias sugerido)

---

## Epic 8 — Observabilidade e baseline

**Objetivo:** Estabelecer linha de base de performance para medir impacto de cada otimização.

> Este epic deve ser priorizado **antes** das otimizações — medir primeiro, depois otimizar.

**Labels:** `performance`, `observability`

### Tarefas

- [ ] Habilitar `pg_stat_statements` e capturar baseline de queries
  - Verificar se está ativo; se não, habilitar via Supabase Dashboard > Extensions
  - Capturar: top 20 queries mais lentas + seq_scan por tabela crítica
  - AC: baseline salvo; processo de re-captura agendado após otimizações dos Epics 2 e 4

- [ ] Auditar request count e payload por tela principal
  - Registrar: requests, payload (KB), request mais lento (ms), refetch em window focus
  - Telas: Dashboard, Meus Cursos, Perfil de aluno, Tarefas, Automações, Claris chat
  - AC: tabela preenchida antes/depois das otimizações de staleTime

- [ ] EXPLAIN ANALYZE nas 5 tabelas críticas com RLS simulado
  - Simular contexto `authenticated` e rodar EXPLAIN nas tabelas: `students`, `risk_history`, `student_activities`, `dashboard_course_activity_aggregates`, `activity_feed`
  - AC: confirmar quais índices do Epic 2 são mais urgentes

- [ ] Adicionar logging de latência nas Edge Functions críticas
  - Logs estruturados (JSON) em: `claris-chat`, `moodle-grade-suggestions`, `bulk-message-send`, `moodle-sync-activities`
  - AC: logs visíveis no Supabase Dashboard; alertas para funções > 30s

- [ ] Medir tempo de bootstrap do app (login → dados visíveis)
  - Target: < 1s ✓ aceitável, 1-3s ⚠️ investigar, > 3s 🔴 problema
  - Medir em 3 sessões diferentes
  - AC: se > 2s, issue de prioridade criado com evidência

---

## Ordem de Execução Sugerida

```
Epic 8 (baseline) → Epic 1 (quick wins) → Epic 2 (índices) → Epic 3 (RLS audit)
     → Epic 4 (N+1 RPC) → Epic 5 (dashboard) → Epic 6 (auth) → Epic 7 (retenção)
```

> Medir depois de cada epic para confirmar o impacto antes de prosseguir.
