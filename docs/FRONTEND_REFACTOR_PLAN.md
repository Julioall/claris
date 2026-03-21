# Frontend Refactor Plan

Atualizado em `2026-03-21`.

Este documento e o plano operacional da refatoracao do frontend. Ele deve ser lido antes de continuar a modularizacao em outra sessao ou com outra IA.

Para o ciclo seguinte, focado na fronteira de dados com Supabase, consultar [SUPABASE_CONSOLIDATION_PLAN.md](./SUPABASE_CONSOLIDATION_PLAN.md).

## Objetivo

Levar o frontend de uma organizacao por pastas tecnicas para uma organizacao por dominio, com:

- `src/app/` para shell global
- `src/features/<dominio>/` para regra de negocio, hooks, pages, repository e tipos
- `src/components/ui/` apenas para componentes realmente genericos
- contratos TypeScript devem viver no slice do dominio; evitar barrels globais

## Como Retomar

1. ler [FRONTEND_MODULES.md](./FRONTEND_MODULES.md)
2. ler este arquivo inteiro
3. rodar `git status --short`
4. escolher a proxima fase com status `planned`; se nao houver nenhuma, tratar o trabalho como manutencao pos-refactor
5. executar a fase sem recriar wrappers removidos
6. atualizar este arquivo ao final da fase
7. validar com `npm.cmd run lint` e `npm.cmd test`

## Regras de Execucao

- nao adicionar nova regra de negocio em `src/pages/`, `src/hooks/`, `src/services/` ou `src/lib/` se o dominio ja tiver slice em `src/features/`
- preferir imports diretos do slice, nao wrappers de compatibilidade
- remover wrapper legado quando nao houver mais referencia de runtime
- manter `src/hooks/` apenas para hooks transversais ou dominios ainda nao migrados
- manter contratos novos dentro do slice; evitar compatibilidades globais desnecessarias
- depois de cada fase, atualizar este documento com status, observacoes e validacao

## Definicao de Conclusao por Fase

Uma fase so e considerada concluida quando:

- a page principal do dominio mora em `src/features/<dominio>/pages`
- os hooks do dominio moram em `src/features/<dominio>/hooks`
- os tipos do dominio moram em `src/features/<dominio>/types.ts` quando fizer sentido
- o roteamento ou os consumidores principais importam direto do slice
- testes foram atualizados
- `lint` e `test` passam

## Fases Concluidas

### Fase 0: Shell Global

Status: `completed`

Escopo concluido:

- `src/App.tsx` ficou fino
- providers globais foram para `src/app/providers/`
- rotas foram para `src/app/routes/`
- lazy loading foi centralizado em `src/app/routes/lazy-pages.ts`

### Fase 1: Auth Slice

Status: `completed`

Escopo concluido:

- `AuthContext` virou composition root
- sessao Moodle, sync, risco e notificacoes foram extraidos para `src/features/auth/`
- `useMoodleSession()` passou a ser o acesso dedicado a credenciais Moodle

Observacao:

- o rename estrutural do auth ficou para fase futura

### Fase 2: Dominios Base

Status: `completed`

Escopo concluido:

- `students` migrado para `src/features/students/`
- `tasks` migrado para `src/features/tasks/`
- `courses` migrado para `src/features/courses/`
- `agenda` migrado para `src/features/agenda/`

Resultado:

- hooks, repositories e pages desses dominios ja estao no slice
- roteamento ja aponta direto para os slices migrados

### Fase 3: Tipos por Dominio

Status: `completed`

Escopo concluido:

- tipos de `auth`, `courses`, `students`, `tasks`, `agenda` e `dashboard` foram movidos para os slices
- contratos principais ja sairam dos barrels globais de tipos

### Fase 4: Remocao de Wrappers Legados dos Dominios Migrados

Status: `completed`

Escopo concluido:

- removidos wrappers de `src/pages/` para `MyCourses`, `Schools`, `CoursePanel`, `Students`, `StudentProfile`, `Tarefas` e `Agenda`
- removidos wrappers de `src/hooks/` para `useCoursesData`, `useAllCoursesData`, `useCoursePanel`, `useStudentsData`, `useStudentProfile`, `useTasks` e `useCalendarEvents`
- removidos wrappers em `src/services/calendar.service.ts` e `src/lib/agenda.ts`

### Fase 5: Dashboard

Status: `completed`

Escopo concluido:

- `DashboardPage` foi movida para `src/features/dashboard/pages/`
- `useDashboardData` foi movido para `src/features/dashboard/hooks/`
- componentes especificos do dominio foram movidos para `src/features/dashboard/components/`
- acesso a dados foi extraido para `src/features/dashboard/api/dashboard.repository.ts`
- query keys do dominio foram adicionadas em `src/features/dashboard/query-keys.ts`
- rota lazy e testes passaram a importar o slice diretamente

Observacao:

- `src/components/dashboard/ClarisSuggestions.tsx` permaneceu fora desta fase e sera tratado na `Fase 7: Claris`

### Fase 6: Admin

Status: `completed`

Escopo concluido:

- pages administrativas foram movidas para `src/features/admin/pages/`
- testes administrativos passaram a importar o slice diretamente
- lazy routes administrativas passaram a apontar para `src/features/admin/pages/`
- `AdminRoute` e `AdminLayout` foram movidos para `src/app/routes/admin/` por serem parte do shell de roteamento

Observacoes:

- `usePermissions` permaneceu em `src/hooks/` porque ainda e usado no shell (`AppSidebar`, `FloatingClarisChat` e guardas de rota)
- `useErrorLog` permaneceu em `src/hooks/` porque ainda e consumido fora do admin

## Fases Planejadas

### Fase 7: Claris

Status: `completed`

Escopo concluido:

- `ClarisPage` foi movida para `src/features/claris/pages/`
- `useChat` e `useClarisSuggestions` foram movidos para `src/features/claris/hooks/`
- `ChatWindow`, `FloatingClarisChat` e `ClarisSuggestions` foram movidos para `src/features/claris/components/`
- layout global, dashboard, rotas lazy e consumidores de chat passaram a montar o slice diretamente
- testes do chat, floating chat, dashboard, layout, mensagens, perfil do aluno e roteamento foram atualizados para os novos imports
- wrappers antigos de `src/pages/`, `src/hooks/`, `src/components/chat/`, `src/components/layout/FloatingClarisChat.tsx` e `src/components/dashboard/ClarisSuggestions.tsx` foram removidos

Observacoes:

- `src/lib/claris-settings.ts` permaneceu compartilhado porque ainda e usado fora do slice, inclusive no admin
- `src/components/ui/claris-logo.tsx` permaneceu em `src/components/ui/` por ser primitive visual reutilizavel
- esta fase continua acoplada aos contratos consumidos pelas edge functions, entao mudancas futuras devem manter cuidado com compatibilidade

### Fase 8: Comunicacao e Operacao

Status: `completed`

Escopo concluido:

- `MessagesPage` foi movida para `src/features/messages/pages/`
- `BulkSendTab`, `MessageTemplatesTab`, `DynamicVariableInput` e helpers visuais de mensagens foram movidos para `src/features/messages/components/`
- `WhatsAppPage` foi movida para `src/features/whatsapp/pages/`
- `AutomacoesPage` e seus componentes especificos foram movidos para `src/features/automations/`
- `MyServicesPage` foi movida para `src/features/services/pages/`
- rotas lazy e testes passaram a importar os slices diretamente
- wrappers antigos de `src/pages/`, `src/components/messages/` e `src/components/automacoes/` foram removidos

Observacoes:

- a fase foi fechada em quatro slices separados (`messages`, `whatsapp`, `automations` e `services`) para evitar misturar mensageria Moodle, conversas via Evolution e operacao de servicos externos no mesmo dominio
- `AutomacoesPage` continua compondo tabs vindas de `messages` e `automations`, funcionando como hub sem voltar a concentrar implementacao tecnica fora dos slices

### Fase 9: Settings e Reports

Status: `completed`

Escopo concluido:

- `SettingsPage` foi movida para `src/features/settings/pages/`
- `ThemeCard`, `DataCleanupCard` e `GradeDebugCard` foram movidos para `src/features/settings/components/`
- a configuracao visual compartilhada foi extraida para `src/features/settings/lib/color-theme.ts`
- `ReportsPage` foi movida para `src/features/reports/pages/`
- `ColorThemeApplier`, rotas lazy e testes passaram a consumir os slices diretamente
- wrappers antigos de `src/pages/Settings.tsx`, `src/pages/Reports.tsx` e `src/components/settings/` foram removidos

Observacoes:

- o helper de tema ficou em `features/settings/lib/` porque o shell global ainda precisa aplicar a paleta antes do carregamento das telas
- os helpers internos de relatorios permanecem no arquivo da page por enquanto; a fase fechou a reorganizacao estrutural sem alterar o comportamento do export Excel

### Fase 10: Auth Rename e Fechamento Estrutural

Status: `completed`

Escopo concluido:

- o auth foi consolidado em `src/features/auth/`
- `AuthContext`, hooks utilitarios, componentes que dependem da sessao Moodle e testes passaram a importar o novo caminho
- a documentacao operacional e arquitetural foi atualizada para a nova convencao

Observacoes:

- `src/features/auth/types.ts` foi preservado no root do slice e agora convive com `application/`, `context/`, `domain/`, `hooks/` e `infrastructure/`
- o rename foi mantido estritamente estrutural, sem alterar comportamento funcional do login, sessao, sync ou recalculo de risco

### Fase 11: Limpeza Final e Endurecimento

Status: `completed`

Escopo concluido:

- `src/features/tasks/api/tasks.service.ts` passou a concentrar o service de tarefas, removendo o remanescente de `src/services/`
- `useStudentHistory` foi movido para `src/features/students/hooks/`, eliminando o ultimo hook de dominio que ainda estava em `src/hooks/`
- `Index.tsx`, `Login.tsx` e `NotFound.tsx` foram mantidos em `src/pages/` como pages de shell publico
- o barrel global `src/types/index.ts` e seu teste foram removidos; novos contratos devem continuar slice-local
- `typecheck` foi adicionado em `package.json` e no pipeline de CI com `tsc --noEmit`

Observacoes:

- `src/hooks/` ficou reservado a hooks transversais ou ainda ligados ao shell, como `use-toast`, `use-mobile`, `useTrackEvent`, `usePermissions`, `useMoodleApi` e `useErrorLog`
- a etapa fechou a modularizacao estrutural sem ativar ainda flags mais agressivas de TypeScript

## O Que Pode Permanecer Fora de Features

Estes itens podem permanecer fora de `src/features/` mesmo ao final:

- `src/app/**/*`
- `src/components/ui/**/*`
- hooks realmente transversais como `use-toast`, `use-mobile` e possivelmente `useTrackEvent`
- `Login`, `Index` e `NotFound` se continuarem sendo entendidos como app shell e nao dominio

## Debitos Abertos Para Nao Esquecer

- warnings antigos de React Router future flags nos testes
- avisos de acessibilidade em dialogs de alguns testes
- documentacao historica antiga em `docs/tasks-agenda-rebuild.md` e `docs/tasks-refactor-cleanup.md` pode ficar defasada em relacao ao estado atual
- flags mais agressivas de TypeScript (`strictNullChecks`, `noImplicitAny`, `noUnusedLocals` e depois `strict`) seguem como endurecimento futuro, separado do refactor estrutural

## Proxima Fase Recomendada

Nao ha nova fase estrutural planejada neste ciclo.

Motivo:

- os slices principais ja estao alinhados na convencao final de `features/`
- `src/pages/`, `src/hooks/`, `src/services/` e o antigo barrel global de tipos ficaram reduzidos ao papel esperado no estado final
- o trabalho seguinte passa a ser manutencao incremental: warnings de teste, endurecimento de TypeScript e atualizacao de documentacao historica quando fizer sentido

Proximo plano operacional:

- consolidacao da fronteira de dados entre frontend e Supabase em [SUPABASE_CONSOLIDATION_PLAN.md](./SUPABASE_CONSOLIDATION_PLAN.md)

## Ao Concluir Uma Fase

Sempre atualizar:

- o status da fase neste arquivo
- a secao `Estado atual` em [FRONTEND_MODULES.md](./FRONTEND_MODULES.md)
- qualquer instrucao operacional em [../.github/copilot-instructions.md](../.github/copilot-instructions.md) se a convencao mudar
