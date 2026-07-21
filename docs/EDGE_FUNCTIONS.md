# Edge Functions

Atualizado em `2026-07-21`.

## Objetivo

As Edge Functions concentram fluxos que nao devem ficar espalhados no frontend:

- integracoes com Moodle e WhatsApp
- operacoes multi-tabela
- jobs e automacoes
- chamadas a provedores de IA
- tarefas que precisam de auditoria, idempotencia ou auth forte

## Estrutura atual

```text
supabase/functions/
  <function-name>/
    index.ts
    payload.ts            # quando a function tem body estruturado
  _shared/
    http/
    db/
    validation/
    domain/
    claris/
    moodle/
    whatsapp/
```

## Convencao recomendada

Para functions novas ou refatoradas, o padrao preferencial e:

- `index.ts`: handler fino, sem regra de negocio extensa
- `payload.ts`: parser/contrato da request
- `service.ts`: orquestracao do caso de uso
- `repository.ts`: acesso a dados e integrações externas
- `mapper.ts`: transformacoes entre payload, banco e resposta

Nem toda function precisa de todos os arquivos, mas `index.ts` deve continuar pequeno.

### Estrutura de um caso de uso

```text
supabase/functions/<function-name>/
  index.ts       # adapta HTTP, auth e resposta; nao acessa tabelas
  payload.ts     # interpreta e valida o contrato de entrada
  contract.ts    # DTOs HTTP independentes do schema
  service.ts     # orquestra o caso de uso e regras de aplicacao
  repository.ts  # unico modulo local que conhece Supabase/PostgreSQL
  mapper.ts      # converte modelos de persistencia em DTOs
```

Arquivos podem ser omitidos quando nao agregarem uma responsabilidade real, mas `index.ts` nao deve conter query, regra de negocio nem mapping de linha do banco. Services recebem repositories por parametro para permitir testes sem banco. O piloto completo e `moodle-reauth-settings`.

## Contrato HTTP V1

As APIs chamadas pelo frontend usam a rota do gateway Supabase:

```text
{SUPABASE_URL}/functions/v1/<function-name>
```

Functions usam nomes `kebab-case`. Quando uma function oferece mais de uma operacao, o campo `action` usa `snake_case` e representa uma intencao de dominio, nunca uma operacao generica sobre tabela. Campos JSON usam `camelCase`; datas sao strings ISO-8601 em UTC.

Durante a migracao, o contrato V1 e solicitado pelo header `x-claris-api-version: 1`. Endpoints legados podem manter temporariamente a resposta anterior quando o header nao estiver presente. Codigo novo deve usar exclusivamente V1.

### Respostas

Sucesso:

```json
{
  "data": { "preferenceEnabled": true },
  "correlationId": "4db3732d-67d5-4746-b213-381c46641912"
}
```

Erro:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Payload invalido.",
    "details": { "field": "enabled" },
    "correlationId": "4db3732d-67d5-4746-b213-381c46641912"
  }
}
```

O mesmo `correlationId` e retornado no header `x-correlation-id`. Codigos HTTP representam a classe do resultado; erros funcionais nao devem retornar HTTP 200.

### Paginacao

Requests paginados usam `page` (iniciando em 1), `pageSize` e um objeto opcional `filters`. Respostas usam:

```json
{
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 25,
    "totalCount": 0,
    "totalPages": 0
  },
  "correlationId": "4db3732d-67d5-4746-b213-381c46641912"
}
```

Os tipos compartilhados e helpers opt-in ficam em `_shared/http/contract.ts` e `_shared/http/response.ts`. `moodle-reauth-settings` e o endpoint piloto: clientes legados continuam recebendo o payload antigo, enquanto requests V1 recebem o envelope padronizado.

## Runtime compartilhado

### HTTP

`_shared/http/` oferece:

- `createHandler`
- CORS centralizado
- parsing de body
- respostas padronizadas
- validacao de autenticacao com `requireAuth`
- `correlationId` e logger estruturado por request
- erros tipados com mapeamento consistente de status
- hook opcional de autorizacao do caso de uso

Erros inesperados retornam uma mensagem generica e nunca incluem stack trace ou a mensagem interna. O logger compartilhado filtra metadados com nomes sensiveis e handlers nao devem registrar body, `Authorization`, tokens ou credenciais.

O runtime limita bodies JSON a 10 MiB por padrao antes do parser. Endpoints que transportam midia podem declarar um limite maior explicitamente. `_shared/http/body.ts` oferece leitores estritos para boolean, inteiros com faixa, UUID, data ISO, objetos, arrays, enums e paginacao; JSON malformado ou com shape invalido retorna 400, enquanto campos semanticamente invalidos em contratos V1 retornam 422.

Endpoints de coleta devem declarar limites menores e nunca confiar em identidade enviada no body. `app-telemetry`, por exemplo, limita a request a 64 KiB, restringe profundidade, cardinalidade e tamanho de atributos, redige chaves sensiveis recursivamente e deriva `userId` exclusivamente do token autenticado.

### Banco

`_shared/db/` oferece:

- client com service role quando necessario
- tipos compartilhados entre frontend e functions

### Dominio

`_shared/domain/` concentra repositorios e fluxos reaproveitados por mais de uma function, como:

- bulk messaging
- moodle sync
- task automation
- users

## Autenticacao e browser

O deploy remoto usa `--no-verify-jwt` por design nas functions expostas ao navegador.

Motivo:

- o preflight `OPTIONS` do browser precisa chegar ate o handler compartilhado
- a validacao real continua dentro da function via `createHandler(..., { requireAuth: true })`

Ou seja, a autenticacao nao foi removida; ela foi movida para a camada que tambem consegue responder CORS corretamente.

## Observabilidade minima esperada

Cada function critica deve registrar, de forma consistente quando fizer sentido:

- `user.id`
- nome da function
- latencia
- tipo de erro
- contexto de entrada relevante, sem vazar segredos

O objetivo e permitir troubleshooting de sync, mensageria e IA sem depender de logs difusos no frontend.

## Validacao operacional

Antes de publicar mudancas em functions ou migrations:

1. rodar `npm.cmd run smoke:edge`
2. validar tipos gerados do Supabase
3. atualizar [SUPABASE_RLS.md](./SUPABASE_RLS.md) se houve mudanca de policy
4. manter contratos do payload versionados quando uma function for consumida por mais de um cliente

O smoke de Edge Functions valida o V1 de ponta a ponta: `Content-Type`, header e body de correlation ID, envelopes 401/422, leitura autenticada, isolamento por ator e grants service-only. O fluxo real cobre tambem templates, publico de mensagens, paginacao de jobs/recipients, maquina de estados de campanhas, listagem segura de instancias WhatsApp, overview/eventos pessoais e administracao de instancias sem dados brutos da Evolution, historico actor-scoped da Claris, sugestoes atomicas com rollback/retry, disponibilidade sem segredo de provedor, suporte com identidade derivada do token, observabilidade administrativa, controle de acesso com auditoria/anti-lockout e a fronteira de sync/jobs (preferencias, risco, polling, feed, autorizacao admin e cancelamento condicional).

## Functions chave

- `claris-chat`: disponibilidade publica ao ator e loop de IA em DTO V1; configuracao do provedor e credenciais Moodle permanecem no backend
- `claris-conversations`: CRUD actor-scoped do historico da Claris, com DTO V1 e identidade derivada do token
- `claris-suggestions`: lista o feed actor-scoped e aceita/dispensa sugestoes em uma transacao que tambem cria tarefa/evento e cooldown
- `generate-proactive-suggestions`: executa os motores proativos e oferece DTO V1 para o client HTTP, preservando temporariamente o contrato legado
- `moodle-messaging`: lista conversas, consulta mensagens e envia mensagens em DTO V1; resolve a credencial no servidor e associa alunos dentro do escopo do tutor
- `bulk-message-audience`: resolve cursos, alunos, risco, notas e pendencias no escopo tutor
- `bulk-message-send`: revalida destinatarios no servidor, cria o job e executa o disparo inicial
- `message-templates`: seed server-side, CRUD e favoritos actor-scoped
- `campaigns`: historico paginado, recipients e CRUD/transicoes autoritativas de agendamentos
- `whatsapp-messaging`: instancias acessiveis, conversas, contatos, mensagens e midia em contrato V1 sem expor respostas brutas da Evolution
- `whatsapp-instance-manager`: overview e eventos pessoais actor-scoped, listagem/comandos compartilhados admin-only e gateway da Evolution encapsulado; DTO V1 omite persistencia e respostas brutas do provedor
- `moodle-*`: autenticacao e sincronizacao incremental com Moodle
- `data-cleanup`: limpeza operacional admin-only, com ordenacao server-side e cobertura ampliada do banco
- `moodle-reauth-settings`: referencia de handler fino com payload, contrato, service, repository e mapper separados
- `app-telemetry`: coleta autenticada e best-effort de uso/erros, sem permitir identidade fornecida pelo frontend
- `support-tickets`: abre tickets para o ator autenticado e concentra listagem/atualizacao administrativa; atribuicao, contexto e data de resolucao sao definidos no servidor
- `admin-observability`: agrega o dashboard e pagina metricas, logs e conversas Claris; exige administrador, redige campos sensiveis e limita conversas às 100 mensagens mais recentes
- `access-control`: entrega o contexto do ator e administra permissoes, grupos e acessos; comandos usam RPCs service-only com ator explicito, auditoria imutavel e atualizacao atomica de papel/grupo
- `task-tag-suggestions`: busca course-scoped de entidades para tags de tarefas, sem expor tabelas ou aceitar escopo do browser
- `dashboard-summary`: compoe indicadores, prioridades, fila de correcao e feed em uma unica chamada autenticada, com escopo tutor derivado do token
- `courses-catalog`: entrega o catalogo do ator autenticado e executa comandos atomicos de associacao, ignorar/designorar e configuracao de frequencia
- `course-panel`: consolida curso, alunos, atividades, submissoes e estatisticas com metadados canonicos independentes da ordem; tambem persiste a intencao de ocultar ou exibir uma atividade
- `course-attendance`: consulta detalhes paginados, totais completos por data e folha por curso, e salva lotes de presenca com validacao course-scoped e transacao unica
- `students`: lista alunos com paginacao e consolida perfil/historico academico sem expor joins ou identidade do ator no payload
- `academic-reports`: entrega cursos tutor-scoped e datasets completos para os relatorios de notas e atividades pendentes
- `grade-suggestion-jobs`: localiza o job relevante do ator para uma atividade autorizada, sem acesso direto do browser as tabelas operacionais
- `tasks`: lista tarefas com filtros e ordenacao estaveis, consolida detalhe/comentarios/tags e executa comandos escopados ao criador ou responsavel
- `calendar-events`: executa o CRUD de agenda owner-scoped, valida intervalos e deriva proprietario/origem do token
- `moodle-sync-jobs`: inicia, retoma e consulta sincronizacoes Moodle; tambem concentra preferencias, contagem por curso e recalculo de risco
- `background-jobs`: entrega polling actor-scoped e operacoes administrativas de lista, detalhe, retry e cancelamento
- `activity-feed`: lista notificacoes do ator sem expor a tabela ao navegador

As functions de cursos usam DTOs V1 em `camelCase`, rejeitam identidade enviada no payload e reaplicam autorizacao e acesso ao curso no backend. Os comandos multi-registro chamam RPCs `SECURITY DEFINER` exclusivas de `service_role`; o navegador nao recebe permissao de execucao nem de escrita direta nas tabelas envolvidas.

No `courses-catalog`, a leitura aceita as permissoes das rotas de Cursos e Escolas (`courses.catalog.view` ou `schools.view`). Associacao e preferencia de curso aceitam somente esses fluxos, enquanto frequencia exige `courses.attendance.manage`. Para nao transformar o comando de associacao em autoelevacao, um ator nao administrador so pode alternar o papel de cursos aos quais ja possui acesso. A cada sincronizacao, `moodle-sync-courses` substitui atomicamente a elegibilidade do ator pelos cursos efetivamente retornados por sua sessao Moodle; a selecao posterior aceita ate 500 UUIDs unicos e os vincula em uma unica RPC que rejeita o lote inteiro quando qualquer curso estiver fora dessa elegibilidade.

Em frequencia, `records` e paginado para limitar o payload, enquanto `dateSummaries` e agregado no banco sobre todo o historico. A UI cancela folhas obsoletas quando a data muda e so habilita o salvamento depois de correlacionar curso e data da resposta.

Os casos de uso academicos do Epic 5 usam a permissao da rota (`students.view`, `reports.view` ou `grades.suggestions.manage`) e reaplicam o escopo de curso no service. `students` retorna 404 tanto para aluno inexistente quanto inacessivel. `academic-reports` exige que todos os UUIDs do lote sejam associacoes `tutor` do ator e pagina internamente todas as tabelas consultadas. Como Relatorios possui endpoint proprio, `reports.view` nao autoriza mais o catalogo geral de cursos.

Jobs de sugestao sao criados com seus itens em uma unica RPC e possuem no maximo um registro `pending/processing` por ator, curso e atividade. O cancelamento tambem e transacional; updates de worker usam precondicoes de status para nao sobrescrever um cancelamento concorrente. Jobs, itens, historico de auditoria e snapshots academicos nao possuem grants para `anon` ou `authenticated`.

No Epic 6, `tasks` e `calendar-events` substituem os repositories Supabase do browser. Ambos exigem a permissao da rota (`tasks.view` ou `agenda.view`), rejeitam identidade no payload e retornam DTOs V1. A listagem de tarefas define filtros, ordenacao e paginacao no contrato; o detalhe agrega comentarios e tags. Criador, autor de comentario e owner de evento sao sempre derivados do token.

`backend_add_task_tag` combina find-or-create e vinculo em uma transacao, apoiado por indice unico normalizado por ator, label e entidade. Chamadas concorrentes e repetidas retornam a mesma tag e um unico vinculo. As seis tabelas modernas de tarefas/agenda e as RPCs auxiliares nao possuem grants para `anon` ou `authenticated`; `service_role` e a unica porta de dados, com escopo reaplicado pelos services.

### Sincronizacao Moodle e jobs longos

`moodle-sync-jobs` recebe apenas a intencao e o escopo de cursos. O service e independente do runtime; a implementacao Supabase/Moodle e injetada por `runtime.ts`, facilitando uma futura troca do adaptador por uma API .NET sem alterar o contrato consumido pelo React.

```text
start_* -> pending -> processing -> completed
                         |             ^
                         +-> failed ---+ retry
                         +-> cancelled-+ retry
```

A chave canonica considera ator, tipo, cursos e entidades. Um indice unico parcial bloqueia dois registros `pending/processing` equivalentes, inclusive em corrida. O worker resolve no servidor a credencial de reautorizacao criptografada e um token Moodle novo; depois executa cursos/vinculo, alunos, atividades, notas e risco, persistindo cada etapa em `background_job_items`. Cancelamento e claim usam updates condicionais de status para que worker, usuario e administrador nao sobrescrevam uma transicao concorrente.

O frontend recebe um DTO agregado em `camelCase` e faz polling. Fechar a aba nao cancela o trabalho; ao reconstruir a sessao, `useCourseSync` consulta jobs ativos e retoma o acompanhamento. `background-jobs` oferece a visao operacional, enquanto `activity-feed` fornece notificacoes. As tabelas `background_jobs`, `background_job_items`, `background_job_events`, `activity_feed` e `user_sync_preferences` sao service-only.

## Nova function: `moodle-grade-suggestions`

Responsavel pela sugestao de nota/feedback com IA e pela aprovacao manual com envio ao Moodle.

### Fluxo

1. `generate_suggestion`
2. resolve curso, aluno e atividade no banco local
3. monta contexto avaliativo a partir do `assign` e de recursos da mesma secao (`file`, `page`, `label` e `folder`)
4. normaliza a submissao do aluno e extrai texto de arquivos suportados
5. chama o provedor configurado em `app_settings.claris_llm_settings`
6. grava auditoria em `ai_grade_suggestion_history`
7. retorna sugestao estruturada para a UI

### Fluxo em lote por atividade

1. `generate_activity_suggestions`
2. resolve a atividade e lista todas as entregas sincronizadas daquela UC
3. monta o contexto avaliativo uma unica vez
4. reaproveita esse contexto para gerar sugestoes por aluno, variando apenas a submissao
5. retorna um conjunto estruturado de resultados para renderizacao inline na aba de atividades

### Aprovacao

1. `approve_suggestion`
2. valida a auditoria e a relacao usuario/curso/aluno
3. envia nota e feedback para `mod_assign_save_grade`
4. atualiza `student_activities`
5. registra status final da aprovacao na auditoria

### Configuracao

- conexao do modelo: `app_settings.claris_llm_settings`
- knobs operacionais: `app_settings.ai_grading_settings`
- imports npm do runtime Deno: `supabase/functions/deno.json`

### Observacoes de operacao

- a function continua autenticada via `createHandler(..., { requireAuth: true })`
- o `config.toml` local usa `verify_jwt = false` apenas para permitir preflight/browser reachability; a validacao real segue dentro do handler
- respostas `null` do Moodle em `mod_assign_save_grade` sao tratadas como validas pelo cliente compartilhado

## Referencias

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SUPABASE_RLS.md](./SUPABASE_RLS.md)
- [README.md](./README.md)
