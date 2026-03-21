# Frontend Refactor Plan

Atualizado em `2026-03-21`.

Este documento e o plano operacional da refatoracao do frontend. Ele deve ser lido antes de continuar a modularizacao em outra sessao ou com outra IA.

## Objetivo

Levar o frontend de uma organizacao por pastas tecnicas para uma organizacao por dominio, com:

- `src/app/` para shell global
- `src/features/<dominio>/` para regra de negocio, hooks, pages, repository e tipos
- `src/components/ui/` apenas para componentes realmente genericos
- `src/types/index.ts` apenas como barrel de compatibilidade temporaria

## Como Retomar

1. ler [FRONTEND_MODULES.md](./FRONTEND_MODULES.md)
2. ler este arquivo inteiro
3. rodar `git status --short`
4. escolher a proxima fase com status `planned`
5. executar a fase sem recriar wrappers removidos
6. atualizar este arquivo ao final da fase
7. validar com `npm.cmd run lint` e `npm.cmd test`

## Regras de Execucao

- nao adicionar nova regra de negocio em `src/pages/`, `src/hooks/`, `src/services/` ou `src/lib/` se o dominio ja tiver slice em `src/features/`
- preferir imports diretos do slice, nao wrappers de compatibilidade
- remover wrapper legado quando nao houver mais referencia de runtime
- manter `src/hooks/` apenas para hooks transversais ou dominios ainda nao migrados
- manter `src/types/index.ts` apenas como compatibilidade; novos contratos devem nascer no slice
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
- sessao Moodle, sync, risco e notificacoes foram extraidos para `src/modules/auth/`
- `useMoodleSession()` passou a ser o acesso dedicado a credenciais Moodle

Observacao:

- a renomeacao de `src/modules/auth/` para `src/features/auth/` ficou para fase futura

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
- `src/types/index.ts` virou barrel de compatibilidade
- imports de runtime principais sairam de `@/types`

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

## Fases Planejadas

### Fase 6: Admin

Status: `planned`

Objetivo:

- consolidar o dominio administrativo em `src/features/admin/`

Arquivos alvo:

- `src/pages/admin/*`
- `src/hooks/useErrorLog.ts`
- `src/hooks/usePermissions.ts`
- `src/components/admin/*`
- componentes e helpers fortemente ligados a configuracao administrativa

Estrutura alvo:

```text
src/features/admin/
  components/
  hooks/
  pages/
  types.ts
```

Tarefas:

- mover pages administrativas para o slice
- mover hooks de erro/permissao se eles forem dominio admin e nao transversais
- revisar se `AdminRoute` e `AdminLayout` ficam em `app/` ou no slice
- atualizar `admin-routes.tsx`
- atualizar testes admin

Observacao:

- se `AdminRoute` for entendido como regra global de roteamento, ele pode permanecer fora do slice

### Fase 7: Claris

Status: `planned`

Objetivo:

- consolidar experiencia de chat/assistente em `src/features/claris/`

Arquivos alvo:

- `src/pages/Claris.tsx`
- `src/hooks/useChat.ts`
- `src/hooks/useClarisSuggestions.ts`
- `src/components/chat/*`
- `src/components/layout/FloatingClarisChat.tsx`
- `src/components/dashboard/ClarisSuggestions.tsx`
- libs e contratos relacionados a payload/loop/chat

Estrutura alvo:

```text
src/features/claris/
  components/
  hooks/
  pages/
  lib/
  types.ts
```

Tarefas:

- separar chat de pagina, chat flutuante e sugestoes proativas como partes do mesmo dominio
- definir o que fica no slice e o que fica no layout global apenas como ponto de montagem
- atualizar testes do chat e do floating chat

Observacao:

- esta fase cruza frontend e contratos consumidos pelas edge functions; mudar com cuidado

### Fase 8: Comunicacao e Operacao

Status: `planned`

Objetivo:

- modularizar as areas de mensagens e operacao que hoje ainda estao espalhadas

Arquivos alvo:

- `src/pages/Messages.tsx`
- `src/pages/WhatsApp.tsx`
- `src/pages/Automacoes.tsx`
- `src/pages/MeusServicos.tsx`
- `src/components/messages/*`

Possiveis slices:

- `src/features/messages/`
- `src/features/whatsapp/`
- `src/features/operations/` ou `src/features/services/`

Tarefas:

- decidir o corte de dominios antes de mover arquivos
- evitar misturar mensagens internas, whatsapp e servicos externos no mesmo slice sem criterio
- atualizar testes por dominio

### Fase 9: Settings e Reports

Status: `planned`

Objetivo:

- mover areas de configuracao nao-admin e relatorios para slices dedicados

Arquivos alvo:

- `src/pages/Settings.tsx`
- `src/pages/Reports.tsx`
- `src/components/settings/*`
- helpers e mapeamentos ligados a relatorios

Possiveis slices:

- `src/features/settings/`
- `src/features/reports/`

### Fase 10: Auth Rename e Fechamento Estrutural

Status: `planned`

Objetivo:

- alinhar o auth extraido com a convencao final de `features`

Arquivos alvo:

- `src/modules/auth/**/*`

Tarefas:

- renomear `src/modules/auth/` para `src/features/auth/`
- ajustar imports
- atualizar docs

Observacao:

- fazer isso apenas depois de estabilizar os dominios restantes, para nao aumentar churn desnecessario

### Fase 11: Limpeza Final e Endurecimento

Status: `planned`

Objetivo:

- encerrar compatibilidades temporarias e subir o nivel de seguranca do projeto

Tarefas:

- revisar o que ainda sobra em `src/pages/`, `src/hooks/`, `src/services/` e `src/lib/`
- decidir o destino final de `Index.tsx`, `Login.tsx` e `NotFound.tsx`
- reduzir ainda mais `src/types/index.ts`
- adicionar `tsc --noEmit` no CI quando o passivo de tipos permitir
- atacar flags de TypeScript em etapas: `strictNullChecks`, `noImplicitAny`, `noUnusedLocals`, depois `strict`

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
- `src/types/index.ts` ainda existe por compatibilidade e deve encolher com o tempo

## Proxima Fase Recomendada

Proxima fase a executar: `Fase 6: Admin`

Motivo:

- o dashboard ja virou slice real e liberou o proximo corte estrutural relevante
- `admin` ainda concentra pages e hooks espalhados fora de `src/features/`
- resolver `admin` antes de `claris` reduz o churn no shell e deixa o dominio de assistente para uma fase mais isolada

## Ao Concluir Uma Fase

Sempre atualizar:

- o status da fase neste arquivo
- a secao `Estado atual` em [FRONTEND_MODULES.md](./FRONTEND_MODULES.md)
- qualquer instrucao operacional em [../.github/copilot-instructions.md](../.github/copilot-instructions.md) se a convencao mudar
