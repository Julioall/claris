# Frontend Modules

Este documento descreve a direcao de modularizacao do frontend sem exigir uma migracao big bang.

Para a ordem de execucao e continuidade entre sessoes, consultar [FRONTEND_REFACTOR_PLAN.md](./FRONTEND_REFACTOR_PLAN.md).

## Objetivos

- reduzir o acoplamento entre `pages`, `components`, `contexts` e `lib`
- manter `src/app/` apenas para shell global da aplicacao
- concentrar regra de negocio e acesso a dados por dominio
- deixar `src/components/ui/` somente para componentes realmente genericos

## Estrutura alvo

```text
src/
  app/
    providers/
    routes/
  features/
    auth/
      api/
      components/
      hooks/
      pages/
      types.ts
    courses/
      api/
      components/
      hooks/
      pages/
      query-keys.ts
      types.ts
    students/
    tasks/
    agenda/
    claris/
    admin/
  components/
    ui/
  integrations/
  lib/
  pages/
  hooks/
  types/
```

## Regras

- `src/app/` concentra providers globais, shell de roteamento e composicao de alto nivel.
- `src/features/<dominio>/api` concentra queries, mutations, services e repositories daquele dominio.
- `src/features/<dominio>/hooks` expoe hooks de dominio como `useStudentsQuery` e `useSyncStudentsMutation`.
- `src/features/<dominio>/components` guarda componentes especificos do dominio.
- `src/features/<dominio>/pages` guarda telas do dominio ou adaptadores de rota.
- `src/features/<dominio>/types.ts` e a fonte primaria dos contratos TypeScript daquele dominio.
- `src/components/ui/` fica reservado para primitives genericas e reaproveitaveis.
- `src/types/index.ts` deve existir apenas como barrel de compatibilidade temporaria durante a migracao.

## Estado atual

- `src/app/` ja concentra providers e rotas do shell principal.
- `src/features/courses/` concentra pages, hooks, query keys, repository e tipos do dominio de cursos, e o roteamento ja aponta direto para o slice.
- `src/features/agenda/` concentra page, hook, query keys, helpers e tipos do dominio de agenda, sem depender mais dos wrappers antigos de `src/pages/`, `src/hooks/`, `src/services/` e `src/lib/`.
- `src/features/students/` concentra page, hooks, repository e tipos do dominio de alunos, e os consumidores principais ja usam o slice diretamente.
- `src/features/tasks/` concentra page, hooks, repository e tipos do dominio de tarefas, e o roteamento ja aponta direto para o slice.
- `src/features/dashboard/` agora concentra page, hook, repository, query keys, componentes e tipos do dashboard, e o roteamento ja aponta direto para o slice.
- `src/features/claris/` agora concentra page, hooks e componentes do assistente, enquanto o layout global e o dashboard apenas montam o slice.
- `src/features/messages/` agora concentra a page de mensagens Moodle e os componentes de envio em massa, modelos e variaveis dinamicas.
- `src/features/whatsapp/` agora concentra a page de conversa em tempo real via Evolution.
- `src/features/automations/` agora concentra a page hub de automacoes e seus componentes operacionais especificos.
- `src/features/services/` agora concentra `MyServicesPage` e o fluxo de gestao da instancia pessoal de servicos externos.
- `src/features/settings/` agora concentra `SettingsPage`, os cards de configuracao do usuario e a configuracao de tema compartilhada com o shell.
- `src/features/reports/` agora concentra `ReportsPage` e o fluxo de exportacao academica.
- `src/features/admin/` agora concentra as pages administrativas, enquanto `src/app/routes/admin/` concentra `AdminRoute` e `AdminLayout` como shell de roteamento.
- `src/lib/claris-settings.ts` e `src/components/ui/claris-logo.tsx` permanecem compartilhados por ainda atenderem mais de um dominio.
- `src/features/auth/` concentra sessao Moodle, sync, risco e servicos de autenticacao como slice de dominio.
- o restante do frontend ainda esta majoritariamente organizado por pastas tecnicas.

## Sequencia recomendada

1. manter `App.tsx` fino e concentrar shell global em `src/app/`
2. mover novas features para `src/features/<dominio>/...`
3. migrar dominios mais acoplados, comecando por `students`, `tasks`, `courses` e `agenda`
4. substituir carregamento manual por hooks de dominio baseados em React Query
5. reduzir `src/types/index.ts` conforme os tipos forem migrando para cada dominio
6. remover wrappers legados remanescentes de `src/pages/`, `src/hooks/`, `src/services/` e `src/lib/` conforme os imports antigos forem eliminados

## Fora de escopo desta etapa

- renomear toda a base de `src/modules/` para `src/features/`
- ativar `strict` no TypeScript de uma vez
- mover toda a integracao Supabase em um unico refactor
