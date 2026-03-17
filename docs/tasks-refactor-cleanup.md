# Refatoração: Remoção do Módulo de Pendências

**Data:** Março de 2026  
**Tipo:** Limpeza estrutural / Preparação para nova implementação

---

## O que existia antes

### Feature de Pendências

O projeto possuía uma implementação completa de gerenciamento de "Pendências" que misturava responsabilidades distintas:

- **Tarefas de acompanhamento** criadas manualmente pelo tutor
- **Tarefas automáticas** geradas por risco de aluno, atividade atrasada ou atividade sem correção
- **Tarefas recorrentes** com padrões diários, semanais, quinzenais, mensais, bimestrais e trimestrais
- **Calendário e agenda** embutidos na mesma tela
- **Compromissos** e itens de rotina misturados com tarefas operacionais

### Arquivos que existiam

#### Páginas
- `src/pages/PendingTasks.tsx` — Página principal da feature de Pendências

#### Hooks
- `src/hooks/usePendingTasksData.ts` — Hook central com toda a lógica de busca, criação, atualização e filtragem de pendências

#### Biblioteca / Utilitários
- `src/lib/task-recurrence.ts` — Lógica de recorrência de tarefas (cálculo de próxima data, geração de instâncias)

#### Componentes
- `src/components/pending-tasks/` — Diretório com 7+ componentes específicos da feature:
  - `CreateTaskDialog.tsx`
  - `EditTaskDialog.tsx`
  - `TaskFilters.tsx`
  - `TaskKanban.tsx`
  - `TaskList.tsx`
  - `RecurrenceConfig.tsx`
  - E outros componentes auxiliares

#### Testes
- `src/pages/__tests__/PendingTasks.test.tsx`
- `src/hooks/__tests__/usePendingTasksData.test.ts`
- `src/lib/__tests__/task-recurrence.test.ts`
- `src/components/pending-tasks/__tests__/` (vários)

### Tipos relacionados (em `src/types/index.ts`)

Os seguintes tipos foram removidos:

```typescript
// Tipos de status e prioridade
type TaskStatus = 'aberta' | 'em_andamento' | 'resolvida';
type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';
type TaskType = 'moodle' | 'interna';

// Tipos de automação e recorrência
type TaskAutomationType = 'manual' | 'auto_at_risk' | 'auto_missed_assignment' | 'auto_uncorrected_activity' | 'recurring';
type RecurrencePattern = 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral';
type RecurrenceWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Interfaces
interface PendingTask { ... }
interface TaskRecurrenceConfig { ... }
interface PriorityItem { ... }
```

O campo `pending_task_id` foi também removido da interface `Note`.

### Rota removida

- `/pendencias` → `<PendingTasks />`

### Item de navegação removido

- **"Pendências"** com ícone `ClipboardList` no menu lateral (`AppSidebar`)

---

## Por que foi removido

O sistema ainda não estava em produção e a implementação tinha problemas estruturais:

1. **Mistura de responsabilidades**: tarefas, agenda, compromissos e rotinas num único módulo
2. **Instabilidade**: a interface estava confusa e difícil de manter
3. **Acoplamento excessivo**: a feature estava acoplada ao dashboard, ao perfil do aluno e aos indicadores semanais
4. **Complexidade desnecessária**: sistema de recorrência completo antes de validar o uso básico

A decisão foi remover completamente e reconstruir do zero com arquitetura mais clara.

---

## Arquivos removidos

| Arquivo | Motivo |
|---------|--------|
| `src/pages/PendingTasks.tsx` | Página da feature removida |
| `src/pages/__tests__/PendingTasks.test.tsx` | Testes da página removida |
| `src/hooks/usePendingTasksData.ts` | Hook específico da feature |
| `src/hooks/__tests__/usePendingTasksData.test.ts` | Testes do hook |
| `src/lib/task-recurrence.ts` | Lógica de recorrência da feature |
| `src/lib/__tests__/task-recurrence.test.ts` | Testes da recorrência |
| `src/components/pending-tasks/` | Diretório completo com todos os componentes |

---

## Rotas removidas

| Rota | Componente | Status |
|------|-----------|--------|
| `/pendencias` | `PendingTasks` | ❌ Removida |

---

## Arquivos modificados

### Roteamento (`src/App.tsx`)
- Removido import e rota `/pendencias`
- Adicionados imports e rotas `/tarefas` e `/agenda`

### Navegação (`src/components/layout/AppSidebar.tsx`)
- Removido item "Pendências" (`/pendencias`, ícone `ClipboardList`)
- Adicionado item "Tarefas" (`/tarefas`, ícone `CheckSquare`)
- Adicionado item "Agenda" (`/agenda`, ícone `CalendarDays`)

### Tipos (`src/types/index.ts`)
- Removidos todos os tipos de task (ver seção acima)
- Removido `pending_task_id` da interface `Note`

### Dashboard (`src/hooks/useDashboardData.ts`, `src/components/dashboard/PriorityList.tsx`, `src/pages/Dashboard.tsx`)
- A query de `pending_tasks` foi simplificada: agora busca apenas **contagem** (sem dados completos)
- Removidas as listas `pendingTasks`, `overdueTasks` e `upcomingTasks` do hook e do componente
- `PriorityList` agora exibe apenas alunos em situação crítica (sem seções de tarefas atrasadas/próximas)
- O campo `pending_tasks` em `WeeklySummary` continua presente como contador para os indicadores da semana

### Perfil do Aluno (`src/hooks/useStudentProfile.ts`, `src/pages/StudentProfile.tsx`)
- Removida interface local `PendingTask` do hook
- Removida query da tabela `pending_tasks` do hook
- Removido campo `pendingTasks` e `stats.pendingTasksCount` do retorno do hook
- Substituída a aba "Pendências" por aba "Tarefas" com placeholder de "em construção"
- Removida exibição de contagem de pendências nos quick stats do perfil

### Mock data (`src/lib/mock-data.ts`)
- Removido `mockPendingTasks`
- Removida função `getTasksByStudent`
- `mockWeeklySummary` atualizado para usar valores estáticos

---

## Pontos preparados para nova implementação

### Rotas placeholder criadas

| Rota | Componente | Status |
|------|-----------|--------|
| `/tarefas` | `src/pages/Tarefas.tsx` | ✅ Placeholder criado |
| `/agenda` | `src/pages/Agenda.tsx` | ✅ Placeholder criado |

### Navegação atualizada

O menu lateral já inclui "Tarefas" e "Agenda" apontando para as novas rotas.

### Tabela Supabase preservada

A tabela `pending_tasks` **não foi removida** do Supabase. O módulo de Tarefas pode reutilizá-la ou criar uma nova estrutura — fica a critério da nova implementação.

O dashboard ainda consulta a contagem da tabela `pending_tasks` para o indicador "Tarefas em aberto" na tela principal.

---

## Observações para o próximo passo

### Módulo de Tarefas (`/tarefas`)
- Criar página `src/pages/Tarefas.tsx` com funcionalidade real
- Criar hook `src/hooks/useTasksData.ts` com lógica de CRUD de tarefas
- Criar componentes em `src/components/tasks/`
- Reavaliar se a tabela `pending_tasks` existente atende ou se deve ser criada nova tabela
- Sugestão: renomear a tabela para `tasks` em uma migration futura
- Definir claramente o escopo: tarefas do tutor sobre alunos (não de alunos para o tutor)

### Módulo de Agenda (`/agenda`)
- Manter separado do módulo de Tarefas
- Escopo sugerido: compromissos com datas fixas, reuniões, prazos de entrega
- Pode integrar com o calendário do Moodle via Edge Function `moodle-api`
- Considerar uso de uma tabela `events` separada no Supabase

### Tipos a criar
Ao reconstruir o módulo, criar tipos novos e bem definidos:
```typescript
// Sugestão para o novo módulo de Tarefas
type TaskStatus = 'aberta' | 'em_andamento' | 'concluida';
type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  student_id?: string;
  course_id?: string;
  due_date?: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}
```

### Integração com Dashboard
O dashboard atualmente mostra a contagem de `pending_tasks` como indicador. Quando o novo módulo for implementado:
- Atualizar `useDashboardData.ts` para retornar a lista completa de tarefas (ou resumo)
- Reavaliar o componente `PriorityList` para mostrar tarefas prioritárias novamente
