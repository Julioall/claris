# Guia de Migração e Mudanças

## 📌 Resumo Executivo

Esta feature implementou **geração automática de pendências a partir de atividades do Moodle**.

**Tempo de Desenvolvimento:** ~10 horas  
**Linhas de Código:** ~2000 (incluindo Edge Functions)  
**Breaking Changes:** Nenhum (apenas adições)  
**Compatibilidade:** React Query v5+, Supabase com RLS

---

## 🔄 Mudanças no Banco de Dados

### 1. Schema Estendido - `student_activities`

```sql
-- NOVO: Coluna para data de vencimento
ALTER TABLE student_activities ADD COLUMN due_date TIMESTAMP WITH TIME ZONE;

-- NOVO: Coluna para data de correção
ALTER TABLE student_activities ADD COLUMN graded_at TIMESTAMP WITH TIME ZONE;

-- NOVO: Coluna para visibilidade
ALTER TABLE student_activities ADD COLUMN is_hidden BOOLEAN DEFAULT false;

-- NOVO: Índice para query de pendências
CREATE INDEX idx_activities_pending_tasks 
ON student_activities(due_date, graded_at, is_hidden) 
WHERE due_date IS NOT NULL AND graded_at IS NULL AND NOT is_hidden;
```

**Impacto:** Nenhum - colunas são opcionais, sistema continua funcionando

---

### 2. Nova Tabela - `pending_tasks`

```sql
CREATE TABLE pending_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  moodle_activity_id INT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) DEFAULT 'correcao_atividade',
  status VARCHAR(50) DEFAULT 'aberta',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- NOVO: Garante deduplicação de pendências
  UNIQUE(student_id, course_id, moodle_activity_id)
);

-- NOVO: Índice para performance
CREATE INDEX idx_pending_tasks_student 
ON pending_tasks(student_id, status);

CREATE INDEX idx_pending_tasks_course 
ON pending_tasks(course_id, status);
```

**Impacto:** Nenhum - é uma tabela nova, não interfere com existentes

---

### 3. Novo Tipo de Enumeration

```sql
-- Antes: task_type tinha apenas 'moodle' e 'interna'
-- Depois: adiciona 'correcao_atividade'

ALTER TYPE task_type ADD VALUE 'correcao_atividade';
```

**Impacto:** Baixo - é aditivo, código antigo continua funcionando

---

## 🔧 Mudanças no Frontend

### 1. Atualização de Hooks (React Query v5)

**Arquivo Afetado:** `src/hooks/useGeneratePendingTasks.ts` e outros

**Erro Original (React Query v4):**
```typescript
// ❌ v4 syntax - NÃO FUNCIONA em v5
const mutation = useMutation<Response, Error, Params>(
  async (params) => callApi(params),
  { onSuccess: () => {...} }
);
```

**Código Corrigido (React Query v5):**
```typescript
// ✅ v5 syntax - CORRETO
const mutation = useMutation({
  mutationFn: async (params: Params) => callApi(params),
  onSuccess: () => {...}
});
```

**Hooks Afetados:**
- `useGeneratePendingTasks.ts` - Hook principal
- `useUpdatePendingTask.ts` - Atualizar status
- `useDeletePendingTask.ts` - Deletar pendência
- `usePreviewPendingTasks.ts` - Ver preview
- `usePendingTasks.ts` - Listar pendências

**Como Testar:**
```bash
npm run dev
# Verificar console - sem erros de "defaultMutationOptions"
```

---

### 2. Nova Página: `src/pages/PendingTasks.tsx`

**Funcionalidades Principais:**
- ✅ Listagem de pendências do usuário
- ✅ Filtros por status e curso
- ✅ Busca por título
- ✅ Ações inline (atualizar, deletar)
- ✅ Integração com NewPendingTaskDialog

**Dados Exibidos:**
```
┌─ Título da Atividade
├─ Aluno (se tutor visualizando)
├─ Curso
├─ Status (aberta / em_andamento / resolvida)
├─ Data Criado
├─ Ações (Editar, Deletar)
└─ Data Resolvido (se aplicável)
```

---

### 3. Novo Modal: `src/components/actions/NewPendingTaskDialog.tsx`

**3 Passos:**

**Passo 1 - Selecionar Tipo**
```
[Correção de Atividade] ← Já selecionado
  Descrição: "Gerar pendências automaticamente..."
  
  [Voltar] [Próximo]
```

**Passo 2 - Selecionar Cursos**
```
☐ Matemática Básica (3 atividades elegíveis)
☑ Programação I (5 atividades elegíveis)
☐ Física Geral (0 atividades elegíveis)

Total: 8 atividades serão processadas

[Voltar] [Próximo]
```

**Passo 3 - Confirmação**
```
Resumo:
- Cursos: 1
- Atividades elegíveis: 8
- Atividades já com pendência: 2
- Novas pendências: 6

[Voltar] [Gerar Pendências]
```

---

## 🚀 Mudanças na Sincronização (Moodle API)

### Edge Function: `supabase/functions/moodle-api/index.ts`

**Antes:** Sincronizava apenas nome da atividade

**Depois:** Agora extrai informações críticas

```typescript
// NOVO: Para activities tipo 'assign'
const assignmentDetails = await callMoodleApi(
  moodleUrl, token, 'mod_assign_get_assignments', 
  { courseids: [courseId] }
);

// NOVO: Busca due_date baseado no Moodle
assignment.duedate && (dueDate = new Date(
  assignment.duedate * 1000
).toISOString());

// NOVO: Verifica visibilidade
const isHidden = !activity.visible || !activity.uservisible;
```

**Dados Sincronizados Agora:**
- ✅ `due_date` - Data de vencimento
- ✅ `graded_at` - Data de correção
- ✅ `is_hidden` - Se está oculta

---

## 📚 Arquivos Criados

### Backend
```
supabase/
  functions/
    generate-pending-tasks/
      index.ts          (330 linhas) ← NOVO
```

### Migrações
```
supabase/
  migrations/
    20260205_add_graded_at_and_hidden.sql      ← NOVO
    20260205140000_add_pending_tasks_constraints.sql  ← NOVO
```

### Frontend - Hooks
```
src/hooks/
  useGeneratePendingTasks.ts    ← NOVO
  usePreviewPendingTasks.ts     ← NOVO
  usePendingTasks.ts            ← NOVO
  useUpdatePendingTask.ts       ← NOVO
  useDeletePendingTask.ts       ← NOVO
```

### Frontend - Components
```
src/components/
  actions/
    NewPendingTaskDialog.tsx    ← NOVO
```

### Frontend - Pages
```
src/pages/
  PendingTasks.tsx              ← NOVO
```

### Types
```
src/types/index.ts              ← ATUALIZADO
```

---

## 🔒 Segurança

### Row Level Security (RLS)

**Política aplicada na tabela `pending_tasks`:**

```sql
-- Usuários veem apenas suas pendências
CREATE POLICY "Users see their own pending tasks"
  ON pending_tasks FOR SELECT
  USING (student_id = auth.uid());

-- Tutores veem pendências de seus alunos
CREATE POLICY "Instructors see their students' tasks"
  ON pending_tasks FOR SELECT
  USING (
    course_id IN (
      SELECT course_id FROM enrollments 
      WHERE user_id = auth.uid() AND role = 'tutor'
    )
  );
```

### Validações no Frontend
- ✅ Usuário só pode gerar pendências para seus cursos
- ✅ Tutor só vê pendências de seus alunos
- ✅ Aluno só vê suas próprias pendências

---

## 🧪 Testes Executados

### ✅ Testes Passados

1. **Login & Sincronização**
   ```
   ✓ Login com credenciais reais funciona
   ✓ Sincronização de cursos e atividades
   ✓ Dados do Moodle refletem no banco
   ```

2. **Geração de Pendências**
   ```
   ✓ Modal de 3 passos abre e fecha
   ✓ Preview calcula estatísticas corretamente
   ✓ Pendências criadas no banco de dados
   ✓ UNIQUE constraint previne duplicatas
   ```

3. **Listagem & Filtros**
   ```
   ✓ Página /pendencias carrega
   ✓ Filtro por status funciona
   ✓ Filtro por curso funciona
   ✓ Busca por título funciona
   ```

4. **Operações CRUD**
   ```
   ✓ Atualizar status de pendência
   ✓ Deletar pendência
   ✓ Timestamp completed_at preenchido
   ✓ Não há regressões em outras páginas
   ```

---

## ⚠️ Notas Importantes

### 1. React Query v5 é Breaking Change
Se o projeto estiver em v4, a instalação automática de v5 quebrou todos os hooks antigos.

**Solução:** Já aplicada - todos os hooks foram reescritos para v5.

### 2. Supabase Local vs Remoto
- **Local:** Edge Functions funcionam, ideal para desenvolvimento
- **Remoto:** Precisa deploy manual das Edge Functions

**Este projeto usa:** Supabase Local durante desenvolvimento

### 3. Índices para Performance
As queries de pendência usam:
- Índice em `(due_date, graded_at, is_hidden)`
- Índice em `(student_id, status)` para listagem

Para projetos maiores, considere indices de cobertura.

---

## 🔗 Dependências Adicionadas

Nenhuma! Usamos:
- React Query (já instalado como v5)
- Supabase JS Client (já instalado)
- Tailwind CSS (já instalado)

---

## 📋 Checklist de Validação Pré-Deploy

- [ ] Todas as migrações aplicadas no banco
- [ ] Edge Functions deployadas
- [ ] Frontend conectado ao Supabase
- [ ] Testes de smoke passando
- [ ] Sincronização de Moodle funcionando
- [ ] Geração de pendências criando registros
- [ ] Filtros e buscas operacionais
- [ ] Ações inline (atualizar/deletar) funcionando
- [ ] Modal de 3 passos completo
- [ ] RLS validando permissões

---

## 📞 Suporte

**Erro comum:** "defaultMutationOptions is not a function"
- **Causa:** Hook tentando usar React Query v4 syntax em v5
- **Solução:** Verificar padrão `useMutation({mutationFn, ...})`

**Erro comum:** "Pendências não geram"
- **Causa:** Atividades sem `due_date` ou já corrigidas
- **Solução:** Verificar `student_activities` no Supabase Studio

**Erro comum:** "Supabase conexão negada"
- **Causa:** Edge Functions requerem autenticação
- **Solução:** Verificar `SUPABASE_URL` e `SUPABASE_KEY` no `.env.local`
