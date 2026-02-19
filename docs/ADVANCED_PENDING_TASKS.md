# Sistema Avançado de Pendências - Documentação

## 📋 Visão Geral

Sistema completo para gerenciamento avançado de pendências no moodle-monitor, incluindo:
- Pendências atribuídas a turmas inteiras
- Recorrência automática de pendências
- Geração automática baseada em condições
- Rastreamento de ações e eficácia
- Histórico completo de ações

## 🎯 Funcionalidades Implementadas

### 1. Atribuição de Pendência à Turma

**Descrição:** Permite criar pendências para uma turma inteira quando não há necessidade de atribuir a um aluno específico.

**Como usar:**
1. Acesse "Pendências" no menu
2. Clique em "Criar Pendência" → "Pendência Manual"
3. Selecione o curso
4. **Deixe o campo "Aluno" vazio** para atribuir à turma inteira
5. Preencha os demais campos e salve

**Casos de uso:**
- Avisos gerais para toda a turma
- Tarefas de acompanhamento geral
- Verificações periódicas de engajamento da turma

### 2. Pendências Recorrentes

**Descrição:** Sistema para criar pendências que se repetem automaticamente em intervalos configurados.

**Padrões disponíveis:**
- Diário
- Semanal
- Quinzenal
- Mensal
- Bimestral
- Trimestral

**Como usar:**
1. Acesse "Pendências" no menu
2. Clique em "Criar Pendência" → "Pendência Recorrente"
3. Configure:
   - Título e descrição
   - Padrão de recorrência
   - Data de início e término (opcional)
   - Curso e opcionalmente um aluno
   - Tipo e prioridade
4. Salve a configuração

**Processo automático:**
- A Edge Function `generate-recurring-tasks` processa configurações ativas
- Gera novas pendências conforme o padrão configurado
- Atualiza automaticamente a data da próxima geração
- Pode ser executada manualmente ou via cron job

### 3. Geração Automática de Pendências

**Descrição:** Sistema que identifica automaticamente situações que requerem atenção e cria pendências.

**Tipos de automação:**

#### a) Alunos em Risco (`auto_at_risk`)
- **Critério:** Alunos com nível de risco "risco" ou "crítico"
- **Ação:** Cria pendência com prioridade alta/urgente
- **Título:** "Acompanhar aluno em [nível de risco]"
- **Deduplicação:** Verifica se já existe pendência aberta para o aluno

#### b) Atividades Não Entregues (`auto_missed_assignment`)
- **Critério:** Atividades com prazo vencido e não submetidas
- **Ação:** Cria pendência de prioridade alta
- **Título:** "Atividade não entregue: [nome da atividade]"
- **Deduplicação:** Por student_id, course_id e activity_id

#### c) Atividades Não Corrigidas (`auto_uncorrected_activity`)
- **Critério:** Atividades submetidas mas não corrigidas
- **Ação:** Cria pendência de prioridade média
- **Título:** "Corrigir atividade: [nome da atividade]"
- **Deduplicação:** Por student_id, course_id e activity_id

**Como usar:**
1. Acesse "Pendências" no menu
2. Clique no botão "Gerar Automáticas"
3. O sistema processa todos os tipos de automação
4. Mostra quantas pendências foram criadas

### 4. Sistema de Ações e Eficácia

**Descrição:** Registra ações executadas para resolver pendências e avalia sua eficácia.

**Tipos de ação:**
- Contato
- Orientação
- Cobrança
- Suporte Técnico
- Reunião
- Outro

**Níveis de eficácia:**
- **Pendente:** Ação ainda não executada/avaliada
- **Eficaz:** Resolveu o problema → fecha a pendência automaticamente
- **Não Eficaz:** Não resolveu → mantém pendência aberta
- **Parcialmente Eficaz:** Resolveu parcialmente → marca pendência como "em andamento"

**Como usar:**
1. Na lista de pendências, clique no ícone de ações (ícone de lista)
2. Preencha:
   - Tipo de ação
   - Descrição detalhada do que foi feito
   - Eficácia da ação
   - Observações (opcional)
3. Salve a ação

**Automação:**
- **Trigger do banco de dados** atualiza status da pendência automaticamente
- Se eficácia = "eficaz" → pendência marcada como "resolvida"
- Se eficácia = "não eficaz" ou "parcialmente eficaz" → pendência mantida ativa
- Histórico completo é registrado em `task_action_history`

### 5. Histórico de Ações

**Descrição:** Sistema de auditoria que registra todas as mudanças de eficácia das ações.

**Informações rastreadas:**
- ID da ação
- ID da pendência
- Eficácia anterior
- Nova eficácia
- Observações
- Usuário que fez a alteração
- Data/hora da mudança

**Tabela:** `task_action_history`

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais

#### `pending_tasks` (atualizada)
```sql
- student_id (UUID, opcional) -- null para pendências de turma
- automation_type (ENUM) -- tipo de automação que criou
- is_recurring (BOOLEAN) -- se é recorrente
- recurrence_id (UUID) -- referência à configuração de recorrência
- parent_task_id (UUID) -- referência à tarefa pai
```

#### `task_recurrence_configs` (nova)
```sql
- id (UUID)
- title (TEXT)
- description (TEXT)
- pattern (ENUM) -- diario, semanal, etc
- start_date (TIMESTAMP)
- end_date (TIMESTAMP, opcional)
- course_id (UUID)
- student_id (UUID, opcional)
- created_by_user_id (UUID)
- task_type (ENUM)
- priority (ENUM)
- is_active (BOOLEAN)
- last_generated_at (TIMESTAMP)
- next_generation_at (TIMESTAMP)
```

#### `task_actions` (nova)
```sql
- id (UUID)
- pending_task_id (UUID)
- action_type (ENUM)
- description (TEXT)
- effectiveness (ENUM)
- executed_by_user_id (UUID)
- executed_at (TIMESTAMP)
- notes (TEXT)
```

#### `task_action_history` (nova)
```sql
- id (UUID)
- task_action_id (UUID)
- pending_task_id (UUID)
- previous_effectiveness (ENUM)
- new_effectiveness (ENUM)
- notes (TEXT)
- changed_by_user_id (UUID)
- created_at (TIMESTAMP)
```

### Novos ENUMs

```sql
-- Tipos de automação
CREATE TYPE task_automation_type AS ENUM (
  'manual',
  'auto_at_risk',
  'auto_missed_assignment',
  'auto_uncorrected_activity',
  'recurring'
);

-- Eficácia de ações
CREATE TYPE action_effectiveness AS ENUM (
  'pendente',
  'eficaz',
  'nao_eficaz',
  'parcialmente_eficaz'
);

-- Padrões de recorrência
CREATE TYPE recurrence_pattern AS ENUM (
  'diario',
  'semanal',
  'quinzenal',
  'mensal',
  'bimestral',
  'trimestral'
);
```

## 🔧 Edge Functions

### `generate-recurring-tasks`

**Endpoint:** `POST /functions/v1/generate-recurring-tasks`

**Autenticação:** Requer token JWT válido

**Funcionalidade:**
1. Busca configurações de recorrência ativas
2. Filtra por `next_generation_at <= agora`
3. Cria novas pendências baseadas nas configurações
4. Calcula e atualiza próxima data de geração
5. Retorna estatísticas de geração

**Exemplo de resposta:**
```json
{
  "message": "Generated 3 recurring tasks",
  "results": [
    { "config_id": "uuid-1", "tasks_created": 1 },
    { "config_id": "uuid-2", "tasks_created": 1 },
    { "config_id": "uuid-3", "tasks_created": 1 }
  ]
}
```

### `generate-automated-tasks`

**Endpoint:** `POST /functions/v1/generate-automated-tasks`

**Autenticação:** Requer token JWT válido

**Body (opcional):**
```json
{
  "automation_types": ["auto_at_risk", "auto_missed_assignment"]
  // null ou omitido = todos os tipos
}
```

**Funcionalidade:**
1. Processa cada tipo de automação solicitado
2. Identifica alunos/atividades que atendem os critérios
3. Cria pendências (com deduplicação)
4. Retorna estatísticas por tipo

**Exemplo de resposta:**
```json
{
  "message": "Generated 15 automated tasks",
  "results": [
    { "type": "auto_at_risk", "tasks_created": 5 },
    { "type": "auto_missed_assignment", "tasks_created": 8 },
    { "type": "auto_uncorrected_activity", "tasks_created": 2 }
  ]
}
```

## 🎨 Componentes React

### `NewPendingTaskDialog`
- Atualizado para suportar pendências de turma
- Campo "Aluno" agora é opcional
- Adiciona `automation_type: 'manual'` nas pendências criadas

### `NewRecurringTaskDialog` (novo)
- Formulário para configurar recorrência
- Seleção de padrão de recorrência
- Datas de início e término
- Seleção de curso e aluno (opcional)

### `AddTaskActionDialog` (novo)
- Formulário para registrar ação
- Seleção de tipo e eficácia
- Feedback visual sobre impacto da eficácia
- Cria registro em `task_actions`

### `PendingTasks` (atualizado)
- Menu dropdown para tipos de pendência
- Botão "Gerar Automáticas"
- Badge visual para tipo de automação
- Badge para pendências recorrentes
- Botão para adicionar ação em cada pendência
- Suporte para pendências de turma (sem link de aluno)

## 🔒 Segurança (RLS)

Todas as novas tabelas têm Row Level Security habilitado:

- **task_recurrence_configs:** Usuário vê apenas suas próprias ou de seus cursos
- **task_actions:** Usuário vê ações de pendências que criou ou foi atribuído
- **task_action_history:** Usuário vê histórico de pendências que tem acesso

## 🚀 Como Testar

### 1. Testar Pendência de Turma
```
1. Criar pendência manual
2. Selecionar curso
3. NÃO selecionar aluno
4. Verificar na lista que aparece "Turma: [nome do curso]"
```

### 2. Testar Recorrência
```
1. Criar pendência recorrente semanal
2. Chamar Edge Function manualmente:
   curl -X POST [SUPABASE_URL]/functions/v1/generate-recurring-tasks \
     -H "Authorization: Bearer [TOKEN]"
3. Verificar que pendência foi criada
4. Verificar badge "Recorrente" na lista
```

### 3. Testar Geração Automática
```
1. Garantir que há alunos em risco no sistema
2. Clicar em "Gerar Automáticas"
3. Verificar toast com quantidade criada
4. Verificar badges de automação na lista
```

### 4. Testar Ações e Eficácia
```
1. Criar pendência manual
2. Clicar no ícone de ações
3. Adicionar ação com eficácia "Eficaz"
4. Verificar que pendência foi automaticamente resolvida
5. Criar nova pendência
6. Adicionar ação com eficácia "Não Eficaz"
7. Verificar que pendência permanece aberta
```

## 📊 Fluxos de Dados

### Fluxo de Recorrência
```
Configuração criada
    ↓
Salva em task_recurrence_configs
    ↓
next_generation_at calculado
    ↓
[Edge Function executa periodicamente]
    ↓
Busca configs com next_generation_at <= agora
    ↓
Cria pending_tasks com is_recurring=true
    ↓
Atualiza last_generated_at e next_generation_at
```

### Fluxo de Automação
```
Usuário clica "Gerar Automáticas"
    ↓
Edge Function consulta:
  - Alunos em risco
  - Atividades não entregues
  - Atividades não corrigidas
    ↓
Para cada item encontrado:
  - Verifica duplicata
  - Cria pending_task
  - Marca automation_type
    ↓
Retorna estatísticas
```

### Fluxo de Ação
```
Usuário adiciona ação
    ↓
Salva em task_actions
    ↓
[Trigger: update_task_status_from_action]
    ↓
Se effectiveness = 'eficaz':
  - Atualiza pending_task.status = 'resolvida'
  - Define completed_at
    ↓
Se effectiveness = 'nao_eficaz' ou 'parcialmente_eficaz':
  - Atualiza pending_task.status = 'em_andamento'
    ↓
Registra em task_action_history
```

## 🔄 Manutenção e Monitoramento

### Cron Jobs Recomendados

#### Gerar Pendências Recorrentes
```sql
-- Executar diariamente às 00:00
SELECT cron.schedule(
  'generate-recurring-tasks',
  '0 0 * * *',
  $$
  SELECT http_request(
    'POST',
    '[SUPABASE_URL]/functions/v1/generate-recurring-tasks',
    ARRAY[http_header('Authorization', 'Bearer [SERVICE_ROLE_KEY]')]
  );
  $$
);
```

#### Gerar Pendências Automáticas
```sql
-- Executar diariamente às 06:00
SELECT cron.schedule(
  'generate-automated-tasks',
  '0 6 * * *',
  $$
  SELECT http_request(
    'POST',
    '[SUPABASE_URL]/functions/v1/generate-automated-tasks',
    ARRAY[http_header('Authorization', 'Bearer [SERVICE_ROLE_KEY]')]
  );
  $$
);
```

### Queries de Monitoramento

#### Estatísticas de Automação
```sql
SELECT 
  automation_type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'resolvida' THEN 1 END) as resolvidas,
  COUNT(CASE WHEN status != 'resolvida' THEN 1 END) as abertas
FROM pending_tasks
WHERE automation_type != 'manual'
GROUP BY automation_type;
```

#### Eficácia das Ações
```sql
SELECT 
  action_type,
  effectiveness,
  COUNT(*) as total
FROM task_actions
GROUP BY action_type, effectiveness
ORDER BY action_type, effectiveness;
```

#### Recorrências Ativas
```sql
SELECT 
  title,
  pattern,
  last_generated_at,
  next_generation_at,
  CASE 
    WHEN student_id IS NULL THEN 'Turma'
    ELSE 'Aluno'
  END as tipo
FROM task_recurrence_configs
WHERE is_active = true
ORDER BY next_generation_at;
```

## 🐛 Troubleshooting

### Problema: Pendências recorrentes não estão sendo geradas
**Solução:**
1. Verificar se `is_active = true` na configuração
2. Verificar se `next_generation_at <= now()`
3. Verificar logs da Edge Function
4. Testar manualmente chamando a Edge Function

### Problema: Pendências automáticas duplicadas
**Solução:**
- Sistema tem deduplicação automática
- Verifica por student_id, course_id, moodle_activity_id
- Se ocorrer, verificar lógica de deduplicação na Edge Function

### Problema: Status da pendência não atualiza após ação
**Solução:**
1. Verificar se trigger `trigger_update_task_status_from_action` está ativo
2. Verificar logs do PostgreSQL
3. Testar trigger manualmente:
```sql
UPDATE task_actions 
SET effectiveness = 'eficaz' 
WHERE id = '[action_id]';
```

## 📝 Próximos Passos

- [ ] Dashboard de métricas de pendências
- [ ] Notificações push para pendências urgentes
- [ ] Exportação de relatórios
- [ ] Integração com calendário
- [ ] Templates de pendências recorrentes
- [ ] Bulk operations (ações em massa)
