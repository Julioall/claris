# Guia Tutor - Documentação Completa

## Visão Geral

O **Guia Tutor** é uma aplicação web desenvolvida para tutores e monitores acompanharem alunos e cursos do Moodle, com todos os registros de acompanhamento sendo persistidos no Supabase.

### Objetivo Principal

Permitir que tutores e monitores:
1. Autentiquem-se usando credenciais do Moodle
2. Sincronizem cursos e participantes (alunos) do Moodle
3. Visualizem um resumo semanal do acompanhamento
4. Registrem ações, notas, pendências e status de risco dos alunos

---

## Arquitetura

### Fontes de Dados

| Fonte | Responsabilidade |
|-------|------------------|
| **Moodle** | Cursos, alunos, atividades (quando disponível) |
| **Supabase** | Acompanhamento (ações, notas, pendências, histórico de risco) e cache do Moodle |

### Regras de Dados
- Qualquer pessoa com credenciais válidas do Moodle pode acessar
- O Moodle é a fonte primária para cursos/alunos/atividades
- O Supabase é a fonte da verdade para dados de acompanhamento
- Se a sincronização com Moodle falhar, usar dados do cache e sinalizar "desatualizado"

---

## Funcionalidades

### 1. Login e Autenticação

**Fluxo:**
1. Usuário informa URL do Moodle, usuário e senha
2. Sistema obtém token de autenticação do Moodle
3. Cria ou atualiza usuário no Supabase
4. Registra último login
5. Inicia sincronização automática

**Dados salvos:**
- `moodle_user_id`: ID do usuário no Moodle
- `moodle_username`: Nome de usuário
- `full_name`: Nome completo
- `email`: Email (se disponível)
- `avatar_url`: URL da foto de perfil
- `last_login`: Data/hora do último login
- `last_sync`: Data/hora da última sincronização

### 2. Sincronização com Moodle

**O que é sincronizado:**
- Cursos do usuário
- Participantes/alunos por curso
- Atividades do curso (quando disponível via API)
- Status de entrega/notas (quando disponível)

**Timestamps salvos:**
- Última sincronização geral
- Última sincronização por curso

---

## Tela Inicial: Resumo da Semana

A tela principal após o login é um dashboard semanal com foco em acompanhamento.

### Bloco 1: Indicadores da Semana

Cards com contadores:
- **Ações concluídas** na semana
- **Ações pendentes** e atrasadas
- **Pendências** abertas na semana
- **Alunos em risco** (atual e novos na semana)
- **Alunos sem contato** há X dias

### Bloco 2: Lista de Prioridades

Lista priorizada com:
- Ações atrasadas
- Pendências com prazo próximo
- Alunos em status "Crítico" ou "Risco" com pendências abertas
- Alunos sem acompanhamento recente

**Ações rápidas disponíveis:**
- Abrir aluno
- Registrar ação
- Marcar como resolvido
- Criar pendência

### Bloco 3: Visão por Curso

Lista compacta de cursos mostrando:
- Alunos em risco por curso
- Pendências abertas por curso
- Última sincronização
- Ação: "Ver painel do curso"

### Bloco 4: Feed de Atividade Recente

Timeline dos últimos registros:
- Notas criadas
- Ações criadas/concluídas
- Mudanças de risco
- Pendências resolvidas

### Filtros Disponíveis

- Semana atual / última semana
- Por curso
- Somente "em risco"
- Somente "atrasados"

---

## Navegação Principal

| Página | Descrição |
|--------|-----------|
| **Resumo da Semana** | Dashboard principal (Home) |
| **Cursos** | Lista de cursos para navegação |
| **Alunos** | Lista global com filtros |
| **Pendências** | Gerenciamento de pendências |
| **Ações** | Histórico e registro de ações |
| **Configurações** | Logout, status da sincronização |

---

## Cursos

### Lista de Cursos
- Exibe todos os cursos do usuário (sincronizados do Moodle)
- Mostra quantidade de alunos por curso
- Mostra alunos em risco por curso
- Botão para acessar painel do curso

### Painel do Curso

**Resumo do curso:**
- Total de alunos
- Alunos em risco por nível (Normal/Atenção/Risco/Crítico)
- Pendências abertas/atrasadas
- Ações abertas/atrasadas
- Última sincronização Moodle

**Lista de alunos do curso:**

| Coluna | Descrição |
|--------|-----------|
| Nome | Nome completo do aluno |
| Risco | Badge colorido com nível de risco |
| Pendências | Quantidade de pendências abertas |
| Última ação | Data da última ação registrada |
| Ação | Botão "Ver aluno" |

**Filtros:**
- Somente em risco
- Com pendências
- Sem registro recente

---

## Perfil do Aluno

O núcleo do acompanhamento. Ao abrir um aluno, são exibidos:

### 1. Cabeçalho
- Nome do aluno
- Curso(s) em que aparece
- Status de risco atual (com opção de atualizar manualmente)
- Tags opcionais: "faltoso", "baixo desempenho", "sem acesso"

### 2. Pendências/Atividades

**Tipos:**
- Pendências vindas do Moodle (atividades não entregues/atrasadas)
- Pendências internas (criadas no app)

**Campos de cada pendência:**
| Campo | Descrição |
|-------|-----------|
| Título | Descrição da pendência |
| Tipo | `moodle` ou `interna` |
| Prazo | Data limite |
| Status | Aberta, Em andamento, Resolvida |
| Prioridade | Baixa, Média, Alta, Urgente |
| Responsável | Tutor/monitor atribuído |

**Ações rápidas:**
- Criar pendência
- Marcar resolvida
- Reagendar prazo
- Adicionar nota à pendência

### 3. Ações

Registro do que o tutor fez ou vai fazer.

**Tipos de ação:**
- Contato
- Orientação
- Cobrança
- Suporte técnico
- Reunião
- Outro

**Campos:**
| Campo | Descrição |
|-------|-----------|
| Tipo | Categoria da ação |
| Descrição | Detalhes do que foi feito |
| Data | Quando foi/será realizada |
| Status | Planejada ou Concluída |
| Prazo | Data limite (se aplicável) |

**Ações rápidas:**
- Registrar ação feita
- Criar ação futura
- Marcar concluída

### 4. Notas

- Notas livres vinculadas ao aluno
- Opcionalmente vinculadas a uma pendência específica
- Histórico completo com edição

### 5. Histórico (Linha do Tempo)

Timeline unificada mostrando:
- Mudanças de risco
- Ações registradas
- Pendências criadas/resolvidas
- Notas relevantes

---

## Sistema de Risco

### Níveis de Risco

| Nível | Cor | Descrição |
|-------|-----|-----------|
| **Normal** | Verde | Aluno sem problemas identificados |
| **Atenção** | Amarelo | Sinais de alerta, requer monitoramento |
| **Risco** | Laranja | Situação preocupante, intervenção necessária |
| **Crítico** | Vermelho | Situação urgente, ação imediata necessária |

### Motivos de Risco

O sistema permite marcar múltiplos motivos:
- Atividades atrasadas
- Baixa nota
- Sem acesso recente
- Não responde contato
- Outros (texto livre)

### Atualização de Risco

- Pode ser calculado automaticamente (se houver dados do Moodle)
- Pode ser definido manualmente pelo tutor/monitor
- Todo histórico de alterações é salvo no Supabase

---

## Estrutura do Banco de Dados

### Tabelas

| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários do sistema (tutores/monitores) |
| `courses` | Cursos (cache do Moodle) |
| `students` | Alunos (cache do Moodle) |
| `user_courses` | Relação usuário ↔ curso |
| `student_courses` | Relação aluno ↔ curso |
| `pending_tasks` | Pendências/atividades |
| `actions` | Ações registradas |
| `notes` | Notas livres |
| `risk_history` | Histórico de alterações de risco |
| `activity_feed` | Feed de atividade para timeline |

### Enums

```sql
-- Níveis de risco
CREATE TYPE risk_level AS ENUM ('normal', 'atencao', 'risco', 'critico');

-- Status de tarefa
CREATE TYPE task_status AS ENUM ('aberta', 'em_andamento', 'resolvida');

-- Prioridade de tarefa
CREATE TYPE task_priority AS ENUM ('baixa', 'media', 'alta', 'urgente');

-- Tipo de tarefa
CREATE TYPE task_type AS ENUM ('moodle', 'interna');

-- Status de ação
CREATE TYPE action_status AS ENUM ('planejada', 'concluida');

-- Tipo de ação
CREATE TYPE action_type AS ENUM ('contato', 'orientacao', 'cobranca', 'suporte_tecnico', 'reuniao', 'outro');
```

---

## Integração com Moodle

### Endpoints Utilizados

| Função | Endpoint Moodle |
|--------|-----------------|
| Autenticação | `/login/token.php` |
| Info do usuário | `core_webservice_get_site_info` |
| Cursos do usuário | `core_enrol_get_users_courses` |
| Alunos do curso | `core_enrol_get_enrolled_users` |

### Edge Function: moodle-api

A integração é feita através de uma Edge Function no Supabase para contornar restrições de CORS.

**Ações disponíveis:**
- `login`: Autentica no Moodle e cria/atualiza usuário
- `sync_courses`: Sincroniza cursos do usuário
- `sync_students`: Sincroniza alunos de um curso específico

---

## Requisitos de UX

### Estados da Interface
- ✅ Loading (carregando)
- ✅ Erro (com mensagem clara)
- ✅ Vazio (sem dados)
- ✅ Offline (sem conexão)

### Elementos Obrigatórios
- Indicador "Última sincronização" sempre visível
- Botão "Sincronizar agora" acessível
- Busca global por aluno
- Filtros rápidos e intuitivos
- Interface responsiva (mobile/desktop)

---

## Tecnologias Utilizadas

| Tecnologia | Uso |
|------------|-----|
| **React** | Framework frontend |
| **TypeScript** | Tipagem estática |
| **Tailwind CSS** | Estilização |
| **shadcn/ui** | Componentes de UI |
| **Supabase** | Backend (banco de dados, edge functions) |
| **TanStack Query** | Gerenciamento de estado e cache |
| **React Router** | Navegação |
| **Lucide Icons** | Ícones |

---

## Segurança

### Row Level Security (RLS)

Todas as tabelas possuem políticas RLS para garantir que:
- Usuários só vejam seus próprios dados
- Usuários só acessem cursos/alunos vinculados a eles
- Operações de escrita sejam validadas

### Autenticação

- Baseada em token do Moodle
- Sessão persistida no localStorage
- Dados do usuário armazenados no Supabase

---

## Roadmap Futuro

### Próximas Funcionalidades
- [ ] CRUD completo de pendências no perfil do aluno
- [ ] CRUD completo de ações no perfil do aluno
- [ ] CRUD completo de notas no perfil do aluno
- [ ] Cálculo automático de risco baseado em regras
- [ ] Sincronização de atividades/notas do Moodle
- [ ] Notificações e alertas
- [ ] Relatórios e exportação de dados
- [ ] Integração com mensageria (WhatsApp, email)

---

## Estrutura de Arquivos

```
src/
├── components/
│   ├── dashboard/          # Componentes do dashboard
│   │   ├── ActivityFeed.tsx
│   │   ├── CourseOverview.tsx
│   │   ├── PriorityList.tsx
│   │   └── WeeklyIndicators.tsx
│   ├── layout/             # Layout da aplicação
│   │   ├── AppLayout.tsx
│   │   ├── AppSidebar.tsx
│   │   └── TopBar.tsx
│   └── ui/                 # Componentes de UI
│       ├── PriorityBadge.tsx
│       ├── RiskBadge.tsx
│       ├── StatCard.tsx
│       ├── StatusBadge.tsx
│       └── ... (shadcn components)
├── contexts/
│   └── AuthContext.tsx     # Contexto de autenticação
├── hooks/
│   ├── useCoursesData.ts   # Hook para dados de cursos
│   ├── useDashboardData.ts # Hook para dados do dashboard
│   ├── useMoodleApi.ts     # Hook para API do Moodle
│   └── useStudentsData.ts  # Hook para dados de alunos
├── integrations/
│   └── supabase/
│       ├── client.ts       # Cliente Supabase
│       └── types.ts        # Tipos gerados do Supabase
├── lib/
│   ├── mock-data.ts        # Dados de exemplo (dev)
│   └── utils.ts            # Utilitários
├── pages/
│   ├── Actions.tsx         # Página de ações
│   ├── Courses.tsx         # Lista de cursos
│   ├── Dashboard.tsx       # Dashboard principal
│   ├── Login.tsx           # Tela de login
│   ├── PendingTasks.tsx    # Pendências
│   ├── Settings.tsx        # Configurações
│   ├── StudentProfile.tsx  # Perfil do aluno
│   └── Students.tsx        # Lista de alunos
├── types/
│   └── index.ts            # Tipos TypeScript
├── App.tsx                 # Componente raiz
└── main.tsx                # Entry point

supabase/
└── functions/
    └── moodle-api/
        └── index.ts        # Edge function para integração Moodle
```

---

## Glossário

| Termo | Definição |
|-------|-----------|
| **Tutor** | Profissional responsável pelo acompanhamento de alunos |
| **Monitor** | Profissional que auxilia o tutor no acompanhamento |
| **Pendência** | Tarefa ou atividade que requer atenção/ação |
| **Ação** | Registro de intervenção realizada ou planejada |
| **Risco** | Classificação do status acadêmico do aluno |
| **Sincronização** | Processo de atualização de dados do Moodle |
