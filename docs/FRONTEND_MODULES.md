# Frontend Modules

Atualizado em `2026-07-21`.

Este documento descreve a modularizacao atual do frontend, com foco em fronteiras de dominio e manutencao incremental.

## Objetivos

- reduzir acoplamento entre `pages`, `components`, `contexts` e `lib`
- manter `src/app/` para shell global e roteamento
- concentrar comportamento de apresentacao e clientes de API por dominio
- manter regras de negocio e acesso ao banco fora do navegador
- manter `src/components/ui/` como camada de primitives genericas

## Estrutura Alvo

```text
src/
  app/
    providers/
    routes/
  features/
    <dominio>/
      api/
      application/       # quando fizer sentido
      components/
      hooks/
      pages/             # adaptadores de rota, quando houver
      infrastructure/    # quando fizer sentido
      types.ts
  components/
    ui/
  integrations/
  lib/
  pages/
  hooks/
```

## Regras de Fronteira

- `src/app/` concentra providers globais e composicao de rotas.
- `src/features/<dominio>/api` concentra clientes de casos de uso expostos pelas Edge Functions e nao acessa tabelas ou RPCs diretamente.
- `src/features/<dominio>/hooks` expoe hooks de dominio.
- `src/features/<dominio>/types.ts` e a fonte primaria de contratos de tipo.
- `src/components/ui/` nao deve carregar regra de negocio.
- `src/pages/` deve ficar restrito ao shell publico.
- codigo novo no frontend nao deve chamar `supabase.from()` nem `supabase.rpc()`.
- tipos gerados do banco nao devem fazer parte dos DTOs ou view models da apresentacao.
- Supabase Auth e Realtime sao excecoes temporarias apenas por adapters dedicados; elas nao autorizam acesso ao banco.

Chamadas a Edge Functions passam por `src/integrations/http/edge-function-client.ts`, que aplica contrato V1, correlation ID, timeout, cancelamento, normalizacao de erros e uma unica tentativa de renovacao da sessao. Features migradas nao usam `supabase.functions.invoke` diretamente.

O acesso ao Supabase Auth passa exclusivamente por `src/integrations/auth/auth-gateway.ts`. O gateway traduz a sessao do provedor para um contrato da aplicacao e concentra leitura, renovacao, eventos, persistencia de tokens e logout; features e demais integrations nao conhecem `supabase.auth`.

Subscriptions passam exclusivamente por `src/integrations/realtime/realtime-gateway.ts`. O adapter esconde channels, tabelas e payloads do provedor e entrega eventos de dominio com uma funcao de cleanup; o Realtime permanece apenas como sinal para invalidar dados obtidos pela API.

Telemetria passa por `src/integrations/telemetry/telemetry-client.ts`. O client nao recebe identidade, usa timeout curto e trata a operacao como best-effort; hooks e helpers nao gravam tabelas nem bloqueiam o fluxo do usuario quando a coleta falha.

Componentes com semantica de dominio permanecem dentro da feature correspondente. O seletor de tags de tarefas, por exemplo, vive em `features/tasks/components` e consulta sugestoes pelo client do caso de uso; `components/ui` contem apenas primitives sem acesso a dados.

O dashboard consome uma unica API de caso de uso em `features/dashboard/api/dashboard-summary.ts`. O hook preserva cache e invalidacao do React Query, enquanto indicadores, prioridades, fila e feed recebem DTOs enxutos; nenhuma parte da feature conhece tabelas, RPCs ou tipos gerados do Supabase.

O dominio de cursos consome os casos de uso `courses-catalog`, `course-panel` e `course-attendance` por clients HTTP em `features/courses/api/`. Catalogo, associacoes, configuracao de frequencia, painel consolidado, visibilidade de atividades e folhas de presenca usam DTOs proprios; a UI envia intencoes e preserva somente responsabilidades de apresentacao, cache e invalidacao.

Alunos consome `students` por um client HTTP unico: listagem, perfil, notas/atividades e historico chegam como DTOs consolidados. Hooks apenas definem query keys por ator, cancelamento e estados de tela. Relatorios consome `academic-reports`, mantendo no navegador somente a montagem visual das planilhas; filtros academicos, joins, escopo e consolidacao ficam no backend. A reidratacao de jobs de sugestao usa `grade-suggestion-jobs` e so ocorre quando a permissao de IA esta presente.

DTOs de transporte vivem em `src/features/<dominio>/api/contracts/` e descrevem somente o JSON da API. View models permanecem no `types.ts` da feature, e mappers em `api/mappers/` convertem entre os dois quando necessario. Contratos, hooks, pages e components nao importam tipos gerados do banco. `npm run guard:frontend-contracts` protege essa regra e mantem uma allowlist decrescente para duas dividas anteriores.

Essas regras sao definidas na [ADR-005](./DECISIONS/ADR-005-supabase-backend-boundary.md). A validacao client-side existe para UX; regras de permissao, elegibilidade e estado persistido sempre sao revalidadas no backend.

## Estado Atual (Resumo)

- `src/app/` concentra providers e roteamento principal.
- `src/pages/` ficou no shell publico (`Index`, `Login`, `NotFound`).
- Slices ativos em `src/features/`:
  - `admin`
  - `agenda`
  - `auth`
  - `background-jobs`
  - `campaigns`
  - `claris`
  - `courses`
  - `dashboard`
  - `messages`
  - `reports`
  - `services`
  - `settings`
  - `students`
  - `tasks`
  - `whatsapp`
- A migracao dos acessos diretos existentes e incremental e esta controlada por [SUPABASE_BACKEND_SEPARATION_PLAN.md](./SUPABASE_BACKEND_SEPARATION_PLAN.md).
- O guardrail de fronteira de dados segue em `scripts/check-supabase-boundary.mjs` (`npm run guard:supabase-boundary`) e sera ampliado conforme o legado for removido.
- `scripts/supabase-boundary-debt.json` congela contagens exatas por arquivo: novas dependencias falham, e cada migracao deve reduzir o snapshot com `node scripts/check-supabase-boundary.mjs --write-debt` apos revisao.

## Sequencia Recomendada Para Evolucao

1. manter `App.tsx` fino (apenas composicao de providers e router)
2. implementar novas features direto em `src/features/<dominio>/...`
3. expor novos casos de uso por Edge Functions e consumi-los por clientes em `api/`
4. manter contratos no slice e evitar barrels globais de tipos
5. migrar os acessos Supabase inventariados sem alterar contratos de UI desnecessariamente
6. remover wrappers legados e endurecer o guardrail conforme os imports antigos desaparecerem

## Fora de Escopo

- migracao big bang de toda a base de uma vez
- implementar o backend .NET antes de concluir a separacao de responsabilidades no Supabase
