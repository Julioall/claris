# Geração Automática de Pendências de Correção

## 📋 Visão Geral

Feature que implementa a **geração automática de pendências de correção** a partir das atividades do Moodle que possuem:
- ✅ Data de vencimento (`due_date`)
- ✅ Ainda não corrigidas (`graded_at IS NULL`)
- ✅ Visíveis para o aluno (`is_hidden = false`)

## 🎯 Objetivo

Automatizar a criação de tarefas de pendência quando há atividades vencidas que precisam ser corrigidas, reduzindo trabalho manual do tutor.

## 📦 Componentes Implementados

### 1. **Database (Migrações)**

#### `20260205_add_graded_at_and_hidden_to_activities.sql`
- Adiciona coluna `graded_at` (timestamp) → rastreia quando a atividade foi corrigida
- Adiciona coluna `is_hidden` (boolean) → indica se a atividade está oculta
- Cria índice otimizado para buscar atividades elegíveis para pendências

#### `20260205140000_add_pending_tasks_constraints.sql`
- Adiciona novo tipo de tarefa: `correcao_atividade`
- Cria índice UNIQUE para evitar duplicatas em pendências de correção
- Garante deduplicação: (student_id, course_id, moodle_activity_id)

### 2. **Backend - Edge Functions**

#### `supabase/functions/generate-pending-tasks/index.ts`
Função serverless que implementa a lógica principal:

**Funcionalidade:**
- Recebe lista de course_ids para gerar pendências
- Busca todas as atividades elegíveis (com due_date, sem graded_at, não ocultas)
- Cria pendências tipo `correcao_atividade` no banco
- Retorna estatísticas: `{ found, created, skipped }`

**RLS Security:**
- Valida `auth.uid()` do usuário
- Garante acesso apenas aos cursos do tutor

**Deduplicação:**
- UNIQUE constraint previne duplicatas
- Conflitos são ignorados silenciosamente

#### `supabase/functions/moodle-api/index.ts` (atualizado)

**Modificações em `sync_activities`:**
- Agora extrai `due_date` das atividades assign via `mod_assign_get_assignments`
- Extrai `is_hidden` verificando `visible` e `uservisible`
- Preenche estes campos ao sincronizar atividades

### 3. **Frontend - React Hooks (React Query v5)**

#### `src/hooks/useGeneratePendingTasks.ts`
```typescript
useMutation({
  mutationFn: async (params: GeneratePendingTasksParams) => {...},
  onSuccess: () => queryClient.invalidateQueries({ queryKey: [...] })
})
```
- Chama Edge Function para gerar pendências
- Invalida queries de pendências após sucesso

#### `src/hooks/usePreviewPendingTasks.ts`
- Calcula preview de quantas pendências serão criadas
- Mostra estatísticas antes de gerar

#### `src/hooks/usePendingTasks.ts`
- Busca pendências do aluno com filtros (status, curso)
- Carrega dados de student e course relations

#### `src/hooks/useUpdatePendingTask.ts`
- Atualiza status da pendência (aberta → em_andamento → resolvida)
- Auto-define `completed_at` quando status = 'resolvida'

#### `src/hooks/useDeletePendingTask.ts`
- Remove pendência do banco

### 4. **Frontend - UI Components**

#### `src/components/actions/NewPendingTaskDialog.tsx`
Modal de 3 passos:

1. **Step 1 - Tipo de Pendência**
   - Seleciona "Correção de Atividade"
   - Mostra descrição da feature

2. **Step 2 - Seleção de Cursos**
   - Multi-select de cursos do tutor
   - Mostra preview de quantas atividades serão processadas por curso

3. **Step 3 - Confirmação**
   - Preview com estatísticas finais
   - Botão "Gerar Pendências"

#### `src/pages/PendingTasks.tsx` (reescrito)
Página completa de gerenciamento:

**Funcionalidades:**
- Lista todas as pendências do usuário logado
- Filtros por status e curso
- Busca por título ou nome do aluno
- Ações inline:
  - Marcar como "Em Andamento"
  - Marcar como "Resolvida" (com timestamp)
  - Deletar
  - Ver perfil do aluno
- Mostra contagem de pendências abertas

### 5. **Types**

#### `src/types/index.ts` (atualizado)
```typescript
type TaskType = 'moodle' | 'interna' | 'correcao_atividade'
```
- Adiciona novo tipo de tarefa para correções de atividades

## 🔄 Fluxo de Dados

```
Usuario clica "Nova Pendência"
        ↓
NewPendingTaskDialog (3 passos)
        ↓
Seleciona cursos
        ↓
usePreviewPendingTasks (calcula preview)
        ↓
Clica "Gerar Pendências"
        ↓
useGeneratePendingTasks (chama Edge Function)
        ↓
generate-pending-tasks (lógica principal)
        ├─ Busca atividades elegíveis
        ├─ Cria registros em pending_tasks
        └─ Retorna estatísticas
        ↓
usePendingTasks (recarrega lista)
        ↓
PendingTasks page (exibe pendências)
```

## 🔧 Tecnologias Usadas

- **React Query v5** - State management de dados
- **Supabase** - Backend e banco de dados
- **Edge Functions (Deno)** - Lógica serverless
- **PostgreSQL** - Persistência com RLS
- **TypeScript** - Type safety

## 🧪 Como Testar

### 1. Sincronizar Moodle
```
1. Acesse http://localhost:8080
2. Faça login com credenciais do Moodle
3. Clique em "Sincronizar" para baixar cursos e atividades
```

### 2. Gerar Pendências
```
1. Vá para /pendencias
2. Clique em "Nova Pendência"
3. Siga os 3 passos do modal
4. Selecione cursos
5. Clique "Gerar Pendências"
```

### 3. Gerenciar Pendências
```
1. Veja a lista de pendências criadas
2. Marque como "Em Andamento"
3. Marque como "Resolvida" (timestamp automático)
4. Ou delete se necessário
```

## 📊 Dados Sincronizados

Tabela `student_activities` agora inclui:
```
- due_date          // Data de vencimento da atividade
- graded_at         // Quando foi corrigida (NULL = não corrigida)
- is_hidden         // Se está oculta para o aluno
```

Tabela `pending_tasks` inclui tipo novo:
```
- task_type = 'correcao_atividade'  // Distinção de pendências deatividades
```

## 🔒 Segurança

- **RLS (Row Level Security)** na Edge Function
- Tutor vê apenas suas pendências e de seus alunos
- UNIQUE constraint previne duplicatas
- Validação de auth.uid() em todas as operações

## 🐛 Alterações Importantes

### Arquivo Modificado: `supabase/functions/moodle-api/index.ts`

**Antes:** Sincronizava atividades SEM informações de vencimento

**Depois:** 
```typescript
// Para assign activities, busca duedate
const assignmentsDeatails = await callMoodleApi(
  moodleUrl, token, 'mod_assign_get_assignments', { courseids: [courseId] }
);

// Extrai due_date de cada assignment
if (assignDetails && assignDetails.duedate && assignDetails.duedate > 0) {
  dueDate = new Date(assignDetails.duedate * 1000).toISOString();
}

// Verifica visibilidade
let isHidden = !activity.visible || !activity.uservisible;
```

## 📝 Próximos Passos Possíves

1. **Notificações** -  Alertar tutores quando houver novas pendências
2. **Bulk Actions** - Marcar múltiplas pendências como resolvidas de uma vez
3. **Relatórios** - Gráficos de pendências por período
4. **Automação** - Auto-gerar pendências diariamente/semanalmente
5. **Integração Moodle** - Atualizar notas do Moodle quando pendência resolvida

## 📖 Documentação Relacionada

- [IMPLEMENTACAO_API_EXTERNA_E_DOCKER.md](../IMPLEMENTACAO_API_EXTERNA_E_DOCKER.md) - Setup do projeto
- [HANDOFF.md](../HANDOFF.md) - Documentação geral da arquitetura
- [DOCUMENTACAO.md](../DOCUMENTACAO.md) - Schema de banco de dados
