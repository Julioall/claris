#!/usr/bin/env bash
# =============================================================================
# create-perf-issues.sh
#
# Cria todas as tasks e subtasks da auditoria de performance no GitHub.
# Pré-requisito: gh CLI instalado e autenticado (gh auth login)
#
# Uso:
#   chmod +x scripts/create-perf-issues.sh
#   ./scripts/create-perf-issues.sh
# =============================================================================

set -euo pipefail

REPO="Julioall/claris"

echo "============================================="
echo " Claris — Criação de Issues de Performance"
echo "============================================="
echo ""

# ---------------------------------------------------------------------------
# 1. Criar labels necessárias (ignora erro se já existir)
# ---------------------------------------------------------------------------
echo "▶ Criando labels..."

create_label() {
  gh label create "$1" --color "$2" --description "$3" --repo "$REPO" 2>/dev/null || true
}

create_label "performance"    "#e11d48" "Performance optimization"
create_label "database"       "#7c3aed" "Database / SQL / RLS"
create_label "frontend"       "#0284c7" "Frontend / React"
create_label "edge-function"  "#059669" "Supabase Edge Functions"
create_label "epic"           "#f97316" "Epic / issue pai"
create_label "observability"  "#6366f1" "Observabilidade e monitoramento"
create_label "auth"           "#dc2626" "Autenticação e sessão"
create_label "quick-win"      "#16a34a" "Baixo esforço, alto impacto"

echo "✓ Labels criadas"
echo ""

# ---------------------------------------------------------------------------
# Helper para criar issue e retornar número
# ---------------------------------------------------------------------------
create_issue() {
  local title="$1"
  local body="$2"
  local labels="$3"

  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$body" \
    --label "$labels" \
    2>/dev/null | grep -oE '[0-9]+$'
}

# ---------------------------------------------------------------------------
# EPIC 1 — Quick Wins: staleTime e cache frontend
# ---------------------------------------------------------------------------
echo "▶ [1/8] Epic: Quick Wins — staleTime e cache frontend..."

EPIC1=$(gh issue create \
  --repo "$REPO" \
  --title "[PERF] Epic: Quick Wins — staleTime e cache frontend" \
  --body "## Objetivo

Reduzir refetch desnecessário no frontend adicionando \`staleTime\` nos hooks sem configuração explícita e implementando cache de configurações estáticas nas Edge Functions.

## Contexto da auditoria

82+ chamadas \`useQuery()\` sem \`staleTime\` explícito usam o default \`staleTime: 0\`, o que significa que qualquer foco de janela, navegação ou remount dispara um novo refetch. Para dados estáveis (cursos, tarefas, calendário), isso gera tráfego desnecessário de rede e carga no banco.

## Impacto esperado
- **-70%** de refetch em window focus para dados estáveis
- **-1 DB query por mensagem** no claris-chat

## Sub-issues
Veja os issues filhos linkados nesta thread.

## Referência
Auditoria: \`docs/PERFORMANCE_AUDIT.md\` — Seção 2 (Frontend) e Seção 4 (Edge Functions)" \
  --label "performance,frontend,epic" \
  2>/dev/null | grep -oE '[0-9]+$')

echo "  Epic 1 criado: #$EPIC1"

# Sub-issues do Epic 1
SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Adicionar staleTime em useCoursesCatalogQuery" \
  --body "## Contexto

\`useCoursesCatalogQuery\` é a base de \`useCoursesData\` e \`useAllCoursesData\`. Sem \`staleTime\`, reconstrói o catálogo de cursos (com N+1 queries) em todo foco de janela.

## Solução

\`\`\`typescript
// src/features/courses/hooks/useCoursesCatalogQuery.ts
return useQuery({
  queryKey: courseKeys.catalog(userId),
  queryFn: () => listCatalogCoursesForUser(userId!),
  staleTime: 5 * 60 * 1000,  // 5 minutos
  enabled: Boolean(userId),
});
\`\`\`

## Acceptance criteria
- [ ] \`staleTime: 5 * 60_000\` adicionado em \`useCoursesCatalogQuery\`
- [ ] Verificar no Network tab que window focus não dispara refetch dentro de 5 minutos

## Parent
Parte do epic #$EPIC1" \
  --label "performance,frontend,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: staleTime em useCoursesCatalogQuery"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Adicionar staleTime em useDashboardData" \
  --body "## Contexto

\`useDashboardData\` dispara 9 sub-queries paralelas. Sem \`staleTime\`, qualquer foco de janela reconstrói todas as queries do dashboard.

## Solução

\`\`\`typescript
// src/features/dashboard/hooks/useDashboardData.ts
return useQuery({
  queryKey: dashboardKeys.data(userId, selectedWeek, courseFilter),
  queryFn: () => dashboardRepository.getDashboardData(...),
  staleTime: 2 * 60 * 1000,  // 2 minutos
});
\`\`\`

## Acceptance criteria
- [ ] \`staleTime: 2 * 60_000\` adicionado (dados de dashboard mudam menos frequentemente)
- [ ] Validar que dados ficam frescos suficientes para o caso de uso

## Parent
Parte do epic #$EPIC1" \
  --label "performance,frontend,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: staleTime em useDashboardData"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Adicionar staleTime em useTasks e useCalendarEvents" \
  --body "## Contexto

Tarefas e eventos de calendário são dados relativamente estáveis. Sem \`staleTime\`, cada foco de janela refetch a lista inteira.

## Solução
- \`useTasks\`: \`staleTime: 5 * 60_000\`
- \`useCalendarEvents\`: \`staleTime: 5 * 60_000\`
- Verificar demais hooks de agenda sem staleTime

## Acceptance criteria
- [ ] \`staleTime\` adicionado nos dois hooks
- [ ] Otimistic updates continuam funcionando corretamente

## Parent
Parte do epic #$EPIC1" \
  --label "performance,frontend,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: staleTime em useTasks e useCalendarEvents"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Adicionar staleTime nos hooks de campaigns e messages" \
  --body "## Contexto

Os slices de campaigns e messages não possuem hooks dedicados com \`staleTime\`. Listas de bulk jobs, mensagens agendadas e templates são dados estáveis entre edições.

## Solução
- Identificar todos os \`useQuery\` em \`src/features/campaigns/\` e \`src/features/messages/\`
- Adicionar \`staleTime: 3 * 60_000\` em queries de listagem

## Acceptance criteria
- [ ] Todos os useQuery de campaigns com staleTime configurado
- [ ] Todos os useQuery de messages com staleTime configurado
- [ ] Nenhum refetch desnecessário em window focus para listas paradas

## Parent
Parte do epic #$EPIC1" \
  --label "performance,frontend,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: staleTime em campaigns e messages"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Cache module-level de app_settings em claris-chat" \
  --body "## Contexto

A Edge Function \`claris-chat\` executa:
\`\`\`typescript
supabase.from('app_settings').select('claris_llm_settings').eq('singleton_id', 'global').maybeSingle()
\`\`\`
em **cada mensagem enviada**. Para um usuário ativo com 20 mensagens por sessão = 20 queries desnecessárias.

## Solução

Implementar cache module-level com TTL:

\`\`\`typescript
// supabase/functions/claris-chat/index.ts
let cachedSettings: SettingsJson | null = null;
let settingsCachedAt = 0;
const SETTINGS_TTL_MS = 10 * 60 * 1000; // 10 minutos

async function readStoredSettings(userId: string): Promise<SettingsJson> {
  const now = Date.now();
  if (cachedSettings && now - settingsCachedAt < SETTINGS_TTL_MS) {
    return cachedSettings;
  }
  const { data } = await supabase.from('app_settings')...
  cachedSettings = data?.claris_llm_settings ?? defaultSettings;
  settingsCachedAt = now;
  return cachedSettings;
}
\`\`\`

## Trade-off
Mudanças em \`app_settings\` levam até 10 minutos para refletir no chat. Aceitável para configurações de LLM.

## Acceptance criteria
- [ ] Cache implementado com TTL de 10 minutos
- [ ] pg_stat_statements confirma redução de queries em claris_chat

## Parent
Parte do epic #$EPIC1" \
  --label "performance,edge-function,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: cache app_settings em claris-chat"

echo "  ✓ Epic 1 concluído"
echo ""

# ---------------------------------------------------------------------------
# EPIC 2 — Banco: Índices críticos ausentes
# ---------------------------------------------------------------------------
echo "▶ [2/8] Epic: Banco — Índices críticos ausentes..."

EPIC2=$(gh issue create \
  --repo "$REPO" \
  --title "[PERF] Epic: Banco — Índices críticos para RLS e queries frequentes" \
  --body "## Objetivo

Criar os índices que protegem as políticas de RLS course-scoped e as queries mais frequentes do dashboard, histórico e jobs.

## Contexto da auditoria

As políticas de RLS em tabelas como \`student_activities\`, \`student_courses\`, \`risk_history\` e \`students\` usam:
\`\`\`sql
EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = X AND uc.user_id = auth.uid())
\`\`\`
Sem índice composto \`(user_id, course_id)\` em \`user_courses\`, cada row retornada executa um scan. Para tabelas com milhares de registros, isso escala quadraticamente.

## Sub-issues
Veja os issues filhos linkados nesta thread.

## Diagnóstico
\`\`\`sql
SELECT relname, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables
WHERE relname IN ('user_courses','student_courses','risk_history','student_activities')
ORDER BY seq_scan DESC;
\`\`\`

## Referência
Auditoria: \`docs/PERFORMANCE_AUDIT.md\` — Seção 5 (Banco) e Seção 6 (RLS)" \
  --label "performance,database,epic" \
  2>/dev/null | grep -oE '[0-9]+$')

echo "  Epic 2 criado: #$EPIC2"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Índice composto (user_id, course_id) em user_courses" \
  --body "## Contexto

\`user_courses\` é a âncora de todas as políticas RLS course-scoped. Sem índice composto, cada EXISTS lookup faz scan.

## Verificar antes

\`\`\`sql
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user_courses';
\`\`\`

## Migration proposta

\`\`\`sql
-- Se não existir:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_courses_user_course
  ON public.user_courses (user_id, course_id);
\`\`\`

## Queries/policies protegidas
- \`courses_select\`: EXISTS em user_courses por course_id + user_id
- \`student_activities_select\`: idem
- \`student_courses_select\`: idem
- \`dashboard_course_activity_aggregates_select\`: idem

## Acceptance criteria
- [ ] Índice criado via migration
- [ ] EXPLAIN ANALYZE de query com RLS mostra Index Scan em vez de Seq Scan
- [ ] Redução em seq_scan na pg_stat_user_tables para user_courses

## Parent
Parte do epic #$EPIC2" \
  --label "performance,database,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: índice user_courses"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Índices em student_courses e risk_history para JOIN duplo do RLS" \
  --body "## Contexto

As políticas de \`students\` e \`risk_history\` usam JOIN duplo:
\`\`\`sql
EXISTS (
  SELECT 1 FROM user_courses uc
  JOIN student_courses sc ON sc.course_id = uc.course_id
  WHERE uc.user_id = auth.uid()
  AND sc.student_id = <table>.student_id
)
\`\`\`
Sem índice em \`student_courses (course_id, student_id)\` e \`risk_history (student_id)\`, o custo por row é O(n).

## Migration proposta

\`\`\`sql
-- student_courses: suporte ao JOIN pelo lado curso
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_courses_course_student
  ON public.student_courses (course_id, student_id);

-- risk_history: lookup por aluno com ordenação temporal
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_history_student_recorded
  ON public.risk_history (student_id, recorded_at DESC);

-- risk_history: lookup por usuário
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_history_user_recorded
  ON public.risk_history (user_id, recorded_at DESC);
\`\`\`

## Acceptance criteria
- [ ] Migration criada e aplicada
- [ ] EXPLAIN ANALYZE em SELECT de risk_history com filtro de student_id mostra Index Scan
- [ ] seq_scan em risk_history cai após criação

## Parent
Parte do epic #$EPIC2" \
  --label "performance,database,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: índices student_courses e risk_history"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Índice composto em student_activities (course_id, student_id, status)" \
  --body "## Contexto

\`student_activities\` é a maior tabela transacional do sync Moodle. As queries de dashboard filtram por:
- \`course_id\` (para agregar por curso)
- \`status\` (pending, submitted, overdue)
- \`hidden = false\`
- \`student_id\` (perfil do aluno)

## Verificar

\`\`\`sql
SELECT indexname FROM pg_indexes WHERE tablename = 'student_activities';
\`\`\`

## Migration proposta

\`\`\`sql
-- Suporte a filtros compostos do dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_activities_course_student_status
  ON public.student_activities (course_id, student_id, status)
  WHERE hidden = false;

-- Suporte a queries de atividades não corrigidas
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_activities_course_status_hidden
  ON public.student_activities (course_id, status, hidden);
\`\`\`

## Acceptance criteria
- [ ] Índices criados sem impactar performance de writes de sync
- [ ] Queries de dashboard usam Index Scan em student_activities
- [ ] Monitorar tempo de sync após adição dos índices (write overhead aceitável)

## Parent
Parte do epic #$EPIC2" \
  --label "performance,database,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: índice student_activities"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Índices em bulk_message_recipients e student_sync_snapshots" \
  --body "## Contexto

**bulk_message_recipients**: retry de bulk message filtra por \`job_id\` + \`status\`. Sem índice composto, é seq scan.

**student_sync_snapshots**: \`useStudentHistory\` carrega 60 snapshots por aluno com limite. Sem índice por aluno + data, pode escanear snapshots antigos.

## Migration proposta

\`\`\`sql
-- bulk_message_recipients
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bulk_recipients_job_status
  ON public.bulk_message_recipients (job_id, status);

-- student_sync_snapshots
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_snapshots_student_date
  ON public.student_sync_snapshots (student_id, course_id, snapshot_date DESC);
\`\`\`

## Acceptance criteria
- [ ] Índices criados
- [ ] Retry de bulk message não executa seq scan em recipients
- [ ] useStudentHistory usa index scan

## Parent
Parte do epic #$EPIC2" \
  --label "performance,database,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: índices bulk_recipients e snapshots"

echo "  ✓ Epic 2 concluído"
echo ""

# ---------------------------------------------------------------------------
# EPIC 3 — RLS: Auditar e corrigir policies problemáticas
# ---------------------------------------------------------------------------
echo "▶ [3/8] Epic: RLS — Auditar e corrigir policies problemáticas..."

EPIC3=$(gh issue create \
  --repo "$REPO" \
  --title "[PERF] Epic: RLS — Auditar e corrigir policies permissivas" \
  --body "## Objetivo

Confirmar o estado atual das políticas de RLS no banco, corrigir \`USING (true)\` remanescentes e documentar intenção das policies com \`OR auth.uid() IS NULL\`.

## Contexto da auditoria

A migration inicial (\`20260127065717\`) definiu \`USING (true)\` para múltiplas tabelas core. Migrations posteriores corrigiram parte, mas usando \`OR auth.uid() IS NULL\` que é semanticamente equivalente a \`USING (true)\` para service_role.

**O que importa é o estado atual do banco**, não o histórico de migrations.

## Diagnóstico inicial

\`\`\`sql
-- Listar policies permissivas ativas
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true' OR qual LIKE '%IS NULL%')
ORDER BY tablename;
\`\`\`

## Sub-issues
Veja os issues filhos linkados nesta thread.

## Referência
Auditoria: \`docs/PERFORMANCE_AUDIT.md\` — Seção 6 (RLS)" \
  --label "performance,database,epic" \
  2>/dev/null | grep -oE '[0-9]+$')

echo "  Epic 3 criado: #$EPIC3"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Auditar policies USING(true) ativas no banco atual" \
  --body "## Contexto

A migration inicial definiu \`USING (true)\` para tabelas como \`users\`, \`courses\`, \`actions\`, \`notes\`, \`risk_history\`, \`activity_feed\`. Migrations posteriores podem ter sobrescrito algumas — precisamos confirmar o estado atual.

## Diagnóstico

\`\`\`sql
-- Policies com USING(true) ou WITH CHECK(true)
SELECT tablename, policyname, cmd, qual AS using_expr, with_check AS check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename;

-- Policies com OR auth.uid() IS NULL
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual LIKE '%IS NULL%'
ORDER BY tablename;
\`\`\`

## Entregável
- Planilha/lista de policies que precisam ser corrigidas
- Confirmação de quais foram corrigidas por migrations posteriores
- Decisão documentada sobre políticas de service_role intencionalmente permissivas

## Acceptance criteria
- [ ] Query executada em produção/staging
- [ ] Lista de policies problemáticas documentada
- [ ] Issue #$EPIC3 atualizado com resultado

## Parent
Parte do epic #$EPIC3" \
  --label "performance,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: auditar USING(true)"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Corrigir policies USING(true) remanescentes em tabelas core" \
  --body "## Pré-requisito
Depende dos resultados da auditoria do issue anterior.

## Contexto

Tabelas como \`actions\`, \`notes\`, \`activity_feed\` com \`USING (true)\` permitem que qualquer usuário autenticado veja registros de outros usuários. Isso é tanto um problema de segurança quanto de performance (sem filtro, retorna todas as linhas).

## Migration proposta (template)

\`\`\`sql
-- actions: restringir por user_id
DROP POLICY IF EXISTS \"Users can view actions\" ON public.actions;
CREATE POLICY \"actions_select\" ON public.actions
  FOR SELECT USING (user_id = auth.uid());

-- notes: idem
DROP POLICY IF EXISTS \"Users can view notes\" ON public.notes;
CREATE POLICY \"notes_select\" ON public.notes
  FOR SELECT USING (user_id = auth.uid());

-- activity_feed: já tem policy mais restrita em migration posterior — confirmar
\`\`\`

**Adaptar com base no resultado da auditoria.**

## Acceptance criteria
- [ ] Nenhuma policy em produção com USING(true) para tabelas user-owned
- [ ] Testes de regressão: funcionalidades afetadas continuam operando
- [ ] CI passa após migration

## Parent
Parte do epic #$EPIC3" \
  --label "performance,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: corrigir USING(true)"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Avaliar materialização de permissões para tabelas course-scoped" \
  --body "## Contexto

Todas as tabelas course-scoped executam:
\`\`\`sql
EXISTS (SELECT 1 FROM user_courses WHERE course_id = X AND user_id = auth.uid())
\`\`\`
por row retornada. Para queries que retornam 1000+ rows, isso é 1000+ lookups em user_courses.

## Solução proposta (impacto alto, esforço alto)

Criar tabela auxiliar materializada:
\`\`\`sql
CREATE TABLE user_accessible_courses (
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  PRIMARY KEY (user_id, course_id)
);
\`\`\`

Manter sincronizada via trigger em \`user_courses\`. Substituir EXISTS nas policies por lookup simples nessa tabela.

## Trade-off
- Custo: trigger em user_courses para cada INSERT/DELETE/UPDATE
- Ganho: EXISTS de O(log n) vs O(1) com índice de cobertura
- Complexidade: sincronização entre user_courses e user_accessible_courses

## Decisão necessária
Avaliar se o volume atual justifica essa complexidade. Priorizar índices simples primeiro (epic #$EPIC2) e medir impacto antes de materializar.

## Acceptance criteria
- [ ] Análise de volume: quantas rows retorna a query mais cara com RLS?
- [ ] Decisão documentada: materializar ou não com justificativa
- [ ] Se materializar: migration + trigger + atualização das policies

## Parent
Parte do epic #$EPIC3" \
  --label "performance,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: materialização de permissões"

echo "  ✓ Epic 3 concluído"
echo ""

# ---------------------------------------------------------------------------
# EPIC 4 — N+1 em catálogo de cursos: RPC
# ---------------------------------------------------------------------------
echo "▶ [4/8] Epic: N+1 em catálogo de cursos — Migrar para RPC..."

EPIC4=$(gh issue create \
  --repo "$REPO" \
  --title "[PERF] Epic: N+1 em catálogo de cursos — Migrar para RPC SQL" \
  --body "## Objetivo

Eliminar o padrão N+1 em \`listCatalogCoursesForUser()\` que executa 2 queries por curso (student count + at-risk count).

## Contexto da auditoria

\`\`\`typescript
// courses.repository.ts — N+1 confirmado
return Promise.all(
  datedCourses.map(async (course) => {
    const studentIds = await listCourseStudentIds(course.id);   // Query por curso
    const atRiskCount = await countAtRiskStudents(course.id);   // Query por curso
  })
)
\`\`\`

Para 20 cursos = **41 queries**. Invalidado em 10+ mutações.

## Impacto esperado
- 41 queries → 1 chamada RPC para 20 cursos
- Invalidações mais eficientes

## Sub-issues
Veja os issues filhos linkados nesta thread.

## Referência
Auditoria: \`docs/PERFORMANCE_AUDIT.md\` — Seção 2 (Frontend), Seção 5 (Banco)" \
  --label "performance,database,frontend,epic" \
  2>/dev/null | grep -oE '[0-9]+$')

echo "  Epic 4 criado: #$EPIC4"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Criar RPC get_user_courses_catalog_with_stats" \
  --body "## Contexto

Substituir N+1 queries por uma única função SQL que retorna cursos + contagens agregadas.

## Migration proposta

\`\`\`sql
CREATE OR REPLACE FUNCTION public.get_user_courses_catalog_with_stats(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  moodle_course_id bigint,
  name text,
  short_name text,
  start_date timestamptz,
  end_date timestamptz,
  is_following boolean,
  student_count bigint,
  at_risk_count bigint,
  pending_activities_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS \$\$
  SELECT
    c.id,
    c.moodle_course_id,
    c.name,
    c.short_name,
    c.start_date,
    c.end_date,
    uc.is_following,
    COUNT(DISTINCT sc.student_id) AS student_count,
    COUNT(DISTINCT sc.student_id) FILTER (
      WHERE sc.risk_level IN ('risco', 'critico', 'atencao')
    ) AS at_risk_count,
    COUNT(sa.id) FILTER (
      WHERE sa.status = 'pending' AND sa.hidden = false
    ) AS pending_activities_count
  FROM public.courses c
  JOIN public.user_courses uc ON uc.course_id = c.id AND uc.user_id = p_user_id
  LEFT JOIN public.student_courses sc ON sc.course_id = c.id
  LEFT JOIN public.student_activities sa ON sa.course_id = c.id
  GROUP BY c.id, c.moodle_course_id, c.name, c.short_name,
           c.start_date, c.end_date, uc.is_following
  ORDER BY c.start_date DESC;
\$\$;

-- RLS: só pode chamar para próprio user_id
REVOKE ALL ON FUNCTION public.get_user_courses_catalog_with_stats FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_courses_catalog_with_stats TO authenticated;
\`\`\`

## Acceptance criteria
- [ ] Função criada e testada com dados reais
- [ ] Retorna mesmo resultado que N+1 anterior
- [ ] Tempo de execução < 500ms para 50 cursos
- [ ] Tipos gerados atualizados em supabase/types.ts e integrations/supabase/types.ts

## Parent
Parte do epic #$EPIC4" \
  --label "performance,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: criar RPC"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Migrar listCatalogCoursesForUser para usar RPC SQL" \
  --body "## Pré-requisito
RPC criada no issue anterior.

## Contexto

Substituir a chamada N+1 em \`courses.repository.ts\` pela RPC, manter a interface pública do hook e atualizar os tipos.

## Mudanças necessárias

1. \`src/features/courses/api/courses.repository.ts\` — substituir implementação N+1
2. \`src/integrations/supabase/types.ts\` — adicionar tipo de retorno da RPC
3. Validar que \`useCoursesData\`, \`useAllCoursesData\` e \`useCoursesCatalogQuery\` continuam funcionando

## Acceptance criteria
- [ ] N+1 eliminado — confirmado via Network tab (1 request em vez de 41)
- [ ] Dados de student_count e at_risk_count corretos
- [ ] Nenhum teste quebrado
- [ ] \`npm run typecheck\` passa

## Parent
Parte do epic #$EPIC4" \
  --label "performance,frontend,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: migrar repository"

echo "  ✓ Epic 4 concluído"
echo ""

# ---------------------------------------------------------------------------
# EPIC 5 — Dashboard: agregações e redução de queries
# ---------------------------------------------------------------------------
echo "▶ [5/8] Epic: Dashboard — Reduzir queries e expandir agregados..."

EPIC5=$(gh issue create \
  --repo "$REPO" \
  --title "[PERF] Epic: Dashboard — Expandir agregados e reduzir queries transacionais" \
  --body "## Objetivo

Reduzir o número de queries disparadas na abertura do dashboard expandindo \`dashboard_course_activity_aggregates\` e potencialmente consolidando queries em RPC.

## Contexto da auditoria

O dashboard atual dispara 9 sub-queries paralelas, incluindo consultas diretas em tabelas transacionais (\`student_activities\`, \`student_courses\`) que já têm dados pre-computáveis na tabela de agregados.

\`dashboard_course_activity_aggregates\` existe por curso mas cobre apenas métricas parciais. As queries de \`listStudentsAtRisk\`, \`listUncorrectedActivities\`, \`listPendingAssignments\` ainda vão direto nas tabelas.

## Impacto esperado
- Abertura do dashboard: 9 queries → potencialmente 3-4
- Dados de agregados atualizados de forma incremental

## Sub-issues
Veja os issues filhos linkados nesta thread.

## Referência
Auditoria: \`docs/PERFORMANCE_AUDIT.md\` — Seção 7 (Dashboards)" \
  --label "performance,database,frontend,epic" \
  2>/dev/null | grep -oE '[0-9]+$')

echo "  Epic 5 criado: #$EPIC5"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Expandir dashboard_course_activity_aggregates com métricas adicionais" \
  --body "## Contexto

A tabela atual armazena métricas parciais por curso. Expandir com:
- \`at_risk_student_count\`: alunos em risco (risco/critico/atencao)
- \`active_student_count\`: alunos com status normal
- \`uncorrected_activities_count\`: atividades pendentes de correção
- \`new_at_risk_this_week\`: alunos que mudaram de risco na última semana

## Migration proposta

\`\`\`sql
ALTER TABLE public.dashboard_course_activity_aggregates
  ADD COLUMN IF NOT EXISTS at_risk_student_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_student_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uncorrected_activities_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_at_risk_this_week int NOT NULL DEFAULT 0;
\`\`\`

Criar função de atualização incremental chamada pelo job de sync.

## Acceptance criteria
- [ ] Colunas adicionadas
- [ ] Função de atualização criada e testada
- [ ] Dashboard usa agregados em vez de queries transacionais para essas métricas

## Parent
Parte do epic #$EPIC5" \
  --label "performance,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: expandir agregados"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Criar job de atualização incremental dos agregados do dashboard" \
  --body "## Contexto

Os agregados precisam ser atualizados quando:
1. Um sync de atividades/alunos é concluído
2. O risco de um aluno é atualizado
3. Uma atividade é marcada como corrigida

## Solução

Trigger ou chamada explícita ao final do sync para recalcular o agregado do curso:

\`\`\`sql
CREATE OR REPLACE FUNCTION public.refresh_course_dashboard_aggregate(p_course_id uuid)
RETURNS void LANGUAGE plpgsql AS \$\$
BEGIN
  INSERT INTO public.dashboard_course_activity_aggregates (course_id, ...)
  SELECT
    p_course_id,
    COUNT(...) FILTER (WHERE ...) AS pending_submissions,
    ...
  ON CONFLICT (course_id) DO UPDATE SET
    pending_submissions = EXCLUDED.pending_submissions,
    ...,
    updated_at = now();
END;
\$\$;
\`\`\`

## Acceptance criteria
- [ ] Função de refresh criada
- [ ] Chamada no final do sync de atividades (Edge Function moodle-sync-activities)
- [ ] Chamada após atualização de risco
- [ ] updated_at reflete o momento real do último sync

## Parent
Parte do epic #$EPIC5" \
  --label "performance,database,edge-function" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: job de atualização incremental"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Avaliar consolidação das queries do dashboard em RPC única" \
  --body "## Contexto

Após expandir os agregados, avaliar se ainda vale consolidar as 9 sub-queries restantes em uma Edge Function ou RPC de composição.

## Análise necessária

1. Quais queries ainda vão direto nas tabelas transacionais após expandir os agregados?
2. O custo de uma RPC adicional justifica a redução de round trips?
3. Há latência de rede significativa entre as 9 queries paralelas?

## Decisão

Esta issue é de **avaliação** — pode resultar em:
- Criar Edge Function \`get-dashboard-data\` que retorna tudo em uma chamada
- Manter queries paralelas do frontend se latência for aceitável
- Criar RPC SQL de composição

## Acceptance criteria
- [ ] Benchmark de tempo de abertura do dashboard (antes e depois dos agregados)
- [ ] Decisão documentada com evidências de latência
- [ ] Implementação se justificada

## Parent
Parte do epic #$EPIC5" \
  --label "performance,database,frontend" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: avaliar RPC de dashboard"

echo "  ✓ Epic 5 concluído"
echo ""

# ---------------------------------------------------------------------------
# EPIC 6 — Auth: desacoplar bootstrap e sync
# ---------------------------------------------------------------------------
echo "▶ [6/8] Epic: Auth — Desacoplar bootstrap e sync pesado..."

EPIC6=$(gh issue create \
  --repo "$REPO" \
  --title "[PERF] Epic: Auth — Otimizar bootstrap e desacoplar sync do app load" \
  --body "## Objetivo

Garantir que o app exiba conteúdo do cache Supabase imediatamente após autenticação, sem esperar o sync completo com Moodle, e reduzir o custo do ciclo de sync no bootstrap.

## Contexto da auditoria

O bootstrap atual executa sequencialmente:
1. Hidratação de storage
2. Supabase auth session
3. Fetch de cursos do Moodle (externo)
4. Sync batched de atividades/notas (N Edge Function calls)
5. Recálculo de risco
6. Escrita em background_jobs

O app fica em estado de loading enquanto etapas 3-6 correm. Se o Moodle estiver lento, o usuário espera.

## Sub-issues
Veja os issues filhos linkados nesta thread.

## Referência
Auditoria: \`docs/PERFORMANCE_AUDIT.md\` — Seção 3 (Auth)" \
  --label "performance,auth,frontend,epic" \
  2>/dev/null | grep -oE '[0-9]+$')

echo "  Epic 6 criado: #$EPIC6"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Paralelizar queries em useStudentHistory (eliminar waterfall)" \
  --body "## Contexto

\`useStudentHistory\` executa duas queries sequenciais:
1. Busca snapshots de \`student_sync_snapshots\`
2. Busca atividades de \`student_activities\`

O resultado da query 1 não é necessário para disparar a query 2 — são independentes.

## Solução

\`\`\`typescript
// Atual (2 RTTs):
const snapshots = await supabase.from('student_sync_snapshots')...
const activities = await supabase.from('student_activities')...

// Proposto (1 RTT paralelo):
const [snapshots, activities] = await Promise.all([
  supabase.from('student_sync_snapshots')...,
  supabase.from('student_activities')...,
]);
\`\`\`

## Acceptance criteria
- [ ] Queries paralelizadas com Promise.all
- [ ] Waterfall eliminado (DevTools mostra requests simultâneos)
- [ ] Resultado mantém mesma lógica de composição de dados

## Parent
Parte do epic #$EPIC6" \
  --label "performance,frontend,quick-win" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: paralelizar useStudentHistory"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Garantir exibição do cache Supabase antes do sync Moodle terminar" \
  --body "## Contexto

Em falha ou lentidão do Moodle, a regra operacional do produto é: usar cache local e sinalizar possível desatualização. Verificar se isso acontece antes do sync terminar, não apenas após falha.

## O que verificar

1. O app renderiza dados do Supabase enquanto o sync ainda está em progresso?
2. O estado de loading bloqueia a UI ou apenas mostra um indicador não-bloqueante?
3. O indicador de \`lastSyncAt\` é exibido mesmo se o sync não foi completado?

## Entregável

- Teste manual: abrir app com Moodle inacessível → confirmar que dashboard carrega com dados do cache
- Ajuste se necessário para separar \\"app pronto\\" de \\"sync completo\\"

## Acceptance criteria
- [ ] Dashboard visível com dados cached antes do sync terminar
- [ ] Indicador de staleness exibido quando sync não foi completado recentemente
- [ ] UI não bloqueia em loading total durante sync

## Parent
Parte do epic #$EPIC6" \
  --label "performance,auth,frontend" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: cache antes do sync"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Avaliar quebra de useCourseSync em serviço de background puro" \
  --body "## Contexto

\`useCourseSync\` tem 1000+ linhas e concentra: sync, progresso, risco, notificações e jobs. É o maior hook da aplicação.

Do ponto de vista de performance:
- Sync é iniciado no bootstrap do app, junto da autenticação
- Cada sync escreve múltiplos eventos em \`background_job_events\` (append-only)
- Recalcular risco com \`FOR UPDATE\` locks pode conflitar com sync concorrente

## Avaliação proposta

1. **Medir**: tempo total de sync para N cursos em staging
2. **Mapear dependências**: o que o app precisa do sync antes de renderizar?
3. **Proposta**: mover sync para Edge Function disparada como background job, retornando apenas job_id ao frontend

## Trade-off
- Ganho: app abre instantaneamente, sync acontece em background
- Custo: grande refactor de auth, polling de status do job, mudança no modelo de progresso

## Acceptance criteria
- [ ] Análise de custo/benefício documentada
- [ ] Decisão registrada com evidências de tempo de sync real
- [ ] Se aprovado: RFC de arquitetura antes de implementar

## Parent
Parte do epic #$EPIC6" \
  --label "performance,auth" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: avaliar quebra de useCourseSync"

echo "  ✓ Epic 6 concluído"
echo ""

# ---------------------------------------------------------------------------
# EPIC 7 — Retenção de tabelas históricas
# ---------------------------------------------------------------------------
echo "▶ [7/8] Epic: Retenção de tabelas históricas..."

EPIC7=$(gh issue create \
  --repo "$REPO" \
  --title "[PERF] Epic: Retenção de dados — Tabelas históricas e de eventos" \
  --body "## Objetivo

Implementar políticas de retenção e arquivamento para tabelas de crescimento contínuo que não precisam de histórico infinito.

## Contexto da auditoria

Tabelas de crescimento contínuo sem estratégia de retenção:
- \`background_job_events\`: ~50-100 eventos por sync, append-only
- \`risk_history\`: append-only, sem TTL
- \`activity_feed\`: eventos de feed acumulados
- \`student_sync_snapshots\`: 1 snapshot por aluno/curso/dia
- \`claris_ai_actions\`: imutável por design

## Sub-issues
Veja os issues filhos linkados nesta thread.

## Referência
Auditoria: \`docs/PERFORMANCE_AUDIT.md\` — Seção 8 (Jobs/Scheduler)" \
  --label "performance,database,epic" \
  2>/dev/null | grep -oE '[0-9]+$')

echo "  Epic 7 criado: #$EPIC7"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Job de retenção para background_job_events e background_jobs" \
  --body "## Contexto

Cada sync de cursos gera ~50-100 eventos em \`background_job_events\`. Em produção com sync diário, podem acumular dezenas de milhares de linhas em meses.

## Solução proposta

\`\`\`sql
-- Deletar eventos de jobs completados há mais de 90 dias
DELETE FROM public.background_job_events
WHERE created_at < now() - interval '90 days';

-- Deletar jobs completados/falhos há mais de 90 dias
DELETE FROM public.background_jobs
WHERE status IN ('completed', 'failed')
  AND created_at < now() - interval '90 days';
\`\`\`

Executar via Edge Function \`data-cleanup\` ou job agendado semanal.

## Acceptance criteria
- [ ] Job de retenção implementado (via data-cleanup ou scheduled job)
- [ ] Testado sem deletar jobs ainda ativos/pendentes
- [ ] Monitorar tamanho da tabela após primeira execução

## Parent
Parte do epic #$EPIC7" \
  --label "performance,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: retenção background_job_events"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Job de retenção para risk_history e activity_feed" \
  --body "## Contexto

- **risk_history**: histórico de mudanças de risco por aluno. Útil para tendências de curto/médio prazo. Mais de 6 meses tem valor analítico baixo para operação diária.
- **activity_feed**: eventos de acompanhamento. Mais de 30-90 dias é ruído para a tela principal.

## Solução proposta

\`\`\`sql
-- risk_history: manter 6 meses
DELETE FROM public.risk_history
WHERE recorded_at < now() - interval '6 months';

-- activity_feed: arquivar > 60 dias
-- Opção A: deletar
DELETE FROM public.activity_feed
WHERE created_at < now() - interval '60 days';

-- Opção B: mover para tabela de arquivo (preferível se histórico for necessário)
INSERT INTO public.activity_feed_archive SELECT * FROM public.activity_feed
WHERE created_at < now() - interval '60 days';
DELETE FROM public.activity_feed WHERE created_at < now() - interval '60 days';
\`\`\`

## Decisão necessária
Definir TTL apropriado para cada tabela com base no uso real.

## Acceptance criteria
- [ ] TTL definido por tabela (com justificativa de negócio)
- [ ] Job implementado
- [ ] Primeiro run testado em staging antes de produção

## Parent
Parte do epic #$EPIC7" \
  --label "performance,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: retenção risk_history e activity_feed"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Avaliar retenção e compressão de student_sync_snapshots" \
  --body "## Contexto

\`student_sync_snapshots\` grava 1 snapshot por aluno/curso/dia. Para:
- 500 alunos × 10 cursos × 365 dias = 1.825.000 linhas/ano

O hook \`useStudentHistory\` carrega apenas os últimos 60. Snapshots mais antigos são raramente consultados.

## Análise necessária

1. Volume atual: \`SELECT count(*), min(snapshot_date), max(snapshot_date) FROM student_sync_snapshots\`
2. Padrão de acesso: snapshots > 90 dias são consultados?
3. Retenção candidata: manter últimos 90 dias, arquivar ou deletar anteriores

## Acceptance criteria
- [ ] Volume atual medido
- [ ] Política de retenção definida (90 dias sugerido)
- [ ] Job de limpeza implementado se aprovado

## Parent
Parte do epic #$EPIC7" \
  --label "performance,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: retenção student_sync_snapshots"

echo "  ✓ Epic 7 concluído"
echo ""

# ---------------------------------------------------------------------------
# EPIC 8 — Observabilidade e baseline
# ---------------------------------------------------------------------------
echo "▶ [8/8] Epic: Observabilidade — Baseline e monitoramento..."

EPIC8=$(gh issue create \
  --repo "$REPO" \
  --title "[PERF] Epic: Observabilidade — Capturar baseline e instrumentar monitoramento" \
  --body "## Objetivo

Estabelecer linha de base de performance para medir o impacto de cada otimização e criar instrumentação contínua.

## Contexto da auditoria

Sem baseline, não é possível saber se as otimizações funcionaram. Esta é a primeira ação do roadmap de 30 dias — medir antes de otimizar.

## Sub-issues
Veja os issues filhos linkados nesta thread.

## Referência
Auditoria: \`docs/PERFORMANCE_AUDIT.md\` — Seção 10 (Observabilidade) e Seção 7 (Plano de Investigação)" \
  --label "performance,observability,database,epic" \
  2>/dev/null | grep -oE '[0-9]+$')

echo "  Epic 8 criado: #$EPIC8"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Habilitar pg_stat_statements e capturar baseline de queries" \
  --body "## Contexto

\`pg_stat_statements\` é a extensão do PostgreSQL que registra estatísticas de execução de todas as queries. Sem ela, não sabemos quais queries são mais lentas.

## Verificar se está habilitado

\`\`\`sql
SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements';
\`\`\`

No Supabase, habilitar via painel: Database > Extensions > pg_stat_statements.

## Queries de diagnóstico

\`\`\`sql
-- Top 20 queries mais lentas (por tempo total acumulado)
SELECT
  left(query, 100) AS query_excerpt,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round((total_exec_time / sum(total_exec_time) OVER ()) * 100, 2) AS pct_total
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- Scans sequenciais por tabela
SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch
FROM pg_stat_user_tables
WHERE relname IN (
  'students','student_activities','student_courses',
  'risk_history','user_courses','activity_feed',
  'background_job_events','background_jobs'
)
ORDER BY seq_scan DESC;
\`\`\`

## Entregável
- Captura de pg_stat_statements salva (screenshot ou export)
- Captura de seq_scan por tabela
- Comparação após otimizações dos epics #$EPIC2 e #$EPIC4

## Acceptance criteria
- [ ] pg_stat_statements habilitado em staging/produção
- [ ] Baseline capturado e documentado
- [ ] Processo de re-captura agendado após otimizações

## Parent
Parte do epic #$EPIC8" \
  --label "performance,observability,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: pg_stat_statements baseline"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Auditar request count e payload por tela principal" \
  --body "## Contexto

Sem contagem de requests por tela, não sabemos o impacto real do N+1 e do staleTime ausente no tráfego do usuário.

## Metodologia

Para cada tela abaixo, abrir o DevTools (Network tab) e registrar:
1. Número de requests na abertura
2. Tamanho total de payload (KB)
3. Request mais lento (ms)
4. Refetch ao focar a janela

## Telas a auditar
- [ ] Dashboard (/)
- [ ] Meus Cursos (/meus-cursos)
- [ ] Perfil de aluno (aluno individual)
- [ ] Tarefas (/tarefas)
- [ ] Automações (/automacoes)
- [ ] Claris chat

## Template de registro

| Tela | Requests | Payload (KB) | Slowest (ms) | Refetch em focus |
|------|----------|--------------|--------------|-----------------|
| Dashboard | ? | ? | ? | ? |

## Acceptance criteria
- [ ] Tabela preenchida para todas as telas
- [ ] Comparação antes/depois das otimizações de staleTime
- [ ] Telas com > 10 requests ou > 500KB identificadas como prioridade

## Parent
Parte do epic #$EPIC8" \
  --label "performance,observability,frontend" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: audit de requests por tela"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] EXPLAIN ANALYZE nas 5 tabelas críticas com RLS simulado" \
  --body "## Contexto

Precisamos confirmar se as queries com RLS estão usando índices ou fazendo seq scan. Isso deve ser feito com o contexto de autenticação correto.

## Metodologia

\`\`\`sql
-- Simular contexto de usuário autenticado
BEGIN;
SET LOCAL role = authenticated;
SET LOCAL \"request.jwt.claims\" = '{\"sub\": \"<uuid-de-usuario-real>\", \"role\": \"authenticated\"}';

-- Query 1: students com RLS
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM students LIMIT 100;

-- Query 2: risk_history sem filtro (pior caso)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM risk_history ORDER BY recorded_at DESC LIMIT 50;

-- Query 3: student_activities com filtro de curso
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM student_activities
WHERE course_id = '<uuid-de-curso>'
  AND status = 'pending' AND hidden = false;

-- Query 4: dashboard aggregates
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM dashboard_course_activity_aggregates;

-- Query 5: activity_feed
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM activity_feed
ORDER BY created_at DESC LIMIT 50;

ROLLBACK;
\`\`\`

## Entregável
- Output de EXPLAIN para cada query
- Identificar: \\"Seq Scan\\" vs \\"Index Scan\\" por tabela
- Lista de tabelas que precisam de índice com urgência

## Acceptance criteria
- [ ] 5 EXPLAIN executados e documentados
- [ ] Confirmação de quais índices do epic #$EPIC2 são mais urgentes
- [ ] Baseline de custo por query antes dos índices

## Parent
Parte do epic #$EPIC8" \
  --label "performance,observability,database" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: EXPLAIN ANALYZE com RLS"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Adicionar logging de latência nas Edge Functions críticas" \
  --body "## Contexto

Não há instrumentação de latência nas Edge Functions. Não sabemos o tempo real de:
- \`claris-chat\`: latência total vs. latência do LLM
- \`moodle-grade-suggestions\`: tempo por aluno em lote
- \`bulk-message-send\`: tempo por recipient

## Solução

Adicionar timing simples nos handlers críticos:

\`\`\`typescript
// Exemplo em claris-chat/index.ts
const t0 = performance.now();
const reply = await runClarisLoop(...);
const latency = Math.round(performance.now() - t0);

console.log(JSON.stringify({
  event: 'claris_chat_response',
  user_id: user.id,
  latency_ms: latency,
  tool_calls: reply.toolCalls?.length ?? 0,
  provider: settings.provider,
}));
\`\`\`

## Edge Functions a instrumentar
- [ ] \`claris-chat\`: latência total, latência LLM, tool_calls count
- [ ] \`moodle-grade-suggestions\`: latência por aluno em lote
- [ ] \`bulk-message-send\`: latência total, recipients processados
- [ ] \`moodle-sync-activities\`: latência por curso

## Acceptance criteria
- [ ] Logs estruturados (JSON) em todas as funções listadas
- [ ] Logs visíveis no Supabase Dashboard > Logs
- [ ] Alertas configurados para funções > 30s

## Parent
Parte do epic #$EPIC8" \
  --label "performance,observability,edge-function" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: logging de latência em Edge Functions"

SUB=$(gh issue create --repo "$REPO" \
  --title "[PERF] Medir tempo de bootstrap do app (login → dados visíveis)" \
  --body "## Contexto

Não sabemos o tempo real entre login e o primeiro render com dados do dashboard. O bootstrap inclui:
1. Hidratação de storage
2. Supabase auth session
3. Início do sync (assíncrono)
4. Render do dashboard com dados do cache

## Metodologia

\`\`\`typescript
// Adicionar temporariamente em useAuthSession.ts
const t0 = performance.now();
// ... após autenticação completa:
console.log('auth_bootstrap_ms', Math.round(performance.now() - t0));

// Adicionar em DashboardPage quando dados chegam:
console.log('dashboard_ready_ms', Math.round(performance.now() - navigationStart));
\`\`\`

## Targets
- Auth bootstrap < 1s: ✓ aceitável
- Auth bootstrap 1-3s: ⚠️ investigar
- Auth bootstrap > 3s: 🔴 problema

## Acceptance criteria
- [ ] Tempo de bootstrap medido em 3 sessões diferentes
- [ ] Tempo de \\"dashboard visível\\" medido
- [ ] Se > 2s: issue de prioridade criado com evidência

## Parent
Parte do epic #$EPIC8" \
  --label "performance,observability,auth" 2>/dev/null | grep -oE '[0-9]+$')
echo "    Sub #$SUB: medir tempo de bootstrap"

echo "  ✓ Epic 8 concluído"
echo ""

# ---------------------------------------------------------------------------
# Resumo final
# ---------------------------------------------------------------------------
echo "============================================="
echo " ✅ Criação concluída!"
echo "============================================="
echo ""
echo "Epics criados:"
echo "  #$EPIC1 - Quick Wins: staleTime e cache frontend"
echo "  #$EPIC2 - Banco: Índices críticos"
echo "  #$EPIC3 - RLS: Auditar e corrigir policies"
echo "  #$EPIC4 - N+1 em cursos: RPC SQL"
echo "  #$EPIC5 - Dashboard: Agregações"
echo "  #$EPIC6 - Auth: Bootstrap e sync"
echo "  #$EPIC7 - Retenção de tabelas históricas"
echo "  #$EPIC8 - Observabilidade e baseline"
echo ""
echo "Acesse os issues em: https://github.com/$REPO/issues"
