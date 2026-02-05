# Arquitetura Técnica - Sistema de Pendências

## 🏗️ Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                  │
├─────────────────────────────────────────────────────────────┤
│  src/pages/PendingTasks.tsx                                 │
│  ├─ UI: Lista de pendências                                 │
│  ├─ Filtros: status, course_id, search                      │
│  └─ Ações: edit, delete, bulk operations                    │
│                                                              │
│  src/components/actions/NewPendingTaskDialog.tsx            │
│  ├─ Step 1: Tipo (correcao_atividade)                       │
│  ├─ Step 2: Multi-select de cursos                          │
│  └─ Step 3: Preview + Confirmação                           │
│                                                              │
│  src/hooks/                                                 │
│  ├─ useGeneratePendingTasks (POST)                          │
│  ├─ usePreviewPendingTasks (GET)                            │
│  ├─ usePendingTasks (SELECT)                                │
│  ├─ useUpdatePendingTask (UPDATE)                           │
│  └─ useDeletePendingTask (DELETE)                           │
└─────────────────────────────────────────────────────────────┘
           ↓ HTTP / Supabase Client
┌─────────────────────────────────────────────────────────────┐
│              SUPABASE (Backend as a Service)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Edge Functions (Deno Runtime)                              │
│  ├─ POST /generate-pending-tasks                            │
│  │  └─ Lógica: SELECT elegíveis → INSERT pendências        │
│  │                                                           │
│  └─ GET /pending-tasks-preview                              │
│     └─ Lógica: COUNT elegíveis - COUNT existentes           │
│                                                              │
│  PostgreSQL Database                                        │
│  ├─ Tabela: users (já existe)                               │
│  ├─ Tabela: courses (já existe)                             │
│  ├─ Tabela: student_activities                              │
│  │  ├─ Colunas novas: due_date, graded_at, is_hidden       │
│  │  └─ Índice: idx_activities_for_pending                   │
│  │                                                           │
│  └─ Tabela: pending_tasks (NOVA)                            │
│     ├─ Fields: id, student_id, course_id, ...              │
│     ├─ Restrição: UNIQUE(student_id, course_id, activity)  │
│     ├─ Índice: idx_pending_by_student                       │
│     └─ Índice: idx_pending_by_course                        │
│                                                              │
│  RLS Policies                                               │
│  ├─ Tutores: Veem pendências de seus alunos                │
│  ├─ Alunos: Veem apenas suas próprias pendências           │
│  └─ System: Validação de auth.uid() em todas operações     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
           ↓ REST API
┌─────────────────────────────────────────────────────────────┐
│             MOODLE (Fonte de Dados de Atividades)           │
├─────────────────────────────────────────────────────────────┤
│  Web Service API                                            │
│  ├─ core_course_get_contents (lista atividades)             │
│  ├─ mod_assign_get_assignments (detalhes de assignments)    │
│  └─ core_grades_get_grades (sincroniza graded_at)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Fluxo de Dados - Caso de Uso Completo

### Fase 1: Sincronização de Atividades (Background)

```
┌─────────────────────────────────────────────┐
│ User clica botão "Sincronizar" na Sidebar   │
└──────────────────┬──────────────────────────┘
                   ↓
        frontend: useMoodleApi()
        └─ Chama: /functions/v1/moodle-api
           └─ sync_activities()
┌──────────────────────────────────────────────┐
│ Edge Function: moodle-api/index.ts           │
├──────────────────────────────────────────────┤
│ 1. Autentica em Moodle (username + password) │
│ 2. SELECT courses WHERE user_id == current   │
│ 3. Para cada course:                         │
│    - GET core_course_get_contents            │
│    - FOR cada activity:                      │
│      - GET mod_assign_get_assignments        │
│      - Extract: due_date, visible, etc       │
│      - UPSERT em student_activities          │
│    - GET core_grades_get_grades              │
│      - Update: graded_at para atividades     │
└────────────────┬─────────────────────────────┘
                 ↓
    Banco atualizado com:
    ├─ due_date (quando vence)
    ├─ graded_at (quando foi corrigida)
    └─ is_hidden (se está oculta)
```

### Fase 2: Preview de Pendências

```
┌───────────────────────────────────────────┐
│ User abre NewPendingTaskDialog             │
│ Step 2: Seleciona 2 cursos                 │
└──────────────────┬────────────────────────┘
                   ↓
    frontend: usePreviewPendingTasks({
      course_ids: ['uuid1', 'uuid2']
    })
┌──────────────────────────────────────────┐
│ Edge Function: pending-tasks-preview      │
├──────────────────────────────────────────┤
│ SELECT COUNT(*) FROM student_activities   │
│ WHERE:                                    │
│   - course_id IN (uuid1, uuid2)           │
│   - due_date IS NOT NULL                  │
│   - graded_at IS NULL                     │
│   - is_hidden = false                     │
│ COUNT(*) = 8 atividades elegíveis         │
│                                           │
│ SELECT COUNT(*) FROM pending_tasks        │
│ WHERE:                                    │
│   - course_id IN (uuid1, uuid2)           │
│   - moodle_activity_id IS NOT NULL        │
│ COUNT(*) = 2 já existem                   │
│                                           │
│ to_create = 8 - 2 = 6 novas               │
└────────────────┬────────────────────────┘
                 ↓
    Dialog exibe:
    - Curso 1: 5 elegíveis, 1 existente, 4 novos
    - Curso 2: 3 elegíveis, 1 existente, 2 novos
    - TOTAL: 8 elegíveis, 2 existente, 6 novos
```

### Fase 3: Geração de Pendências

```
┌──────────────────────────────────────────┐
│ User clica "Gerar Pendências" (Step 3)    │
└─────────────────┬────────────────────────┘
                  ↓
   frontend: useGeneratePendingTasks({
     course_ids: ['uuid1', 'uuid2']
   })
┌──────────────────────────────────────────┐
│ Edge Function: generate-pending-tasks    │
├──────────────────────────────────────────┤
│ 1. Valida autenticação (auth.uid)         │
│ 2. Valida permissões (RLS)                │
│ 3. SELECT atividades elegíveis            │
│    WHERE course_id IN (uuid1, uuid2)      │
│      AND due_date IS NOT NULL             │
│      AND graded_at IS NULL                │
│      AND is_hidden = false                │
│ 4. Para cada atividade elegível:          │
│    - Tenta INSERT em pending_tasks        │
│    - Se falha (UNIQUE constraint):        │
│      - Incrementa 'skipped'               │
│    - Se sucesso:                          │
│      - Incrementa 'created'               │
│ 5. Retorna estatísticas                   │
│    {                                      │
│      found: 8,     // Total elegível      │
│      created: 6,   // Novas criadas       │
│      skipped: 2    // Já existiam         │
│    }                                      │
└────────────────┬────────────────────────┘
                 ↓
    Banco: 6 novos registros em pending_tasks
    ├─ student_id: do aluno (de course erollment)
    ├─ course_id: do curso selecionado
    ├─ moodle_activity_id: da atividade
    ├─ title: nome da atividade do Moodle
    ├─ status: 'aberta'
    ├─ created_at: NOW()
    └─ completed_at: NULL
```

### Fase 4: Listagem e Gerenciamento

```
┌──────────────────────────────────────────┐
│ User acessa /pendencias                   │
└─────────────────┬────────────────────────┘
                  ↓
    frontend: usePendingTasks({
      status: filters.status,    // ['aberta', 'em_andamento']
      course_id: filters.course_id
    })
┌──────────────────────────────────────────┐
│ Supabase RLS + Query                      │
├──────────────────────────────────────────┤
│ SELECT p.*, s.name as student_name        │
│ FROM pending_tasks p                      │
│ JOIN users s ON p.student_id = s.id      │
│ WHERE p.student_id = auth.uid()          │
│   OR p.course_id IN (                     │
│     SELECT course_id FROM enrollments     │
│     WHERE user_id = auth.uid()            │
│     AND role = 'tutor'                    │
│   )                                       │
│ AND (status = ? OR ? IS NULL)             │
│ AND (course_id = ? OR ? IS NULL)          │
│ ORDER BY created_at DESC                  │
└────────────────┬────────────────────────┘
                 ↓
    UI exibe lista de pendências
    ├─ Título
    ├─ Aluno
    ├─ Curso
    ├─ Status (badge com cor)
    ├─ Data criação
    ├─ Ações:
    │  ├─ [✓] Marcar como Em Andamento
    │  ├─ [✓] Marcar como Resolvida
    │  ├─ [🗑️] Deletar
    │  └─ [👤] Ver Perfil Aluno
    └─ Filtros (status, curso, search)
```

### Fase 5: Atualizar Status de Pendência

```
┌─────────────────────────────────────────┐
│ User clica "Marcar como Resolvida"       │
└──────────────────┬──────────────────────┘
                   ↓
   frontend: useUpdatePendingTask({
     taskId: 'uuid-pendencia',
     status: 'resolvida'
   })
┌──────────────────────────────────────────┐
│ Supabase RLS + Update                     │
├──────────────────────────────────────────┤
│ UPDATE pending_tasks SET                  │
│   status = 'resolvida',                   │
│   updated_at = NOW(),                     │
│   completed_at = NOW()    -- AUTO         │
│ WHERE id = ?               -- auto INSERT │
│   AND student_id = auth.uid()  -- RLS    │
│ RETURNING *                               │
└───────────────┬──────────────────────────┘
                ↓
    React Query invalida cache
    ↓
    usePendingTasks refetch
    ↓
    UI atualiza status visual
```

---

## 🔐 Segurança por Camada

### Camada 1: Autenticação (JWT)

```
request com: Authorization: Bearer JWT_TOKEN
    ↓
Supabase valida token
    ↓
Extrai auth.uid() do payload
    ↓
Passa para RLS policies
```

### Camada 2: RLS (Row Level Security)

```
Policy para SELECT:
  - Aluno: vê apenas suas pendências
  - Tutor: vê pendências de seus alunos
  - Admin: vê tudo (não implementado)

Policy para INSERT:
  - Tutor: pode criar apenas em seus cursos
  - Aluno: não pode criar (via UI)

Policy para UPDATE:
  - Tutor: atualiza de seus alunos
  - Aluno: atualiza suas próprias (status)

Policy para DELETE:
  - Tutor: deleta de seus alunos
  - Aluno: deleta suas próprias
```

### Camada 3: Validação na Edge Function

```typescript
// Valida que course_id pertence ao usuário
const userCourses = await query(
  `SELECT course_id FROM enrollments 
   WHERE user_id = $1 AND role = 'tutor'`,
  [auth.uid()]
);

if (!requestedCourseIds.every(id => 
    userCourses.includes(id))) {
  throw new Error('Unauthorized');
}
```

### Camada 4: Constraint de Banco

```sql
-- UNIQUE constraint previne duplicatas
UNIQUE(student_id, course_id, moodle_activity_id)

-- Foreign keys garantem integridade referencial
FOREIGN KEY (student_id) REFERENCES users(id),
FOREIGN KEY (course_id) REFERENCES courses(id)
```

---

## 📈 Performance & Índices

### Query: Buscar atividades elegíveis

```sql
SELECT * FROM student_activities
WHERE due_date IS NOT NULL
  AND graded_at IS NULL
  AND is_hidden = false
  AND course_id = ?
```

**Índice Crítico:**
```sql
CREATE INDEX idx_activities_for_pending
ON student_activities(course_id, due_date, graded_at, is_hidden)
WHERE due_date IS NOT NULL 
  AND graded_at IS NULL 
  AND is_hidden = false;
```

**Tempo de Execução:**
- Sem índice: ~500ms (full table scan)
- Com índice: ~5ms (index seek)
- Esperado: <100ms mesmo com 10k registros

### Query: Listagem de pendências

```sql
SELECT p.*, s.name as student_name
FROM pending_tasks p
JOIN users s ON p.student_id = s.id
WHERE p.student_id = ? OR p.course_id IN (...)
  AND status IN (?, ?)
  AND created_at DESC
LIMIT 50 OFFSET 0
```

**Índices Críticos:**
```sql
CREATE INDEX idx_pending_tasks_student 
ON pending_tasks(student_id, status, created_at);

CREATE INDEX idx_pending_tasks_course
ON pending_tasks(course_id, status, created_at);
```

---

## 🗃️ Modelo de Dados ERD

```
users
├─ id (PK)
├─ email
├─ name
└─ cpf

    ↑ (1:N)
    │ student_id

pending_tasks (NOVO)
├─ id (PK)
├─ student_id (FK → users)
├─ course_id (FK → courses)
├─ moodle_activity_id
├─ title
├─ description
├─ task_type (enum: correcao_atividade)
├─ status (enum: aberta, em_andamento, resolvida)
├─ created_at
├─ updated_at
├─ completed_at
└─ UNIQUE(student_id, course_id, moodle_activity_id)

courses
├─ id (PK)
├─ name
├─ course_code
└─ ...

student_activities (ATUALIZADO)
├─ id (PK)
├─ student_id (FK → users)
├─ course_id (FK → courses)
├─ moodle_activity_id
├─ title
├─ due_date          (NOVO)
├─ graded_at         (NOVO)
├─ is_hidden         (NOVO)
└─ ...
```

---

## 🔄 State Management (React Query v5)

### Query: `pending-tasks`
```typescript
useQuery({
  queryKey: ['pending-tasks', { status, courseId }],
  queryFn: async () => {
    return supabase
      .from('pending_tasks')
      .select('*, student:users(*), course:courses(*)')
      .eq('status', status)
      .eq('course_id', courseId);
  },
  staleTime: 30000,  // 30s
  gcTime: 5 * 60 * 1000  // 5 min (antes: cacheTime)
});
```

### Mutation: `generate-pending-tasks`
```typescript
useMutation({
  mutationFn: async (payload) => {
    return fetch(..., { method: 'POST', body: JSON.stringify(payload) })
      .then(r => r.json());
  },
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ['pending-tasks']
    });
  }
});
```

### Mutation: `update-pending-task`
```typescript
useMutation({
  mutationFn: async ({ taskId, status }) => {
    return supabase
      .from('pending_tasks')
      .update({ 
        status, 
        completed_at: status === 'resolvida' ? new Date() : null 
      })
      .eq('id', taskId);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
  }
});
```

---

## 🚀 Deployment Checklist

### Desenvolvimento Local
- [ ] `supabase start` rodando (banco + Edge Functions)
- [ ] Migrations aplicadas: `supabase db push`
- [ ] Edge Functions em `supabase/functions/`
- [ ] Frontend em `.env.local`

### Staging
- [ ] Supabase remoto provisioned
- [ ] `supabase link --project-ref=...`
- [ ] `supabase db push`
- [ ] `supabase functions deploy`
- [ ] `.env.staging` configurado

### Produção
- [ ] Backup do banco feito
- [ ] `supabase db push --prod`
- [ ] `supabase functions deploy --prod`
- [ ] Testes de smoke passando
- [ ] Monitoramento ativo (Sentry, etc)

---

## 📊 Métricas de Monitoramento

### KPIs Sugeridos

```
- Pendências criadas por dia
- Taxa de resolução (resolvidas / total)
- Tempo médio de resolução
- Atividades sem pendência (razão de exclusão)
- Taxa de erro na geração
```

### Logs Recomendados

```typescript
// Edge Function
console.log(`[generate-pending-tasks] User: ${auth.uid}, 
  Courses: ${courseIds.length}, 
  Found: ${found}, Created: ${created}, Skipped: ${skipped}`);
```

---

## 🔧 Troubleshooting

| Problema | Causa | Solução |
|----------|-------|---------|
| "Pendências não geram" | `due_date` NULL | Sincronizar Moodle (verificar mod_assign) |
| "UNIQUE constraint fail" | Duplicata | Ignorado - idempotente |
| "401 Unauthorized" | JWT inválido | Fazer login novamente |
| "403 Forbidden" | RLS deny | Verificar enrollment (tutor?) |
| "Edge Function timeout" | Muitos cursos | Limitar para <100 cursos |
| "Query slow" | Índice faltante | Verificar `idx_activities_for_pending` |
