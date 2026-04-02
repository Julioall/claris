# Auditoria de Performance — Claris

> Executada em: 2026-04-01  
> Versão: 1.0  
> Escopo: Frontend, Fronteira de Dados, Auth, Edge Functions, Banco, RLS, Dashboards, Jobs, Integrações Externas

---

## 1. Resumo Executivo

### Top 10 Riscos de Performance

| # | Risco | Camada | Impacto |
|---|-------|--------|---------|
| 1 | N+1 em `listCatalogCoursesForUser()`: 2 queries por curso via `Promise.all` | Banco + Frontend | Crítico |
| 2 | 82+ hooks `useQuery` sem `staleTime` → refetch em todo `window focus` | Frontend | Alto |
| 3 | `risk_history_select` e `students_select`: EXISTS com JOIN duplo via `user_courses → student_courses` avaliado por row | RLS | Alto |
| 4 | `app_settings` lido a cada mensagem no `claris-chat` — sem cache | Edge Functions | Alto |
| 5 | Políticas `USING (true)` do schema inicial potencialmente ainda ativas para `users`, `actions`, `notes`, `risk_history`, `activity_feed` | RLS / Segurança | Crítico |
| 6 | `OR auth.uid() IS NULL` em ~12 policies — fallback inseguro que anula a fronteira | RLS / Segurança | Alto |
| 7 | `dashboard_course_activity_aggregates` com RLS via EXISTS em `user_courses` — anula parte do ganho do pre-compute | Banco + RLS | Alto |
| 8 | Bootstrap do app: `useCourseSync` executa sync pesado + recálculo de risco na abertura da sessão | Auth | Médio/Alto |
| 9 | `useStudentHistory`: waterfall sequencial — snapshots → activities em 2 RTTs separados | Frontend | Médio |
| 10 | Tabelas históricas (`background_job_events`, `risk_history`, `activity_feed`, `claris_ai_actions`) sem estratégia de retenção | Banco | Médio — risco crescente |

### Quick Wins (executáveis em < 1 sprint)

1. `staleTime: 5 * 60_000` nos hooks de catálogo de cursos, dashboard e tarefas
2. Cache module-level de `app_settings` em `claris-chat` com TTL de 10 minutos
3. Índice composto `(user_id, course_id)` em `user_courses` se ausente
4. Índice `(student_id, course_id)` em `student_courses`
5. Índice `(student_id, recorded_at DESC)` em `risk_history`
6. Corrigir policies `USING (true)` remanescentes com migration de correção
7. Paralelizar as duas queries em `useStudentHistory`
8. Migrar N+1 de `listCatalogCoursesForUser` para RPC SQL com contagens agregadas

---

## 2. Diagnóstico por Camada

### 2.1 Frontend

**N+1 em cursos (crítico):**

`listCatalogCoursesForUser()` em `src/features/courses/api/courses.repository.ts` executa:
```
1 query para lista de cursos
+ N queries para listCourseStudentIds(course.id)
+ N queries para countAtRiskStudents(course.id)
= 1 + 2N queries para N cursos
```
Para 20 cursos: ~41 queries. Para 50 cursos: ~101 queries. Isso acontece toda vez que `courseKeys.catalog(userId)` é invalidado — o que ocorre em 10+ mutações diferentes entre `useCoursePanel` e `useAllCoursesData`.

**staleTime ausente:**

82+ chamadas `useQuery()` sem `staleTime` explícito. O default de TanStack Query é `staleTime: 0`, o que significa que qualquer foco de janela, navegação ou remount dispara refetch. Apenas 2 instâncias com `staleTime` configurado encontradas:
- `useStudentHistory.ts`: `staleTime: 5 * 60 * 1000` ✓
- `WhatsAppMessageBubble.tsx`: `staleTime: Infinity` ✓

**Dashboard com sub-queries paralelas:**

`useDashboardData` dispara 9 sub-queries paralelas dentro do repositório via `Promise.all`. A paralelização está correta, mas algumas sub-queries dependem do resultado anterior (ex.: filtrar cursos ongoing → buscar agregados por curso), criando um mini-waterfall oculto. Além disso, sem `staleTime`, qualquer foco de janela reconstrói todas as 9 queries.

**Invalidações excessivas em cursos:**

`courseKeys.catalog(userId)` é invalidado em 10+ locais. Cada mutação de visibilidade de atividade ou acompanhamento de curso reconstrói o catálogo inteiro com N+1.

**Lazy loading:**

O padrão com `React.lazy()` em `src/app/routes/lazy-pages.ts` está correto — todas as 20+ rotas têm code splitting. Risco: módulos pesados (dashboard, campaigns, messages) podem puxar dependências compartilhadas grandes no chunk inicial. Verificar tamanho dos chunks no build.

**Acoplamento em AuthContext:**

`AuthContext` combina `useAuthSession` + `useCourseSync` + `isEditMode`. Qualquer mutação de edição re-renderiza todos os consumidores de `useAuth()` — incluindo componentes que só precisam de sessão. O `useMemo` atenua, mas o acoplamento permanece.

---

### 2.2 Fronteira de Dados

**Positivo:**
- Separação `api/application/infrastructure` está bem respeitada
- Guard de boundary com `npm run guard:supabase-boundary` no CI
- `src/components/ui/api/` é quase vazio (só `tagInput.ts`) — não virou escape hatch

**Riscos:**
- `courses.repository.ts` concentra toda a lógica de agregação de métricas de curso no frontend — deveria ser RPC
- `dashboard.repository.ts` com 9 sub-queries está fazendo trabalho que poderia ser uma única RPC ou Edge Function
- Query keys estáveis por domínio: ✓ bom. Mas invalidações cross-domain podem ser oportunistas

**Quando uma query deveria virar RPC ou Edge Function:**

| Query | Motivo |
|-------|--------|
| `listCatalogCoursesForUser` | N+1 confirmado — RPC com JOIN agregado |
| Sub-queries de dashboard | 9 round trips → 1 RPC de composição |
| `listStudentsAtRisk` por curso | Query repetida em múltiplos contextos |

---

### 2.3 Auth

**Bootstrap pesado:**

Sequência no bootstrap:
```
1. hydrateFromStorage()          — localStorage (síncrono)
2. supabase.auth.getSession()    — DB Supabase
3. fetchMoodleCoursesFromSession() — Moodle externo
4. runBatchedEntitySync()        — N Edge Function calls
5. recalculateRiskForCourses()   — DB com FOR UPDATE locks
6. createBackgroundJob + events  — múltiplas escritas no DB
```

O app fica em loading enquanto etapas 2-3 completam antes de mostrar conteúdo. Etapas 4-6 são assíncronas mas colocam carga imediata no Moodle e banco logo após login.

**useCourseSync com 1000+ linhas:**

É o maior hook da aplicação. Concentra sync, progresso, risco, notificações e jobs. Se uma responsabilidade mudar, o custo de regressão é alto. Cada sync gera múltiplas escritas em `background_job_events` — tabela append-only de crescimento contínuo.

**MoodleSessionContext:**

Leve e correto — passa `moodleSession` sem re-derivar estado. Sem riscos de performance.

**session-storage.ts:**

Leitura síncrona de localStorage no boot pode bloquear levemente em dispositivos lentos com payloads grandes. Verificar tamanho do objeto serializado.

---

### 2.4 Edge Functions

**claris-chat — DB por mensagem:**

A cada mensagem, a função executa:
```typescript
supabase.from('app_settings').select('claris_llm_settings').eq('singleton_id', 'global').maybeSingle()
```
Para 20 mensagens por sessão = 20 queries desnecessárias. Solução: cache module-level com TTL de 10 minutos dentro do worker Deno.

**Cold start:**

Edge Functions com imports pesados (`openai`, bibliotecas de parsing de texto em `moodle-grade-suggestions`) têm cold start maior. No Supabase Edge, cold starts chegam a 200-800ms. Funções chamadas raramente (`data-cleanup`, `generate-proactive-suggestions`) pagam cold start toda vez.

**moodle-grade-suggestions — geração em lote:**

O fluxo `generate_activity_suggestions` monta contexto avaliativo pesado por aluno (assign, seção, recursos, submissão, extração de texto de arquivo). Para lote de 30 alunos, pode consumir 30+ chamadas ao Moodle externo. Sem timeout individual por aluno, um arquivo pesado pode bloquear o lote inteiro.

**bulk-message-send — idempotência no retry:**

O fluxo de `retry` recarrega o job e reprocessa. Verificar se `processBulkMessageJob` filtra recipients com status `sent` antes de reenviar — caso contrário, retry pode re-enviar para recipients já processados.

**Handlers finos:**

`index.ts` de todas as funções analisadas está correto — delegam para `service.ts`. O framework `createHandler` padroniza CORS, auth e parsing. ✓

---

### 2.5 Banco de Dados

**Queries com RLS em tabelas course-scoped:**

As políticas de `student_activities`, `student_courses`, `student_course_grades`, `courses` e `activity_feed` usam:
```sql
EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = <tabela>.course_id AND uc.user_id = auth.uid())
```
Para cada row retornada, o Postgres executa um nested loop com lookup em `user_courses`. Com índice composto `(user_id, course_id)`, o custo é O(log n). Sem esse índice, é O(n) por row.

**risk_history — JOIN duplo mais caro:**

```sql
EXISTS (
  SELECT 1 FROM user_courses uc
  JOIN student_courses sc ON sc.course_id = uc.course_id
  WHERE uc.user_id = auth.uid()
  AND sc.student_id = risk_history.student_id
)
```
Este padrão exige que o Postgres resolva dois joins por row de `risk_history`. Se `risk_history` tiver 100k linhas sem filtro adicional de data/student_id, o custo explode.

**students — mesma lógica do risk_history:**

Mesma política de EXISTS com join duplo. `students` tende a crescer para dezenas de milhares de registros.

**Tabelas históricas sem retenção:**

`background_job_events`, `activity_feed`, `risk_history`, `claris_ai_actions`, `student_sync_snapshots`: crescimento contínuo sem particionamento ou TTL. Estimativa para `background_job_events` com sync diário de 10 cursos: ~50-100 eventos/execução → dezenas de milhares em meses.

**dashboard_course_activity_aggregates parcialmente aproveitado:**

A tabela existe por `course_id` (1 linha por curso). A política SELECT usa EXISTS em `user_courses` — isso elimina parte do ganho do pre-compute pois o RLS ainda faz lookup em `user_courses` para cada linha retornada.

---

### 2.6 RLS

**Policies `USING (true)` remanescentes:**

A migration inicial (`20260127065717`) definiu `USING (true)` para `users`, `courses`, `user_courses`, `students`, `student_courses`, `pending_tasks`, `actions`, `notes`, `risk_history`, `activity_feed`. Migrations posteriores (especialmente `20260211041244`) corrigiram algumas. **O estado atual do banco deve ser verificado via `pg_policies`** — não confiar apenas no histórico de migrations.

**`OR auth.uid() IS NULL` como escape hatch:**

Aparece em ~12 policies (migration `20260204175801`). Para service_role com RLS habilitado, `OR auth.uid() IS NULL` é equivalente a `USING (true)`. É intencional para writes automáticos de Edge Functions com service_role, mas suspeito para reads.

**Custo de `EXISTS` em queries de lote:**

Quando `useDashboardData` busca 120 courses de uma vez (DASHBOARD_BATCH_SIZE = 120), a policy de `student_activities` executa 120 EXISTS lookups em `user_courses`. Com índice adequado, cada lookup é O(log n). Sem o índice, é O(n) por row.

---

### 2.7 Dashboards e Agregações

**`dashboard_course_activity_aggregates` está parcialmente aproveitado:**

O dashboard ainda busca `listStudentsAtRisk()`, `countActiveNormalStudents()`, `listActivityFeedItems()`, `listPendingAssignments()` e `listUncorrectedActivities()` diretamente nas tabelas transacionais. Os agregados cobrem apenas parte do custo.

**Métricas calculadas em tempo real que deveriam ser snapshot:**

- Contagem de alunos em risco: calculada via join filtrado em `student_courses`
- Pendências de correção: calculadas via `student_activities` com filtros compostos

**Múltiplos cards e queries redundantes:**

Se cards do dashboard consomem `useCoursesData` separadamente de `useDashboardData`, há risco de queries duplicadas para a lista de cursos (duas chamadas independentes a `courseKeys.catalog`).

---

### 2.8 Jobs, Scheduler, Campaigns, Mensageria

**Crescimento de `background_job_events`:**

Cada sync gera: 1 job + N job_items (1 por curso) + múltiplos eventos por item. Para sync diário com 10 cursos: ~50-100 eventos/execução.

**`scheduled_messages` e `background_jobs` compartilhando id:**

Design inteligente para integridade, mas cancelamento requer atualizar dois registros em transação.

**Lock contention em jobs concorrentes:**

A migration `20260331143000` adicionou `FOR UPDATE` locks ao calcular risco de alunos — correto para determinismo, mas pode criar contenção se múltiplos jobs de sync executarem em paralelo para cursos sobrepostos.

**`bulk_message_recipients` sem índice em `status`:**

Filtrar recipients por status para retry ou monitoramento pode resultar em scan sequencial se a tabela crescer. Verificar `CREATE INDEX ON bulk_message_recipients(job_id, status)`.

---

### 2.9 Integrações Externas

**Moodle como ponto único de falha do bootstrap:**

Se o Moodle estiver lento, `useCourseSync` bloqueia com timeout. A UI deve mostrar conteúdo do cache antes do sync terminar — verificar se isso acontece proativamente, não apenas após falha.

**IA com retry e backoff:**

`claris-chat` tem timeout de 120 segundos. Sem retry automático, uma resposta lenta do LLM consome o tempo total do edge worker sem fallback. Para `moodle-grade-suggestions` em lote, um aluno com arquivo pesado pode consumir minutos por item.

**Evolution API / WhatsApp:**

Webhooks recebidos em `receive-whatsapp-webhook` são síncronos. Se o processamento for lento, o Evolution pode interpretar como timeout e reenviar. Verificar idempotência por `message_id`.

---

## 3. Hipóteses de Gargalo por Domínio

| Domínio | Gargalo Principal | Severidade |
|---------|-------------------|------------|
| auth | Bootstrap sequencial com sync Moodle | Alto |
| courses | N+1 confirmado (2 queries/curso) | Crítico |
| students | RLS com JOIN duplo + waterfall em useStudentHistory | Alto |
| dashboard | 9 sub-queries paralelas em tabelas transacionais | Alto |
| tasks | Sem staleTime + sistema dual de tags | Médio |
| agenda | useCalendarEvents sem staleTime | Médio |
| messages | getStudentsInCourses + getStudentActivities em batch | Médio |
| campaigns | Sem hooks dedicados (acoplamento direto em componente) | Baixo/Médio |
| whatsapp | receive-webhook síncrono sem idempotência confirmada | Médio |
| background-jobs | Sem hooks + sem retenção de events | Médio |
| services | Queries de status com 7 tabelas relacionadas | Baixo |
| settings | Volume baixo — baixo risco | Baixo |
| reports | Suspeitar de queries pesadas de agregação histórica | Médio |
| admin | Correto — uses pg_trgm para full-text | Baixo |
| claris | app_settings por mensagem + cold start de LLM | Alto |

---

## 4. Riscos Específicos de RLS

### Onde o Custo Pode Explodir

| Tabela | Policy | Trigger do Custo |
|--------|--------|-----------------|
| `students` | EXISTS(user_courses JOIN student_courses) | Query sem filtro por student_id |
| `risk_history` | EXISTS(user_courses JOIN student_courses) | Histórico sem filtro de data |
| `student_activities` | EXISTS(user_courses) | Queries de dashboard não filtradas |
| `activity_feed` | user_id OR EXISTS(user_courses) | Feed de múltiplos cursos |
| `dashboard_course_activity_aggregates` | EXISTS(user_courses) | Anula ganho do pre-compute |

### Como Provar

```sql
-- Estado atual de todas as policies
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;

-- Simular RLS e ver custo
BEGIN;
SET LOCAL role = authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<user-uuid>", "role": "authenticated"}';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM students LIMIT 100;
ROLLBACK;

-- Verificar índices em user_courses
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user_courses';

-- Scans sequenciais
SELECT relname, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables
WHERE relname IN ('students','risk_history','student_activities','user_courses','student_courses')
ORDER BY seq_scan DESC;
```

---

## 5. Índices Recomendados

| Tabela | Índice | Protege | Trade-off |
|--------|--------|---------|-----------|
| `user_courses` | `(user_id, course_id)` | Todas as policies course-scoped | Write overhead em user_courses |
| `student_courses` | `(course_id, student_id)` | JOIN no EXISTS de students/risk_history | Write overhead no sync |
| `student_courses` | `(student_id)` | EXISTS pelo lado aluno | Idem |
| `risk_history` | `(student_id, recorded_at DESC)` | Queries de histórico + RLS | Append-only — custo baixo |
| `risk_history` | `(user_id, recorded_at DESC)` | Path de user_id no RLS | Idem |
| `student_activities` | `(course_id, student_id, status) WHERE hidden = false` | Filtros compostos do dashboard | Write overhead durante sync |
| `activity_feed` | `(user_id, created_at DESC)` | Feed paginado | Write overhead no feed |
| `bulk_message_recipients` | `(job_id, status)` | Retry path | Baixo volume — sem risco |
| `student_sync_snapshots` | `(student_id, course_id, snapshot_date DESC)` | useStudentHistory | Write overhead no sync diário |

---

## 6. Padrões de Query Suspeitos

1. **N+1 via `Promise.all(courses.map(c => fetch(c.id)))`** — N queries reais ao PostgREST
2. **Dashboard com 9 queries paralelas** — correto mas com waterfall oculto de dependências
3. **`useQuery` sem `select:` para transformação** — re-render em qualquer campo do objeto
4. **Invalidação de catalog inteiro após mutação pontual** — reconstrói N+1 após cada mudança
5. **`maybeSingle()` em tabela singleton por request** — `app_settings` lido por mensagem
6. **Queries sem `LIMIT` em tabelas históricas** — `risk_history` sem filtro de data
7. **Waterfall sequencial em `useStudentHistory`** — 2 RTTs onde 1 seria suficiente

---

## 7. Plano de Investigação

### Ordem de prioridade

**Semana 1 — Medir antes de otimizar:**
1. Habilitar `pg_stat_statements` e capturar baseline de 24h
2. Identificar top 20 queries por `total_exec_time` acumulado
3. Auditar Network tab: Dashboard, MeusCursos, StudentProfile — contar requests
4. `EXPLAIN ANALYZE` nas 5 tabelas críticas com RLS simulado
5. Verificar `seq_scan` por tabela em `pg_stat_user_tables`

**Evidências para coletar:**
- Screenshot de Network tab com request count + payload size por tela
- Output de `pg_stat_statements` (query, calls, total_ms, mean_ms)
- Output de `pg_stat_user_tables` (seq_scan, idx_scan)
- `EXPLAIN ANALYZE` das 5 queries mais caras com RLS

---

## 8. Plano de Otimização por Prioridade

### Impacto Alto / Esforço Baixo

| Ação | Ganho Esperado |
|------|----------------|
| `staleTime: 5min` em coursesCatalog, dashboard, tasks, agenda | -70% refetch em window focus |
| Índice `(user_id, course_id)` em `user_courses` | -50% custo RLS course-scoped |
| Índice `(student_id)` em `student_courses` e `risk_history` | -60% custo policy de students/risk |
| Cache module-level de `app_settings` em `claris-chat` | -1 DB query por mensagem |
| Paralelizar queries em `useStudentHistory` | -1 RTT por perfil de aluno |
| Índice `(job_id, status)` em `bulk_message_recipients` | Retry sem scan sequencial |

### Impacto Alto / Esforço Médio

| Ação | Ganho Esperado | Trade-off |
|------|----------------|-----------|
| RPC `get_user_courses_catalog_with_stats` | -40 queries para 20 cursos → 1 RPC | Nova migration + types |
| `useQuery` com `select:` transform seletivo | Evita re-renders | Refactor de hooks |
| Expandir `dashboard_course_activity_aggregates` | Elimina queries transacionais no dashboard | Job de atualização incremental |
| Retenção de `background_job_events` e `risk_history` | Controla crescimento | Job periódico + validação |

### Impacto Alto / Esforço Alto

| Ação | Ganho Esperado | Trade-off |
|------|----------------|-----------|
| Materializar permissões por curso | -90% custo RLS | Trigger em user_courses + sincronização |
| Quebrar `useCourseSync` em background puro | App abre instantaneamente | Grande refactor de auth |
| Particionamento de `background_job_events` por mês | Performance estável com crescimento | Setup pg partitioning |

---

## 9. Checklist de Auditoria

```
BANCO / RLS
[ ] pg_policies auditado — confirmar sobreposição de USING(true)
[ ] Índice composto (user_id, course_id) em user_courses criado
[ ] Índice (student_id, course_id) em student_courses criado
[ ] Índice (student_id, recorded_at) em risk_history criado
[ ] pg_stat_user_tables: tabelas com alto seq_scan identificadas
[ ] EXPLAIN ANALYZE com RLS em students, student_activities, risk_history
[ ] Policies OR auth.uid() IS NULL — intenção documentada por tabela

FRONTEND
[ ] Todos os useQuery sem staleTime identificados (82+) e configurados
[ ] Requests por tela medidos no Network tab
[ ] N+1 em listCatalogCoursesForUser confirmado e resolvido
[ ] Waterfall em useStudentHistory paralelizado
[ ] Duplicação de courseKeys.catalog verificada na mesma sessão

EDGE FUNCTIONS
[ ] claris-chat: cache de app_settings implementado
[ ] moodle-grade-suggestions: timeout por aluno em lote
[ ] bulk-message-send: idempotência de retry confirmada
[ ] receive-whatsapp-webhook: idempotência por message_id
[ ] Latência de cold start medida para funções raramente chamadas

AUTH
[ ] Tempo de bootstrap medido (login → dashboard visível)
[ ] Cache Supabase exibido antes do sync terminar
[ ] Tamanho do payload de session-storage verificado

OBSERVABILIDADE
[ ] pg_stat_statements habilitado e baseline capturado
[ ] Logging de latência em Edge Functions configurado
[ ] Rastreamento de request count por tela implementado
[ ] Retenção de background_job_events e risk_history definida
```

---

## 10. SQL e Diagnósticos

```sql
-- 1. Top 20 queries mais caras
SELECT
  left(query, 100) AS query_excerpt,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round((total_exec_time / sum(total_exec_time) OVER ()) * 100, 2) AS pct_total
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- 2. Scans sequenciais por tabela
SELECT relname AS table, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
  CASE WHEN seq_scan > 0
    THEN round(seq_tup_read::numeric / seq_scan, 0)
    ELSE 0 END AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
WHERE relname IN (
  'students','student_activities','student_courses',
  'risk_history','user_courses','activity_feed',
  'background_job_events','background_jobs','bulk_message_recipients'
)
ORDER BY seq_scan DESC;

-- 3. Crescimento por tabela
SELECT relname AS table,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 4. Policies com USING(true) ou WITH CHECK(true)
SELECT tablename, policyname, cmd, qual AS using_expr, with_check AS check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true' OR qual LIKE '%IS NULL%')
ORDER BY tablename;

-- 5. Crescimento de background_job_events por semana
SELECT date_trunc('week', created_at) AS week,
  count(*) AS events,
  count(DISTINCT job_id) AS jobs
FROM background_job_events
GROUP BY 1 ORDER BY 1 DESC LIMIT 12;

-- 6. Risk history por mês e nível
SELECT date_trunc('month', recorded_at) AS month,
  risk_level, count(*) AS records
FROM risk_history
GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC LIMIT 24;

-- 7. Staleness dos agregados do dashboard
SELECT course_id, updated_at,
  now() - updated_at AS age,
  pending_submissions,
  uncorrected_activities
FROM dashboard_course_activity_aggregates
ORDER BY updated_at ASC LIMIT 20;

-- 8. Jobs acumulados sem limpeza
SELECT status, count(*) AS jobs,
  min(created_at) AS oldest, max(created_at) AS newest
FROM background_jobs GROUP BY status ORDER BY jobs DESC;

-- 9. Bulk message recipients por status
SELECT j.status AS job_status, r.status AS recipient_status,
  count(*) AS count, min(r.created_at) AS oldest
FROM bulk_message_recipients r
JOIN bulk_message_jobs j ON j.id = r.job_id
GROUP BY 1, 2 ORDER BY 3 DESC;

-- 10. Índices em user_courses (verificar se composto existe)
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user_courses';

-- 11. Locks e waits ativos
SELECT pid, now() - query_start AS duration, state, wait_event_type, wait_event,
  left(query, 80) AS query
FROM pg_stat_activity
WHERE state != 'idle' AND now() - query_start > interval '2 seconds'
ORDER BY duration DESC;

-- 12. Cardinalidade de user_courses
SELECT count(DISTINCT user_id) AS users, count(DISTINCT course_id) AS courses,
  count(*) AS total,
  round(count(*)::numeric / count(DISTINCT user_id), 1) AS avg_courses_per_user
FROM user_courses;

-- 13. Simular RLS e medir custo
BEGIN;
SET LOCAL role = authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<user-uuid>", "role": "authenticated"}';
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT * FROM students LIMIT 100;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT * FROM risk_history ORDER BY recorded_at DESC LIMIT 50;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
  SELECT * FROM student_activities
  WHERE course_id = '<uuid>' AND status = 'pending' AND hidden = false;
ROLLBACK;
```

---

## 11. Roadmap de 30 Dias

### Semana 1 — Medir

| Dia | Ação |
|-----|------|
| 1-2 | Habilitar pg_stat_statements. Capturar baseline de tamanho, seq_scans e top queries |
| 3-4 | EXPLAIN ANALYZE em 5 tabelas críticas com RLS. Auditar Network tab nas telas principais |
| 5 | Mapear todos os hooks sem staleTime. Confirmar N+1 em cursos. Documentar evidências |

### Semana 2 — Quick Wins

| Dia | Ação |
|-----|------|
| 6-7 | staleTime: 5min em useCoursesCatalogQuery, useDashboardData, useTasks, useCalendarEvents |
| 7 | Criar migration com índices: user_courses, student_courses, risk_history, student_activities |
| 8 | Cache module-level de app_settings em claris-chat |
| 9 | Paralelizar useStudentHistory. Auditar e corrigir policies USING(true) remanescentes |
| 10 | Re-executar baseline: comparar seq_scans, refetch count, tempo de dashboard |

### Semana 3 — Estrutural

| Dia | Ação |
|-----|------|
| 11-13 | Criar RPC get_user_courses_catalog_with_stats. Migrar listCatalogCoursesForUser |
| 14-15 | Expandir dashboard_course_activity_aggregates. Criar job de atualização incremental |

### Semana 4 — Observabilidade e Retenção

| Dia | Ação |
|-----|------|
| 16-17 | Job de retenção: background_job_events (90d), risk_history (6mo) |
| 18-19 | Logging de latência em Edge Functions críticas |
| 20 | Instrumentação frontend com performance.mark nos hooks principais |
| 21 | Re-baseline completo. Documentar ganhos. Priorizar próximo ciclo |

---

## A. Checklist Resumido

```
[ ] pg_stat_statements habilitado e baseline capturado
[ ] seq_scan por tabela documentado
[ ] Índice (user_id, course_id) em user_courses criado
[ ] Índice (student_id) em student_courses e risk_history criados
[ ] Policies USING(true) ativas auditadas e corrigidas
[ ] OR auth.uid() IS NULL — intenção documentada por tabela
[ ] staleTime adicionado nos 82+ hooks (começar pelos mais acessados)
[ ] N+1 em listCatalogCoursesForUser resolvido via RPC
[ ] useStudentHistory paralelizado
[ ] claris-chat com cache de app_settings
[ ] Dashboard: requests medidos antes/depois
[ ] Bootstrap do app: tempo medido
[ ] bulk_message_recipients: idempotência de retry confirmada
[ ] receive-whatsapp-webhook: idempotência por message_id confirmada
[ ] Retenção de background_job_events e risk_history implementada
```

## B. Experimentos para Validar Hipóteses

| Hipótese | Experimento | Evidência Esperada |
|----------|------------|-------------------|
| N+1 em courses | Logar requests na abertura de MeusCursos com 20 cursos | 41 requests vs. 1 após RPC |
| staleTime=0 causa refetch | Alternar foco entre janelas 10x, contar requests | 10 refetches vs. 0 com staleTime=5min |
| RLS caro em students sem índice | EXPLAIN ANALYZE com e sem índice em user_courses | Hash Join vs. Index Scan |
| app_settings por mensagem | Logar calls em pg_stat_statements para claris-chat | N calls = N mensagens |
| Dashboard waterfall oculto | Waterfall timeline no DevTools | Sequential bars vs. parallel |
| risk_history policy cara | EXPLAIN ANALYZE SELECT * FROM risk_history LIMIT 100 | Nested Loop cost |
| Bootstrap pesado | performance.mark antes/depois de auth init | > 2s indica problema |

## C. Quick Wins

1. `staleTime: 5 * 60_000` em hooks de cursos, dashboard, tasks, agenda — **1 hora, -70% refetch**
2. Cache module-level `app_settings` em `claris-chat` — **30 minutos, -1 DB query/msg**
3. Índice `(user_id, course_id)` em `user_courses` — **5 minutos de migration**
4. Índice `(student_id, recorded_at DESC)` em `risk_history` — **5 minutos**
5. Paralelizar `useStudentHistory` — **1 hora, -1 RTT por perfil**
6. Auditar policies `USING (true)` ativas — **30 minutos + migration**
7. Índice `(job_id, status)` em `bulk_message_recipients` — **5 minutos**

## D. Roadmap de Performance — 30 Dias

```
Semana 1: MEDIR
├── pg_stat_statements baseline
├── Network audit por tela principal
├── EXPLAIN ANALYZE com RLS nas 5 tabelas críticas
└── Documentar evidências e prioridades

Semana 2: QUICK WINS
├── staleTime em hooks prioritários
├── Índices ausentes em user_courses, student_courses, risk_history
├── Cache de app_settings em claris-chat
├── Paralelizar useStudentHistory
└── Corrigir policies USING(true) remanescentes

Semana 3: ESTRUTURAL
├── RPC get_user_courses_catalog_with_stats
├── Expandir dashboard_course_activity_aggregates
├── Job de atualização incremental dos agregados
└── Índice composto em student_activities

Semana 4: OBSERVABILIDADE + RETENÇÃO
├── Job de retenção background_job_events (90 dias)
├── Job de retenção risk_history (6 meses)
├── Logging de latência em Edge Functions
├── Instrumentação frontend
└── Re-baseline e comparação de ganhos
```
