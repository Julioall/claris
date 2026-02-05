# API Reference - Edge Functions

## Endpoints Disponíveis

### 1. `POST /functions/v1/generate-pending-tasks`

**Descrição:** Gera automaticamente pendências de correção a partir de atividades elegíveis.

**Autenticação:** Bearer Token (Supabase JWT)

**Request:**
```typescript
{
  course_ids: string[]   // Array de UUIDs de cursos do tutor
}
```

**Response (200 OK):**
```typescript
{
  found: number,         // Total de atividades elegíveis encontradas
  created: number,       // Novas pendências criadas
  skipped: number,       // Atividades com pendência já existente
  message: string        // Mensagem descritiva
}
```

**Exemplo de Uso:**
```typescript
const response = await fetch(
  'https://sua-supabase.supabase.co/functions/v1/generate-pending-tasks',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      course_ids: ['uuid-curso-1', 'uuid-curso-2']
    })
  }
);

const data = await response.json();
console.log(`Criadas ${data.created} pendências`);
```

**Regras de Negócio:**
- Atividades devem ter `due_date` (data de vencimento)
- Atividades devem ter `graded_at IS NULL` (não corrigidas)
- Atividades devem ter `is_hidden = false` (visíveis)
- Requer autenticação do tutor
- Garante deduplicação via UNIQUE constraint

**Erros Possíveis:**
```typescript
// 401 Unauthorized
{
  error: 'Unauthorized'
}

// 400 Bad Request - course_ids ausente
{
  error: 'course_ids is required'
}

// 403 Forbidden - acesso negado a curso
{
  error: 'Access denied to course'
}
```

---

### 2. `GET /functions/v1/pending-tasks-preview`

**Descrição:** Calcula preview de quantas pendências serão geradas SEM criar registros.

**Autenticação:** Bearer Token (Supabase JWT)

**Query Parameters:**
```
?course_ids=uuid1,uuid2,uuid3
```

**Response (200 OK):**
```typescript
{
  eligible_activities: {
    [course_id: string]: {
      total: number,           // Total de atividades elegíveis
      existing_tasks: number,  // Que já têm pendência
      to_create: number        // Que serão criadas
    }
  },
  summary: {
    total_eligible: number,
    total_existing: number,
    total_to_create: number
  }
}
```

**Exemplo de Resposta:**
```json
{
  "eligible_activities": {
    "uuid-curso-1": {
      "total": 5,
      "existing_tasks": 2,
      "to_create": 3
    },
    "uuid-curso-2": {
      "total": 3,
      "existing_tasks": 0,
      "to_create": 3
    }
  },
  "summary": {
    "total_eligible": 8,
    "total_existing": 2,
    "total_to_create": 6
  }
}
```

**Erros Possíveis:**
```typescript
// 400 Bad Request - course_ids ausente
{
  error: 'course_ids parameter is required'
}
```

---

### 3. Enhanced: `POST /functions/v1/moodle-api` (atualizado)

**Alterações para Sincronização:**

**Operação: `sync_activities`**

Agora extrai campos adicionais:

```typescript
{
  method: 'sync_activities',
  moodleUrl: string,
  token: string,
  course_id: number,
  user_id: string  // UUID do usuário
}
```

**Novos Campos Preenchidos:**

```typescript
student_activity {
  // ... campos existentes ...
  
  // NOVO: Data de vencimento da atividade
  due_date: string | null,       // ISO timestamp ou null
  
  // NOVO: Data de correção
  graded_at: string | null,      // ISO timestamp ou null (sincronizado)
  
  // NOVO: Visibilidade
  is_hidden: boolean             // false se visível ao aluno
}
```

**Lógica de Extração:**

Para atividades tipo `assign`:
```typescript
// Busca assignment details
const assignmentResponse = await callMoodleApi(
  'mod_assign_get_assignments',
  { courseids: [course_id] }
);

// Extrai duedate (timestamp Unix)
const dueDate = new Date(assignment.duedate * 1000).toISOString();
```

Para atividades tipo `quiz`:
```typescript
// Usa closedate ou timeclose
const dueDate = new Date(quiz.timeclose * 1000).toISOString();
```

Para visibilidade:
```typescript
// activity.visible = true/false (módulo visível)
// activity.uservisible = true/false (visível para este usuário)
const isHidden = !activity.visible || !activity.uservisible;
```

---

## 📊 Estrutura de Dados

### Tabela: `pending_tasks`

```sql
CREATE TABLE pending_tasks (
  id                  UUID PRIMARY KEY,
  student_id          UUID NOT NULL,              -- Aluno responsável
  course_id           UUID NOT NULL,              -- Curso da atividade
  moodle_activity_id  INT,                        -- ID da atividade no Moodle
  title               VARCHAR(255) NOT NULL,      -- Nome da pendência
  description         TEXT,                       -- Descrição detalhada
  task_type           VARCHAR(50) DEFAULT 'correcao_atividade',
  status              VARCHAR(50) DEFAULT 'aberta',  -- aberta | em_andamento | resolvida
  created_at          TIMESTAMP WITH TIME ZONE,
  updated_at          TIMESTAMP WITH TIME ZONE,
  completed_at        TIMESTAMP WITH TIME ZONE,   -- NULL se não resolvida
  
  UNIQUE(student_id, course_id, moodle_activity_id)
);
```

### Tabela: `student_activities` (atualizada)

```sql
ALTER TABLE student_activities ADD COLUMN (
  due_date   TIMESTAMP WITH TIME ZONE,     -- Quando vence
  graded_at  TIMESTAMP WITH TIME ZONE,     -- Quando foi corrigida (NULL = não corrigida)
  is_hidden  BOOLEAN DEFAULT false         -- Se está oculta
);
```

---

## 🔐 Segurança & RLS

### Autenticação

Todas as operações requerem:
```
Authorization: Bearer {JWT_TOKEN}
```

O JWT é extraído do session do usuário autenticado.

### Row Level Security (RLS)

**Política para geração:**
```sql
-- Tutor pode gerar pendências apenas para seus cursos
CREATE POLICY "instructors_can_generate"
  ON pending_tasks FOR INSERT
  WITH CHECK (
    course_id IN (
      SELECT course_id FROM enrollments 
      WHERE user_id = auth.uid() AND role = 'tutor'
    )
  );
```

**Política para leitura:**
```sql
-- Cada um vê suas próprias pendências
CREATE POLICY "users_see_own_tasks"
  ON pending_tasks FOR SELECT
  USING (student_id = auth.uid() OR
         course_id IN (
           SELECT course_id FROM enrollments 
           WHERE user_id = auth.uid() AND role = 'tutor'
         ));
```

---

## ⏱️ Rate Limiting

Não implementado por padrão, mas recomendações:

```typescript
// Sugerir limite de 10 gerações por minuto por usuário
// Previne abuso de API
```

---

## 🚨 Tratamento de Erros

### Códigos de Status

| Status | Significado |
|--------|-------------| 
| 200 | Sucesso |
| 400 | Parâmetros ausentes/inválidos |
| 401 | Não autenticado |
| 403 | Acesso negado (RLS) |
| 404 | Recurso não encontrado |
| 500 | Erro interno do servidor |
| 503 | Supabase indisponível |

### Formato de Erro

```typescript
{
  error: string,           // Mensagem breve
  details: string,         // Detalhes técnicos (opcional)
  statusCode: number       // HTTP status
}
```

---

## 📈 Performance

### Índices Críticos

```sql
-- Busca de atividades elegíveis
CREATE INDEX idx_activities_for_pending 
ON student_activities(due_date, graded_at, is_hidden) 
WHERE due_date IS NOT NULL AND graded_at IS NULL AND is_hidden = false;

-- Listagem de pendências por aluno
CREATE INDEX idx_pending_by_student 
ON pending_tasks(student_id, status) 
WHERE status != 'resolvida';

-- Listagem por curso
CREATE INDEX idx_pending_by_course 
ON pending_tasks(course_id, created_at DESC);
```

### Limites Recomendados

- Máximo 100 cursos por requisição
- Máximo 1000 atividades processadas por geração
- TTL de 30 segundos para Edge Function

---

## 🔄 Fluxo Completo de Integração

```
1. Usuario clica "Nova Pendência"
   ↓
2. frontend chama usePreviewPendingTasks
   ├─ GET /pending-tasks-preview?course_ids=...
   └─ Exibe estatísticas
   ↓
3. Usuario seleciona cursos e clica "Gerar"
   ↓
4. frontend chama useGeneratePendingTasks
   ├─ POST /generate-pending-tasks
   │  ├─ Edge Function busca atividades elegíveis
   │  ├─ Cria registros em pending_tasks
   │  ├─ UNIQUE evita duplicatas
   │  └─ Retorna estatísticas
   └─ Invalida query cache
   ↓
5. usePendingTasks recarrega lista
   ├─ Busca SELECT * FROM pending_tasks WHERE student_id = auth.uid()
   └─ Exibe na UI
   ↓
6. Usuario pode:
   ├─ Atualizar status (useUpdatePendingTask)
   ├─ Deletar (useDeletePendingTask)
   └─ Ver detalhes (StudentProfile)
```

---

## 📝 Exemplos de Código

### Chamar Generate-Pending-Tasks

```typescript
import { useGeneratePendingTasks } from '@/hooks/useGeneratePendingTasks';

function MyComponent() {
  const mutation = useGeneratePendingTasks();
  
  const handleGenerate = async () => {
    mutation.mutate({
      course_ids: ['uuid1', 'uuid2']
    });
  };
  
  return (
    <button 
      onClick={handleGenerate}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Gerando...' : 'Gerar Pendências'}
    </button>
  );
}
```

### Listar Pendências com Filtros

```typescript
import { usePendingTasks } from '@/hooks/usePendingTasks';

function PendingTasksList() {
  const { data: tasks } = usePendingTasks({
    status: 'aberta',
    course_id: selectedCourseId
  });
  
  return (
    <div>
      {tasks?.map(task => (
        <div key={task.id}>
          {task.title} - {task.status}
        </div>
      ))}
    </div>
  );
}
```

### Atualizar Status de Pendência

```typescript
import { useUpdatePendingTask } from '@/hooks/useUpdatePendingTask';

function TaskItem({ task }) {
  const mutation = useUpdatePendingTask();
  
  const markAsResolved = () => {
    mutation.mutate({
      taskId: task.id,
      status: 'resolvida'
    });
  };
  
  return (
    <button onClick={markAsResolved}>
      Marcar como Resolvida
    </button>
  );
}
```

---

## 🧪 Testing

### Teste de Geração

```bash
# Via cURL
curl -X POST http://localhost:54321/functions/v1/generate-pending-tasks \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "course_ids": ["uuid-1", "uuid-2"]
  }'

# Resposta esperada
{
  "found": 8,
  "created": 6,
  "skipped": 2,
  "message": "Successfully generated 6 pending tasks"
}
```

### Teste de Preview

```bash
curl -X GET 'http://localhost:54321/functions/v1/pending-tasks-preview?course_ids=uuid1,uuid2' \
  -H "Authorization: Bearer YOUR_JWT"
```
