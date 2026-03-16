# Painel Administrativo Claris — Documentação Técnica

## Visão Geral

O painel administrativo da Claris oferece:

- **Gestão de configurações globais** da aplicação
- **Controle de acesso baseado em papéis (RBAC)**
- **Métricas de uso** da plataforma
- **Logs de erro** estruturados com triagem
- **Canal de suporte** para usuários
- **Histórico de conversas** com a Claris IA

Acesse em: `/admin` (somente administradores)

---

## Arquitetura

```
src/
├── components/
│   ├── admin/
│   │   ├── AdminRoute.tsx      # Guarda de rota para /admin
│   │   ├── AdminLayout.tsx     # Layout com sidebar administrativa
│   │   └── AdminSidebar.tsx    # Navegação lateral do admin
│   └── support/
│       └── SupportButton.tsx   # Botão de suporte (visível a todos)
├── hooks/
│   ├── usePermissions.ts       # Hook de verificação de papéis/permissões
│   ├── useTrackEvent.ts        # Hook de rastreamento de eventos de uso
│   └── useErrorLog.ts          # Hook de registro de erros
└── pages/
    └── admin/
        ├── AdminDashboard.tsx       # Painel com indicadores gerais
        ├── AdminConfiguracoes.tsx   # Configurações globais (Moodle, risco, Claris IA)
        ├── AdminUsuarios.tsx        # Gestão de papéis e permissões
        ├── AdminMetricas.tsx        # Métricas de uso com gráficos
        ├── AdminLogsErros.tsx       # Logs de erro com triagem
        ├── AdminSuporte.tsx         # Triagem de tickets de suporte
        └── AdminConversasClaris.tsx # Histórico de conversas da Claris IA
```

---

## Modelo de Dados

### `admin_user_roles`

Controla quem tem acesso ao painel administrativo.

| Coluna       | Tipo       | Descrição                              |
|--------------|------------|----------------------------------------|
| id           | UUID       | Identificador único                    |
| user_id      | UUID       | Usuário (referência a `users`)         |
| role         | TEXT       | `admin` \| `support` \| `analyst`      |
| permissions  | JSONB      | Array de permissões concedidas         |
| granted_by   | UUID       | Usuário que concedeu o papel           |
| created_at   | TIMESTAMPTZ| Data de criação                        |
| updated_at   | TIMESTAMPTZ| Última atualização                     |

**RLS:** Usuários veem apenas seu próprio registro; admins veem todos.

### `app_usage_events`

Registra eventos de uso da plataforma.

| Coluna      | Tipo       | Descrição                              |
|-------------|------------|----------------------------------------|
| id          | UUID       | Identificador único                    |
| user_id     | UUID       | Usuário que gerou o evento             |
| event_type  | TEXT       | Tipo do evento (ex.: `page_view`)      |
| route       | TEXT       | Rota onde o evento ocorreu             |
| resource    | TEXT       | Recurso envolvido (opcional)           |
| metadata    | JSONB      | Dados adicionais do evento             |
| created_at  | TIMESTAMPTZ| Data/hora do evento                    |

**Eventos suportados:**
- `page_view` — visualização de página
- `login` / `logout`
- `sync_start` / `sync_finish` / `sync_error`
- `send_message`
- `claris_prompt` / `claris_response`

**RLS:** Usuários inserem seus próprios eventos; somente admins leem.

### `app_error_logs`

Armazena erros estruturados da aplicação.

| Coluna      | Tipo       | Descrição                                          |
|-------------|------------|----------------------------------------------------|
| id          | UUID       | Identificador único                                |
| user_id     | UUID       | Usuário que gerou o erro (pode ser nulo)           |
| severity    | TEXT       | `info` \| `warning` \| `error` \| `critical`       |
| category    | TEXT       | `ui` \| `import` \| `integration` \| `edge_function` \| `ai` \| `auth` \| `other` |
| message     | TEXT       | Mensagem do erro                                   |
| payload     | JSONB      | Dados técnicos sanitizados                         |
| context     | JSONB      | Contexto: rota, userAgent, etc.                    |
| resolved    | BOOLEAN    | Se o erro foi resolvido                            |
| resolved_at | TIMESTAMPTZ| Data de resolução                                  |
| resolved_by | UUID       | Admin que resolveu                                 |

**RLS:** Usuários inserem seus erros; somente admins leem e atualizam.

### `support_tickets`

Tickets de suporte abertos pelos usuários.

| Coluna      | Tipo       | Descrição                                   |
|-------------|------------|---------------------------------------------|
| id          | UUID       | Identificador único                         |
| user_id     | UUID       | Usuário que abriu o ticket                  |
| type        | TEXT       | `problema` \| `sugestao` \| `duvida` \| `outro` |
| title       | TEXT       | Título do ticket                            |
| description | TEXT       | Descrição detalhada                         |
| route       | TEXT       | Rota onde o ticket foi aberto               |
| context     | JSONB      | Contexto técnico (userAgent, URL, etc.)     |
| status      | TEXT       | `aberto` \| `em_andamento` \| `resolvido` \| `fechado` |
| priority    | TEXT       | `baixa` \| `normal` \| `alta` \| `critica`  |
| assigned_to | UUID       | Admin responsável pelo atendimento          |
| admin_notes | TEXT       | Notas internas do admin                     |
| resolved_at | TIMESTAMPTZ| Data de resolução                           |

**RLS:** Usuários veem e inserem seus tickets; admins leem e atualizam todos.

### `claris_conversations` (existente)

Já existia. Armazena conversas com a Claris IA por usuário.

| Coluna             | Tipo        | Descrição                         |
|--------------------|-------------|-----------------------------------|
| id                 | UUID        | Identificador único               |
| user_id            | UUID        | Usuário da conversa               |
| title              | TEXT        | Título da conversa                |
| messages           | JSONB       | Array de mensagens `{role, content}` |
| last_context_route | TEXT        | Última rota visitada durante a conversa |

---

## RBAC — Controle de Acesso por Papéis

### Papéis disponíveis

| Papel     | Permissões                              |
|-----------|-----------------------------------------|
| `admin`   | Acesso total ao painel administrativo   |
| `support` | Acesso a tickets de suporte             |
| `analyst` | Acesso a métricas e logs                |

### Fallback hardcoded

A função `is_application_admin()` mantém compatibilidade retroativa:

```sql
-- Verifica primeiro na tabela admin_user_roles
-- Se não encontrar, usa o check hardcoded legado
SELECT EXISTS (
  SELECT 1 FROM admin_user_roles WHERE user_id = auth.uid() AND role = 'admin'
)
OR EXISTS (
  SELECT 1 FROM users WHERE id = auth.uid()
    AND (moodle_username = '04112637225' OR email = 'julioalves@fieg.com.br')
);
```

### Hook de permissões

```typescript
import { usePermissions } from '@/hooks/usePermissions';

const { isAdmin, role, permissions, canAccessAdminSection } = usePermissions();

// Verifica acesso a uma seção específica
if (canAccessAdminSection('support')) { ... }
```

---

## Rotas Administrativas

| Rota                       | Componente              | Descrição                        |
|----------------------------|-------------------------|----------------------------------|
| `/admin`                   | `AdminDashboard`        | Painel com indicadores gerais    |
| `/admin/configuracoes`     | `AdminConfiguracoes`    | Configurações globais            |
| `/admin/usuarios`          | `AdminUsuarios`         | Gestão de papéis e permissões    |
| `/admin/metricas`          | `AdminMetricas`         | Métricas de uso com gráficos     |
| `/admin/logs-erros`        | `AdminLogsErros`        | Logs de erro com triagem         |
| `/admin/suporte`           | `AdminSuporte`          | Triagem de tickets de suporte    |
| `/admin/conversas-claris`  | `AdminConversasClaris`  | Histórico de conversas com a IA  |

Todas as rotas são protegidas pelo `AdminRoute`, que redireciona para `/` caso o usuário não seja admin.

---

## Observabilidade

### Rastrear eventos de uso

```typescript
import { useTrackEvent } from '@/hooks/useTrackEvent';

const { track } = useTrackEvent();

// Registrar um evento
await track('page_view', { metadata: { section: 'dashboard' } });
await track('send_message', { resource: 'course-123' });
```

### Registrar erros

```typescript
import { useErrorLog } from '@/hooks/useErrorLog';

const { logError } = useErrorLog();

// Registrar um erro
await logError('Falha ao sincronizar curso', {
  severity: 'error',
  category: 'integration',
  payload: { courseId: 'c-123', errorCode: 500 },
});
```

---

## Canal de Suporte

O `SupportButton` é exibido na `TopBar` para todos os usuários autenticados. Ao clicar:

1. Um modal é exibido com campos: tipo, título, descrição
2. A rota atual e o contexto técnico são preenchidos automaticamente
3. O ticket é salvo em `support_tickets`
4. O admin pode visualizar, filtrar e atualizar tickets em `/admin/suporte`

---

## Plano de Rollout

### Fase 1 (já implementado)
- [x] Migrations para `admin_user_roles`, `app_usage_events`, `app_error_logs`, `support_tickets`
- [x] Atualização de `is_application_admin()` com RBAC + fallback
- [x] Hooks `usePermissions`, `useTrackEvent`, `useErrorLog`
- [x] `AdminRoute`, `AdminLayout`, `AdminSidebar`
- [x] Todas as páginas admin
- [x] `SupportButton` na TopBar
- [x] Botão de acesso ao admin na TopBar para administradores

### Fase 2 (evolução futura)
- [ ] Integrar `useTrackEvent` nas ações principais do app (sync, mensagens, etc.)
- [ ] Integrar `useErrorLog` nos blocos catch das integrações e edge functions
- [ ] Adicionar filtros de data e usuário nas métricas
- [ ] Notificações em tempo real para novos tickets
- [ ] Exportação de logs e métricas para CSV/Excel
- [ ] Dashboard com gráficos de tendência ao longo do tempo
- [ ] Gestão de feature flags no painel admin

---

## Segurança

- Todas as novas tabelas têm **RLS habilitado**
- Leituras administrativas requerem `is_application_admin()`
- Inserções de eventos e erros são abertas para o próprio usuário
- A função `is_application_admin()` usa `SECURITY DEFINER` e `search_path` fixo para evitar SQL injection
- Payloads de erro devem ser sanitizados antes de persistir (evitar senhas/tokens)
