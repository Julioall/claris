 # ACTiM - Documentação de Handoff para Desenvolvimento Externo
 
 > Versão: 1.0  
 > Última atualização: 2026-02-05  
 > Ambiente: Lovable → VS Code + GitHub Copilot
 
 ---
 
 ## Índice
 
 0. [TL;DR Operacional (para IA)](#0-tldr-operacional-para-ia)
 1. [Stack Técnico e Decisões de Arquitetura](#1-stack-técnico-e-decisões-de-arquitetura)
 2. [Como Subir Localmente](#2-como-subir-localmente)
 3. [Estrutura de Pastas e Convenções](#3-estrutura-de-pastas-e-convenções)
 4. [Frontend: Padrões de UI e Design System](#4-frontend-padrões-de-ui-e-design-system)
 5. [Formulários, Validação e Feedback](#5-formulários-validação-e-feedback)
 6. [Dados: Supabase (Schema, RLS, Migrations, Funções)](#6-dados-supabase-schema-rls-migrations-funções)
 7. [Integração Moodle via Edge Function](#7-integração-moodle-via-edge-function)
 8. [Estado e Cache: React Query + Context](#8-estado-e-cache-react-query--context)
 9. [Sincronização: Fluxo Ponta a Ponta](#9-sincronização-fluxo-ponta-a-ponta)
 10. [Qualidade, Lint, Testes e Padrões](#10-qualidade-lint-testes-e-padrões)
 11. [Roadmap, Pendências e Dívida Técnica](#11-roadmap-pendências-e-dívida-técnica)
 12. [Golden Rules](#12-golden-rules)
 
 ---
 
 ## 0. TL;DR Operacional (para IA)
 
 ### O que é o projeto
 
 **ACTiM** é uma aplicação web para tutores e monitores acompanharem alunos de cursos no Moodle. Os dados de cursos/alunos vêm do Moodle via API; todos os registros de acompanhamento (ações, notas, pendências, risco) são persistidos no Supabase.
 
 ### Como rodar local (1 comando)

```bash
docker compose up --build -d
```

Endpoints:
- Frontend: `http://localhost:8080`
- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
 
 ### Onde ficam as coisas
 
 | Responsabilidade | Caminho |
 |------------------|---------|
 | **Autenticação** | `src/contexts/AuthContext.tsx` |
 | **Rotas** | `src/App.tsx` (React Router) |
 | **Queries/Hooks** | `src/hooks/use*.ts` |
 | **Componentes UI** | `src/components/ui/` (shadcn) + `src/components/` (custom) |
 | **Edge Functions** | `supabase/functions/moodle-api/index.ts` |
 | **Migrations** | `supabase/migrations/` (read-only, gerenciado por Lovable) |
 | **Tipos** | `src/types/index.ts` (manual) + `src/integrations/supabase/types.ts` (auto-gerado) |
 | **Design Tokens** | `src/index.css` (CSS variables) |
 
 ### Como adicionar feature (5 passos)
 
 1. **Tipo**: Adicionar interface em `src/types/index.ts`
 2. **Hook**: Criar `src/hooks/useNomeData.ts` usando `supabase` + pattern existente
 3. **Componente**: Criar em `src/components/<categoria>/NomeComponente.tsx`
 4. **Página** (se aplicável): Criar em `src/pages/Nome.tsx`, registrar rota em `src/App.tsx`
 5. **Testar**: Verificar console, network, e fluxo no preview
 
 ---
 
 ## 1. Stack Técnico e Decisões de Arquitetura
 
 ### 1.1 Frontend
 
 | Tecnologia | Versão | Arquivo de Config |
 |------------|--------|-------------------|
 | **Vite** | 5.x | `vite.config.ts` |
 | **React** | 18.3.1 | `package.json` |
 | **TypeScript** | 5.x | `tsconfig.json`, `tsconfig.app.json` |
 | **Tailwind CSS** | 3.x | `tailwind.config.ts`, `src/index.css` |
 | **React Router** | 6.30.1 | `src/App.tsx` |
 
 **Por quê Vite?** Build rápido, HMR eficiente, configuração simples. Veja `vite.config.ts` linhas 7-21.
 
 **Por quê React Router?** Navegação SPA declarativa com `<Routes>`, `<Route>`, e `<Outlet>` para layouts aninhados. Veja `src/App.tsx` linhas 38-56.
 
 ### 1.2 Backend
 
 | Tecnologia | Uso | Arquivo |
 |------------|-----|---------|
 | **Supabase** | PostgreSQL + RLS + Edge Functions | `src/integrations/supabase/client.ts` |
 | **Edge Functions (Deno)** | Integração Moodle | `supabase/functions/moodle-api/index.ts` |
 
 **Por quê Supabase?** RLS nativo para segurança por usuário, Edge Functions para contornar CORS do Moodle, SDK JavaScript integrado.
 
 ### 1.3 Estado e Data Fetching
 
 | Tecnologia | Uso | Exemplo |
 |------------|-----|---------|
 | **React Query** | Cache e fetch de dados | `src/App.tsx` linha 22 (QueryClient) |
 | **Context API** | Estado global (auth, sessão) | `src/contexts/AuthContext.tsx` |
 | **useState** | Estado local de componente | Todos os componentes |
 
 **Por quê Context para Auth?** Estado de sessão precisa ser global e persistido em localStorage. Veja `AuthContext.tsx` linhas 66-85 (loadSession).
 
 ### 1.4 UI Components
 
 | Tecnologia | Uso | Caminho |
 |------------|-----|---------|
 | **shadcn/ui** | Componentes base | `src/components/ui/` |
 | **Radix UI** | Primitivos acessíveis | Importados via shadcn |
 | **Lucide React** | Ícones | Importados em componentes |
 
 **Por quê shadcn?** Componentes copiáveis, customizáveis, não são dependência externa. Cada arquivo em `src/components/ui/` é editável.
 
 ### 1.5 Formulários e Validação
 
 | Tecnologia | Uso |
 |------------|-----|
 | **React Hook Form** | Gerenciamento de forms |
 | **Zod** | Schema de validação |
 
 **Nota**: Formulários simples usam `useState` diretamente (ex: `src/pages/Login.tsx`). Forms complexos devem usar RHF+Zod.
 
 ---
 
 ## 2. Como Subir Localmente
 
 ### 2.1 Pre-requisitos

Fluxo recomendado (Docker-only):
- **Docker Desktop** com Docker Compose

Fluxo alternativo (sem Docker, apenas frontend):
- **Node.js**: >= 18.x
- **npm** ou **bun**

**Supabase CLI** local nao e obrigatorio para o fluxo padrao.

### 2.2 Variaveis de Ambiente

O `.env` do Lovable pode permanecer no repositorio, mas **nao e usado pelo Docker Compose local**.

No modo Docker, as variaveis necessarias ja estao no `docker-compose.yml`:

```env
VITE_SUPABASE_PROJECT_ID=local
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_URL=http://127.0.0.1:54321
```

### 2.3 Setup do Frontend
 
 ```bash
 # 1. Instalar dependências
 npm install
 
 # 2. Rodar em desenvolvimento
 npm run dev
 # Abre em http://localhost:8080
 
 # 3. Build de produção
 npm run build
 
 # 4. Preview do build
 npm run preview
 ```
 
 **Alias `@/`**: Configurado em `vite.config.ts` linha 16-18 e `tsconfig.app.json`. Aponta para `./src/`.
 
 ### 2.4 Setup do Supabase (Local)

O fluxo atual nao exige `supabase` CLI instalado na maquina.

```bash
docker compose up --build -d
```

O servico `supabase` do Compose executa `supabase start` internamente, aplica migrations em `supabase/migrations/` e sobe as Edge Functions em `supabase/functions/`.

Para parar tudo:

```bash
docker compose down
```

### 2.5 Troubleshooting Comum
 
 | Problema | Causa | Solução |
 |----------|-------|---------|
 | "Failed to fetch" em Edge Function | CORS headers incorretos | Verificar `corsHeaders` em `moodle-api/index.ts` linha 3-10 |
 | RLS negando acesso | `auth.uid()` é NULL | Verificar se usuário está logado, sessão no localStorage |
 | "User not found in database" | Login não criou usuário | Verificar logs da Edge Function no dashboard Supabase |
 | Componentes não renderizam | Erro de import/export | Verificar console do browser |
 | Tipos incorretos após migration | `types.ts` desatualizado | Arquivo é auto-gerado, não editar manualmente |
 | Edge Function timeout | Sync muito grande | Reduzir `STUDENT_BATCH_SIZE` em `AuthContext.tsx` |
 | Token Moodle inválido | Serviço web desabilitado | Verificar se `moodle_mobile_app` está habilitado no Moodle |
 | "infinite recursion in policy" | RLS referencia própria tabela | Usar function `SECURITY DEFINER` |
 | Dados desatualizados | Cache React Query | Chamar `refetch()` ou invalidar queryKey |
 | Login não redireciona | Estado isAuthenticated não atualiza | Verificar `saveSession()` em `AuthContext.tsx` |
 
 ---
 
 ## 3. Estrutura de Pastas e Convenções
 
 ### 3.1 Árvore do Projeto
 
 ```
 src/
 ├── components/
 │   ├── ui/                    # shadcn components (Button, Card, Dialog, etc)
 │   ├── layout/                # AppLayout, AppSidebar, TopBar
 │   ├── dashboard/             # WeeklyIndicators, PriorityList, CourseOverview, ActivityFeed
 │   ├── courses/               # CategoryHierarchy, CourseCard, MyCourseCard
 │   ├── schools/               # SchoolHierarchy, SchoolCourseCard
 │   ├── student/               # StudentGradesTab
 │   ├── actions/               # NewActionDialog
 │   ├── settings/              # ActionTypesCard, DataCleanupCard, GradeDebugCard
 │   └── sync/                  # CourseSelectorDialog, SyncProgressDialog
 ├── contexts/
 │   └── AuthContext.tsx        # Autenticação + Sessão Moodle + Sincronização
 ├── hooks/
 │   ├── useCoursesData.ts      # Fetch cursos do usuário
 │   ├── useStudentsData.ts     # Fetch alunos (global ou por curso)
 │   ├── useDashboardData.ts    # Dados do dashboard semanal
 │   ├── useStudentProfile.ts   # Perfil completo do aluno
 │   ├── useActionsData.ts      # Ações do usuário
 │   ├── useAllCoursesData.ts   # Hierarquia escola > curso > turma
 │   ├── useCoursePanel.ts      # Dados do painel de curso
 │   ├── useMoodleApi.ts        # Wrapper para Edge Function
 │   └── use-toast.ts           # Toast notifications (shadcn)
 ├── integrations/
 │   └── supabase/
 │       ├── client.ts          # Cliente Supabase (NÃO EDITAR)
 │       └── types.ts           # Tipos gerados (NÃO EDITAR)
 ├── lib/
 │   ├── utils.ts               # cn() e utilitários
 │   └── mock-data.ts           # Dados mock + helpers (getRiskLevelLabel)
 ├── pages/
 │   ├── Login.tsx              # Tela de login
 │   ├── Dashboard.tsx          # Resumo semanal
 │   ├── MyCourses.tsx          # Lista de cursos (cards)
 │   ├── Schools.tsx            # Hierarquia escola > curso > turma
 │   ├── CoursePanel.tsx        # Painel de curso individual
 │   ├── Students.tsx           # Lista global de alunos
 │   ├── StudentProfile.tsx     # Perfil do aluno
 │   ├── PendingTasks.tsx       # Pendências
 │   ├── Actions.tsx            # Ações registradas
 │   ├── Settings.tsx           # Configurações
 │   └── NotFound.tsx           # 404
 ├── types/
 │   └── index.ts               # Tipos manuais (RiskLevel, Course, Student, etc)
 ├── App.tsx                    # Rotas + Providers
 ├── main.tsx                   # Entry point
 └── index.css                  # Design tokens CSS
 
 supabase/
 ├── config.toml                # Configuração do projeto
 ├── migrations/                # Migrations SQL (read-only)
 └── functions/
     └── moodle-api/
         └── index.ts           # Edge Function para integração Moodle
 ```
 
 ### 3.2 Convenções Obrigatórias
 
 #### Naming
 
 | Tipo | Convenção | Exemplo |
 |------|-----------|---------|
 | Componentes | PascalCase | `RiskBadge.tsx`, `StudentProfile.tsx` |
 | Hooks | camelCase, prefixo `use` | `useStudentsData.ts` |
 | Tipos | PascalCase | `RiskLevel`, `Student` |
 | Variáveis CSS | kebab-case | `--risk-critico`, `--sidebar-background` |
 | Arquivos de página | PascalCase | `Dashboard.tsx` |
 | Arquivos utilitários | kebab-case | `mock-data.ts` |
 
 #### Padrão de Imports
 
 ```typescript
 // 1. React e libs externas
 import { useState, useEffect, useCallback } from 'react';
 import { useNavigate } from 'react-router-dom';
 
 // 2. Componentes UI (shadcn)
 import { Button } from '@/components/ui/button';
 import { Card } from '@/components/ui/card';
 
 // 3. Componentes custom
 import { RiskBadge } from '@/components/ui/RiskBadge';
 
 // 4. Hooks
 import { useAuth } from '@/contexts/AuthContext';
 import { useStudentsData } from '@/hooks/useStudentsData';
 
 // 5. Tipos
 import { Student, RiskLevel } from '@/types';
 
 // 6. Utilitários
 import { cn } from '@/lib/utils';
 import { supabase } from '@/integrations/supabase/client';
 ```
 
 #### Padrão de Exports
 
 - **Componentes de página**: `export default function NomePagina()`
 - **Componentes reutilizáveis**: `export function NomeComponente()`
 - **Hooks**: `export function useNome()`
 - **Tipos**: `export interface Nome` ou `export type Nome`
 
 #### Padrão de Composição
 
 ```
 Página → usa Hook(s) → Hook chama Supabase → Supabase retorna dados tipados
                    ↓
               renderiza Componente(s) com dados
 ```
 
 Exemplo real em `src/pages/Dashboard.tsx`:
 ```typescript
 // Página
 export default function Dashboard() {
   // Usa hooks
   const { summary, overdueActions, ... } = useDashboardData(selectedWeek, selectedCourse);
   const { courses } = useCoursesData();
   
   // Renderiza componentes
   return (
     <WeeklyIndicators summary={summary} />
     <PriorityList overdueActions={overdueActions} ... />
   );
 }
 ```
 
 ### 3.3 Receitas Lovable
 
 #### Nova Página (Rota)
 
 1. Criar `src/pages/NovaPagina.tsx`:
 ```typescript
 import { useState } from 'react';
 import { Loader2 } from 'lucide-react';
 import { useAuth } from '@/contexts/AuthContext';
 
 export default function NovaPagina() {
   const { user } = useAuth();
   const [isLoading, setIsLoading] = useState(false);
 
   if (isLoading) {
     return (
       <div className="flex items-center justify-center h-64">
         <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
       </div>
     );
   }
 
   return (
     <div className="space-y-6 animate-fade-in">
       <h1 className="text-2xl font-bold tracking-tight">Título da Página</h1>
       {/* Conteúdo */}
     </div>
   );
 }
 ```
 
 2. Registrar em `src/App.tsx`:
 ```typescript
 import NovaPagina from "@/pages/NovaPagina";
 
 // Dentro de <Routes> → <Route element={<ProtectedRoute>...}>
 <Route path="/nova-pagina" element={<NovaPagina />} />
 ```
 
 3. Adicionar link no sidebar `src/components/layout/AppSidebar.tsx`
 
 #### Novo Componente
 
 1. Criar `src/components/<categoria>/NomeComponente.tsx`:
 ```typescript
 import { cn } from '@/lib/utils';
 
 interface NomeComponenteProps {
   dados: TipoDados;
   className?: string;
 }
 
 export function NomeComponente({ dados, className }: NomeComponenteProps) {
   return (
     <div className={cn("", className)}>
       {/* Renderização */}
     </div>
   );
 }
 ```
 
 #### Novo Hook com Supabase
 
 1. Criar `src/hooks/useNomeData.ts`:
 ```typescript
 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { TipoRetorno } from '@/types';
 
 export function useNomeData(filtro?: string) {
   const { user } = useAuth();
   const [data, setData] = useState<TipoRetorno[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
 
   const fetchData = useCallback(async () => {
     if (!user) {
       setData([]);
       setIsLoading(false);
       return;
     }
 
     setIsLoading(true);
     setError(null);
 
     try {
       const { data: result, error: fetchError } = await supabase
         .from('nome_tabela')
         .select('*')
         .eq('user_id', user.id);
 
       if (fetchError) throw fetchError;
       setData(result || []);
     } catch (err) {
       console.error('Error:', err);
       setError(err instanceof Error ? err.message : 'Erro');
     } finally {
       setIsLoading(false);
     }
   }, [user, filtro]);
 
   useEffect(() => {
     fetchData();
   }, [fetchData]);
 
   return { data, isLoading, error, refetch: fetchData };
 }
 ```
 
 #### Novo Tipo
 
 1. Adicionar em `src/types/index.ts`:
 ```typescript
 export interface NovoTipo {
   id: string;
   nome: string;
   created_at: string;
   // ... campos
 }
 
 // Se for enum
 export type NovoStatus = 'ativo' | 'inativo' | 'pendente';
 ```
 
 ---
 
 ## 4. Frontend: Padrões de UI e Design System
 
 ### 4.1 Design Tokens
 
 **Arquivo**: `src/index.css`
 
 Todos os tokens estão em HSL sem a função `hsl()`:
 
 ```css
 :root {
   /* Cores base */
   --background: 210 20% 98%;
   --foreground: 215 25% 15%;
   --primary: 190 60% 35%;          /* Teal/Petrol */
   --primary-foreground: 0 0% 100%;
   
   /* Risco */
   --risk-normal: 142 70% 45%;      /* Verde */
   --risk-atencao: 45 90% 50%;      /* Amarelo */
   --risk-risco: 25 95% 53%;        /* Laranja */
   --risk-critico: 0 72% 51%;       /* Vermelho */
   
   /* Status */
   --status-success: 142 70% 45%;
   --status-warning: 45 90% 50%;
   --status-pending: 220 80% 55%;
   
   /* Prioridade */
   --priority-baixa: 210 15% 50%;
   --priority-media: 220 80% 55%;
   --priority-alta: 25 95% 53%;
   --priority-urgente: 0 72% 51%;
 }
 ```
 
 **Uso em componentes**:
 ```tsx
 // CORRETO: usar variáveis semânticas
 <div className="bg-primary text-primary-foreground" />
 <span className="text-[hsl(var(--risk-critico))]" />
 
 // ERRADO: cores hardcoded
 <div className="bg-teal-600 text-white" />
 ```
 
 ### 4.2 Classes Utilitárias Customizadas
 
 Definidas em `src/index.css` linhas 169-216:
 
 ```css
 /* Badges de risco - use diretamente */
 .risk-normal { /* verde com background */ }
 .risk-atencao { /* amarelo com background */ }
 .risk-risco { /* laranja com background */ }
 .risk-critico { /* vermelho com background */ }
 
 /* Prioridade */
 .priority-baixa, .priority-media, .priority-alta, .priority-urgente
 
 /* Cards interativos */
 .card-interactive { @apply transition-all duration-200 hover:shadow-md; }
 
 /* Stat cards */
 .stat-card { @apply rounded-lg border bg-card p-4 shadow-sm; }
 
 /* Fonte mono para dados */
 .mono { font-family: 'JetBrains Mono', monospace; }
 ```
 
 ### 4.3 Layout Padrão
 
 **Estrutura** (ver `src/components/layout/AppLayout.tsx`):
 
 ```
 ┌─────────────────────────────────────────────┐
 │ TopBar (fixed, com sync status)             │
 ├──────────┬──────────────────────────────────┤
 │          │                                  │
 │ Sidebar  │  Main Content (<Outlet />)       │
 │ (nav)    │  - container py-6 px-4-8         │
 │          │  - max-w-7xl                     │
 │          │                                  │
 └──────────┴──────────────────────────────────┘
 ```
 
 ### 4.4 Estados de UI
 
 | Estado | Componente/Padrão | Exemplo |
 |--------|-------------------|---------|
 | **Loading** | `<Loader2 className="animate-spin" />` | `src/pages/Dashboard.tsx` linha 42-47 |
 | **Erro** | Toast destructive ou inline | `src/contexts/AuthContext.tsx` linha 130-136 |
 | **Vazio** | Mensagem com ícone | `src/components/dashboard/ActivityFeed.tsx` |
 | **Offline** | Toast de warning | Implementar conforme necessidade |
 
 ### 4.5 Componentes Customizados Principais
 
 #### RiskBadge
 
 **Arquivo**: `src/components/ui/RiskBadge.tsx`
 
 ```typescript
 interface RiskBadgeProps {
   level: RiskLevel;           // 'normal' | 'atencao' | 'risco' | 'critico'
   size?: 'sm' | 'md' | 'lg';  // default: 'md'
   showDot?: boolean;          // default: true
   className?: string;
 }
 
 // Uso
 <RiskBadge level={student.current_risk_level} size="sm" />
 ```
 
 #### StatusBadge
 
 **Arquivo**: `src/components/ui/StatusBadge.tsx`
 
 ```typescript
 interface StatusBadgeProps {
   status: TaskStatus | ActionStatus;  // 'aberta' | 'em_andamento' | 'resolvida' | 'planejada' | 'concluida'
   size?: 'sm' | 'md';
   className?: string;
 }
 
 // Uso
 <StatusBadge status={task.status} />
 ```
 
 #### StatCard
 
 **Arquivo**: `src/components/ui/StatCard.tsx`
 
 ```typescript
 // Para indicadores do dashboard
 <StatCard
   title="Ações concluídas"
   value={summary.completed_actions}
   icon={<CheckCircle />}
 />
 ```
 
 ---
 
 ## 5. Formulários, Validação e Feedback
 
 ### 5.1 Padrão Atual
 
 O projeto usa majoritariamente `useState` para formulários simples. Exemplo em `src/pages/Login.tsx`:
 
 ```typescript
 const [username, setUsername] = useState('');
 const [password, setPassword] = useState('');
 const [error, setError] = useState('');
 
 const handleSubmit = async (e: React.FormEvent) => {
   e.preventDefault();
   setError('');
   
   if (!username || !password) {
     setError('Preencha todos os campos');
     return;
   }
   
   const success = await login(username, password, moodleUrl);
   if (success) navigate('/');
 };
 ```
 
 ### 5.2 Para Formulários Complexos (Recomendado)
 
 ```typescript
 import { useForm } from 'react-hook-form';
 import { zodResolver } from '@hookform/resolvers/zod';
 import * as z from 'zod';
 
 const schema = z.object({
   titulo: z.string().min(1, 'Título obrigatório'),
   descricao: z.string().optional(),
   prioridade: z.enum(['baixa', 'media', 'alta', 'urgente']),
 });
 
 type FormData = z.infer<typeof schema>;
 
 function MeuForm() {
   const form = useForm<FormData>({
     resolver: zodResolver(schema),
     defaultValues: { titulo: '', prioridade: 'media' },
   });
   
   const onSubmit = async (data: FormData) => {
     // ...
   };
   
   return (
     <Form {...form}>
       <form onSubmit={form.handleSubmit(onSubmit)}>
         {/* FormField components */}
       </form>
     </Form>
   );
 }
 ```
 
 ### 5.3 Toast Notifications
 
 **Dois sistemas disponíveis**:
 
 1. **shadcn Toast** (`src/hooks/use-toast.ts`):
 ```typescript
 import { toast } from '@/hooks/use-toast';
 
 toast({
   title: "Sucesso",
   description: "Ação realizada",
 });
 
 toast({
   title: "Erro",
   description: "Algo deu errado",
   variant: "destructive",
 });
 ```
 
 2. **Sonner** (`src/components/ui/sonner.tsx`):
 ```typescript
 import { toast } from 'sonner';
 
 toast.success('Sucesso!');
 toast.error('Erro!');
 toast.info('Informação');
 ```
 
 **Padrão do projeto**: Usar `@/hooks/use-toast` (veja `AuthContext.tsx`).
 
 ---
 
 ## 6. Dados: Supabase (Schema, RLS, Migrations, Funções)
 
 ### 6.1 Tabelas Principais
 
 | Tabela | Propósito | Isolamento |
 |--------|-----------|------------|
 | `users` | Tutores/monitores (cache do Moodle) | Por `id = auth.uid()` |
 | `courses` | Cursos (cache do Moodle) | Via `user_courses` |
 | `students` | Alunos (cache do Moodle) | Via `student_courses` → `user_courses` |
 | `user_courses` | Relação usuário ↔ curso | Por `user_id` |
 | `student_courses` | Relação aluno ↔ curso + status matrícula | Via `user_courses` |
 | `pending_tasks` | Pendências/atividades | Por `created_by_user_id` ou curso |
 | `actions` | Ações de acompanhamento | Por `user_id` |
 | `notes` | Notas/observações | Por `user_id` |
 | `risk_history` | Histórico de mudanças de risco | Por `user_id` |
 | `activity_feed` | Timeline de atividades | Por `user_id` ou curso |
 | `action_types` | Tipos de ação customizados | Por `user_id` |
 | `student_activities` | Atividades do aluno (Moodle) | Via curso |
 | `student_course_grades` | Notas totais por curso | Via curso |
 | `user_ignored_courses` | Cursos ignorados pelo usuário | Por `user_id` |
 
 ### 6.2 Campos Importantes
 
 #### students
 ```sql
 id: uuid (PK)
 moodle_user_id: text (unique)
 full_name: text
 email: text?
 avatar_url: text?
 current_risk_level: risk_level ('normal'|'atencao'|'risco'|'critico')
 risk_reasons: text[]?
 tags: text[]?
 last_access: timestamptz?
 ```
 
 #### student_courses
 ```sql
 id: uuid (PK)
 student_id: uuid (FK → students)
 course_id: uuid (FK → courses)
 enrollment_status: text ('ativo'|'suspenso'|'inativo'|'concluido')
 last_sync: timestamptz
 ```
 
 #### actions
 ```sql
 id: uuid (PK)
 student_id: uuid (FK → students)
 course_id: uuid? (FK → courses)
 user_id: uuid (FK → users)
 action_type: action_type ENUM
 description: text
 status: action_status ('planejada'|'concluida')
 scheduled_date: timestamptz?
 completed_at: timestamptz?
 ```
 
 ### 6.3 Enums do Banco
 
 ```sql
 risk_level: 'normal' | 'atencao' | 'risco' | 'critico'
 task_status: 'aberta' | 'em_andamento' | 'resolvida'
 task_priority: 'baixa' | 'media' | 'alta' | 'urgente'
 task_type: 'moodle' | 'interna'
 action_status: 'planejada' | 'concluida'
 action_type: 'contato' | 'orientacao' | 'cobranca' | 'suporte_tecnico' | 'reuniao' | 'outro'
 ```
 
 ### 6.4 Políticas RLS
 
 **Padrão**: `auth.uid() IS NULL OR <condição>` para permitir Edge Functions (service role).
 
 Exemplo típico:
 ```sql
 CREATE POLICY "Users can view own actions"
 ON public.actions
 FOR SELECT
 USING ((user_id = auth.uid()) OR (auth.uid() IS NULL));
 ```
 
 **Para tabelas via relacionamento** (students, courses):
 ```sql
 CREATE POLICY "Users can view students in their courses"
 ON public.students
 FOR SELECT
 USING (
   (auth.uid() IS NULL) OR 
   (EXISTS (
     SELECT 1 FROM user_courses uc
     JOIN student_courses sc ON sc.course_id = uc.course_id
     WHERE uc.user_id = auth.uid() AND sc.student_id = students.id
   ))
 );
 ```
 
 ### 6.5 Funções de Banco
 
 | Função | Propósito |
 |--------|-----------|
 | `calculate_student_risk(p_student_id)` | Calcula risco baseado em atividades/acesso |
 | `update_student_risk(p_student_id)` | Atualiza o risco calculado no registro |
 | `update_course_students_risk(p_course_id)` | Atualiza risco de todos alunos do curso |
 | `user_has_course_access(p_user_id, p_course_id)` | Verifica acesso a curso |
 | `user_has_student_access(p_user_id, p_student_id)` | Verifica acesso a aluno |
 
 **Exemplo de chamada**:
 ```typescript
 const { data, error } = await supabase.rpc('calculate_student_risk', {
   p_student_id: studentId
 });
 ```
 
 ### 6.6 Migrations
 
 **IMPORTANTE**: As migrations estão em `supabase/migrations/` e são **read-only**. Gerenciadas pelo Lovable Cloud.
 
 Para alterações de schema localmente, usar Supabase CLI:
 ```bash
 supabase migration new nome_da_migration
 # Editar supabase/migrations/<timestamp>_nome_da_migration.sql
 supabase db push
 ```
 
 ---
 
 ## 7. Integração Moodle via Edge Function
 
 ### 7.1 Localização
 
 **Arquivo**: `supabase/functions/moodle-api/index.ts`
 
 ### 7.2 Ações Suportadas
 
 | Action | Payload | Retorno |
 |--------|---------|---------|
 | `login` | `{ moodleUrl, username, password, service? }` | `{ user, moodleToken, moodleUserId }` |
 | `sync_courses` | `{ moodleUrl, token, userId }` | `{ courses: Course[] }` |
 | `sync_students` | `{ moodleUrl, token, courseId }` | `{ students: Student[] }` |
 | `sync_activities` | `{ moodleUrl, token, courseId }` | `{ activitiesCount }` |
 | `sync_grades` | `{ moodleUrl, token, courseId }` | `{ gradesCount }` |
 
 ### 7.3 Como Invocar do Frontend
 
 ```typescript
 import { supabase } from '@/integrations/supabase/client';
 
 const { data, error } = await supabase.functions.invoke('moodle-api', {
   body: {
     action: 'sync_students',
     moodleUrl: 'https://moodle.exemplo.com',
     token: 'abc123...',
     courseId: 12345,
   },
 });
 
 if (error) {
   console.error('Edge function error:', error);
   return;
 }
 
 if (data.error) {
   console.error('Moodle error:', data.error);
   return;
 }
 
 // Sucesso
 const students = data.students;
 ```
 
 ### 7.4 CORS Headers (Obrigatórios)
 
 Ver `supabase/functions/moodle-api/index.ts` linhas 3-10:
 
 ```typescript
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
   'Access-Control-Allow-Methods': 'POST, OPTIONS',
 };
 
 // SEMPRE tratar OPTIONS
 if (req.method === 'OPTIONS') {
   return new Response('ok', { headers: corsHeaders });
 }
 ```
 
 ### 7.5 APIs do Moodle Utilizadas
 
 | Função Moodle | Uso |
 |---------------|-----|
 | `/login/token.php` | Autenticação por credenciais |
 | `core_webservice_get_site_info` | Info do usuário logado |
 | `core_enrol_get_users_courses` | Cursos do usuário |
 | `core_course_get_categories` | Hierarquia de categorias |
 | `core_enrol_get_enrolled_users` | Alunos matriculados em curso |
 | `gradereport_user_get_grade_items` | Notas/atividades do aluno |
 
 ---
 
 ## 8. Estado e Cache: React Query + Context
 
 ### 8.1 O que vai onde
 
 | Tipo de Estado | Onde | Exemplo |
 |----------------|------|---------|
 | **Sessão/Auth** | Context | `AuthContext.tsx` |
 | **Dados do servidor** | React Query (via hooks) | `useStudentsData.ts` |
 | **UI local** | useState | Filtros, modais, forms |
 | **Dados cacheados** | React Query automático | - |
 
 ### 8.2 Padrão de QueryClient
 
 Ver `src/App.tsx` linha 22:
 ```typescript
 const queryClient = new QueryClient();
 ```
 
 **Nota**: O projeto usa hooks customizados com `useState` + `useEffect` em vez de `useQuery` diretamente. Isso funciona, mas para features novas, considerar usar `useQuery`:
 
 ```typescript
 import { useQuery } from '@tanstack/react-query';
 
 export function useNomeData() {
   return useQuery({
     queryKey: ['nome', filtro],
     queryFn: async () => {
       const { data, error } = await supabase.from('tabela').select('*');
       if (error) throw error;
       return data;
     },
     staleTime: 5 * 60 * 1000, // 5 minutos
   });
 }
 ```
 
 ### 8.3 Invalidação de Cache
 
 Após sync ou mutação, chamar `refetch()` do hook:
 
 ```typescript
 const { students, refetch } = useStudentsData();
 
 // Após criar/editar algo
 await criarAlgo();
 refetch();
 ```
 
 ---
 
 ## 9. Sincronização: Fluxo Ponta a Ponta
 
 ### 9.1 Diagrama do Fluxo
 
 ```
 1. Usuário clica "Sincronizar" (TopBar)
    ↓
 2. AuthContext.syncData() é chamado
    ↓
 3. Se há cursos cacheados → abre CourseSelectorDialog
    Se não → syncSelectedCourses('all')
    ↓
 4. Abre SyncProgressDialog com 4 steps:
    [courses] → [students] → [activities] → [grades]
    ↓
 5. Para cada step, chama Edge Function moodle-api:
    - sync_courses: busca cursos, upsert em courses, user_courses
    - sync_students: busca alunos por curso, upsert em students, student_courses
    - sync_activities: busca notas/atividades, upsert em student_activities
    - sync_grades: busca nota total, upsert em student_course_grades
    ↓
 6. Edge Function usa SERVICE_ROLE_KEY para bypass de RLS
    ↓
 7. Após cada step, atualiza progresso no dialog
    ↓
 8. Ao finalizar:
    - Atualiza last_sync do usuário
    - Exibe summary no dialog
    - Chama toast de sucesso/erro
    ↓
 9. Componentes fazem refetch() para atualizar dados
 ```
 
 ### 9.2 Arquivos Envolvidos
 
 | Responsabilidade | Arquivo |
 |------------------|---------|
 | Trigger do sync | `src/components/layout/TopBar.tsx` |
 | Lógica principal | `src/contexts/AuthContext.tsx` (syncSelectedCourses) |
 | Seletor de cursos | `src/components/sync/CourseSelectorDialog.tsx` |
 | Progress dialog | `src/components/sync/SyncProgressDialog.tsx` |
 | Edge Function | `supabase/functions/moodle-api/index.ts` |
 
 ### 9.3 Tratamento de Erros
 
 - Timeout por curso: 20-25 segundos (linha 391, 446, 496 de AuthContext)
 - Batches pequenos para evitar timeout: 2-3 cursos por vez
 - Erros individuais não quebram sync geral
 - Contadores de erro exibidos no dialog
 
 ---
 
 ## 10. Qualidade, Lint, Testes e Padrões
 
 ### 10.1 Comandos
 
 ```bash
 npm run lint        # ESLint
 npm run build       # Type check + build
 npm run test        # Vitest (se configurado)
 ```
 
 ### 10.2 ESLint Config
 
 Ver `eslint.config.js` para regras.
 
 ### 10.3 Testes
 
 **Estrutura**: `src/test/`
 - `setup.ts`: Configuração do Vitest
 - `example.test.ts`: Exemplo de teste
 
 **Config**: `vitest.config.ts`
 
 ### 10.4 Anti-Patterns a Evitar
 
 | ❌ Não fazer | ✅ Fazer |
 |--------------|----------|
 | Editar `src/integrations/supabase/client.ts` | Usar como está |
 | Editar `src/integrations/supabase/types.ts` | Tipos são auto-gerados |
 | Hardcode de cores | Usar variáveis CSS |
 | Fetch direto em componentes | Criar hook dedicado |
 | Token Moodle no localStorage | Gerenciado por AuthContext |
 | console.log em produção | Remover ou usar logger |
 
 ---
 
 ## 11. Roadmap, Pendências e Dívida Técnica
 
 ### 11.1 Funcionalidades Incompletas
 
 - [ ] CRUD completo de pendências no perfil do aluno
 - [ ] CRUD completo de ações no perfil do aluno
 - [ ] CRUD completo de notas/observações no perfil do aluno
 - [ ] Edição de tags do aluno
 - [ ] Alteração manual de risco com histórico
 
 ### 11.2 Próximos Passos Recomendados
 
 1. Implementar formulários com React Hook Form + Zod
 2. Adicionar validação de sessão Moodle (token expirado)
 3. Implementar busca global de alunos
 4. Adicionar relatórios/exportação CSV
 5. Notificações de alunos em risco
 
 ### 11.3 Dívida Técnica
 
 | Item | Prioridade | Descrição |
 |------|------------|-----------|
 | Hooks sem React Query | Média | Migrar para `useQuery` para melhor cache |
 | Tipagem `as any` | Baixa | Melhorar inferência de tipos do Supabase |
 | Mock data | Baixa | Remover `mock-data.ts` quando não mais necessário |
 | Testes | Alta | Adicionar testes unitários e de integração |
 
 ---
 
 ## 12. Golden Rules
 
 > **Se você seguir só esta seção, você não quebra o padrão.**
 
 1. **NUNCA editar** `src/integrations/supabase/client.ts` ou `types.ts` — são auto-gerados.
 
 2. **NUNCA armazenar token Moodle** no código ou expor no client. O token fica apenas em `AuthContext` e `localStorage` (via `STORAGE_KEY`).
 
 3. **SEMPRE usar variáveis CSS** para cores (`--primary`, `--risk-*`, etc). Nunca hardcode como `bg-red-500`.
 
 4. **SEMPRE respeitar RLS** — queries do frontend devem funcionar com `auth.uid()`. Edge Functions usam `SERVICE_ROLE_KEY`.
 
 5. **SEMPRE criar hook** para fetch de dados. Componentes não fazem `supabase.from()` diretamente.
 
 6. **SEMPRE tipar** retornos do Supabase com interfaces de `src/types/index.ts`.
 
 7. **SEMPRE tratar erros** com try/catch e exibir toast ou mensagem inline.
 
 8. **SEMPRE incluir estado de loading** (Loader2 + animate-spin) em operações assíncronas.
 
 9. **SEMPRE adicionar CORS headers** em Edge Functions e tratar `OPTIONS`.
 
 10. **SEMPRE testar no console** as queries Supabase antes de integrar — verificar se RLS permite.
 
 ---
 
 ## Checklist Final
 
 - [x] Setup local completo
 - [x] Estrutura de pastas + convenções
 - [x] Padrões de UI e forms
 - [x] Supabase schema + RLS + migrations
 - [x] Edge functions e contrato de payload
 - [x] Fluxo de sync completo
 - [x] Exemplos reais com caminhos de arquivos
 - [x] "não aplicável" quando necessário (ex: RHF+Zod não usado amplamente ainda)
 
 ---
 
 **Documento gerado automaticamente para handoff de desenvolvimento.**  
 **Manter atualizado conforme novas features forem implementadas.**
