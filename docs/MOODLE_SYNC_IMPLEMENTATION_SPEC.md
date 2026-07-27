# Spec / Epic - Sincronizacao Moodle multi-site e otimizada

Atualizado em `2026-07-26`.

## Identificacao

- Epic: `MSYNC`
- Status: implementacao local concluida nos Epics 0 a 6; Epic 7 em validacao de ambiente e rollout
- Prioridade: alta
- Ambientes alvo: FIEG Moodle `5.1.2` e SENAI Moodle `4.5.5`
- Evidencias: [`MOODLE_SYNC_OPTIMIZATION_PLAN.md`](./MOODLE_SYNC_OPTIMIZATION_PLAN.md), [`benchmarks/moodle-readonly-validation-2026-07-21.json`](./benchmarks/moodle-readonly-validation-2026-07-21.json) e [`runbooks/MOODLE_SYNC_STAGING_CANARY.md`](./runbooks/MOODLE_SYNC_STAGING_CANARY.md)

## Status de execucao

Este quadro e a fonte resumida de status. Os checklists detalhados abaixo continuam sendo os criterios normativos de aceite; um epic somente esta pronto para producao depois dos gates do Epic 7.

| Epic | Estado | Entrega atual | Pendencias para encerrar o plano |
| --- | --- | --- | --- |
| Epic 0 - corretude e seguranca | concluido em codigo | registry aprovado, URLs normalizadas, remocao do host default e bloqueio dos contratos antigos | confirmar telemetria no ambiente publicado |
| Epic 1 - fundacao multi-Moodle | concluido em codigo | sites, N conexoes, escopo composto, preferencias, proveniencia e schema greenfield reproduzivel | nenhuma pendencia de codigo conhecida |
| Epic 2 - conta e conexoes | concluido em codigo | login/recovery Claris, convite administrativo, aceite, onboarding opcional e gestao de conexoes | configurar SMTP e redirects allowlisted em staging/producao |
| Epic 3 - adaptador resiliente | concluido em codigo | client por conexao, capabilities, paginacao, papeis, suspensos, retries e campos opcionais | validar fixtures finais no gate do Epic 7 |
| Epic 4 - pipeline otimizado | concluido em codigo | bulk de notas, snapshot estatico reutilizavel, delta shadow ligado ao worker, watermark transacional, hashes/upserts diferenciais, frescor adaptativo e agregacao final unica | habilitar skip por delta somente depois do benchmark shadow e dos canarios |
| Epic 5 - worker duravel | concluido em codigo | jobs V2, claim/lease/heartbeat, checkpoint, retry, cancelamento, retomada, finalizacao transacional, circuit breaker por site e dispatcher local | fornecer `MOODLE_SYNC_WORKER_CRON_SECRET` no ambiente publicado e validar dois ciclos reais |
| Epic 6 - consumidores | concluido em codigo | mensagens, campanhas, notas, Claris Chat e diagnosticos exigem conexao/site explicitos | nenhuma pendencia de codigo conhecida |
| Epic 7 - qualidade e rollout | em andamento | banco recriado do zero, tipos regenerados, fixtures 4.5/5.1, isolamento/rollout/dispatcher/circuit breaker transacionais, suite completa, benchmark sintetico, smoke HTTP V2 e painel operacional | SMTP/redirects, benchmark comparativo e resiliencia em staging, segredo/agendamento publicado e canarios FIEG/SENAI |

### Validacao local consolidada em 2026-07-26

- `npm test -- --run`: suite completa aprovada; os testes focados de fixture, resiliencia, dispatcher, circuit breaker e rollout tambem passaram;
- typecheck, lint, build e todos os guards de fronteira aprovados;
- schema recriado do zero e tipos Supabase regenerados;
- smoke Edge V2 autenticado aprovado contra o banco local, sem credencial Moodle valida e sem chamada remota;
- transacao PostgreSQL revertida confirmou `grades -> risk`, finalizacao atomica e watermark no mesmo commit;
- `scripts/validate-moodle-multisite-isolation.sql` confirmou IDs externos iguais, preferencias e elegibilidade isolados entre FIEG/SENAI e reverteu todos os dados sinteticos;
- `scripts/validate-moodle-sync-rollouts.sql` confirmou o deny-by-default, a allow-list por usuario e o kill switch por site; `scripts/validate-moodle-sync-dispatcher.sql` confirmou os ramos fresh/queue, o gate de worker e o circuit breaker;
- a telemetria de provider registra por tentativa, sem segredo ou payload, a funcao Moodle, tentativa, status, duracao e bytes; o item concluido persiste agregados limitados por funcao e a tentativa que falha antes da conclusao permanece em log estruturado com job/item/conexao/site;
- `npm run benchmark:moodle-sync` aprovou os cenarios sinteticos 0, 10, 100 e 500 alunos com metadados estaticos reutilizados, notas bulk e limites de memoria/tempo versionados em `docs/benchmarks/`;
- `npm run validate:moodle-sync:staging` e o runbook do Epic 7 deixam o preflight externo reproduzivel e estritamente de leitura; esse comando ainda nao foi executado contra staging;
- nenhuma escrita ou alteracao foi executada nos Moodles FIEG/SENAI.

Os itens marcados abaixo representam implementacao e verificacao local. Configuracao de ambiente, benchmark em staging e canarios permanecem desmarcados ate serem realmente executados.

### Decisao greenfield consolidada

- nao existe pagina publica de cadastro (`/signup`);
- o primeiro administrador e criado pelo runbook seguro `scripts/provision-first-admin.mjs`;
- os demais usuarios entram por convite administrativo e definem uma senha exclusiva da Claris;
- uma conta Claris pode existir com zero conexoes Moodle e adicionar N conexoes depois do login;
- nao havera migracao, backfill ou compatibilidade para usuarios, senhas, sessoes ou credenciais do prototipo;
- ambientes ainda nao publicados podem ser recriados diretamente com o schema final;
- nenhuma validacao deste plano autoriza escrita nos Moodles de producao.

## Objetivo

Tornar a Claris o centro operacional de dados de N conexoes Moodle isoladas - inicialmente FIEG e SENAI - mantendo uma conta Claris independente e executando sincronizacoes iniciais e incrementais com menor latencia, menos chamadas externas, retomada automatica e erros observaveis.

Ao final:

- toda identidade externa e resolvida por `site + id Moodle`;
- telas, analises e automacoes consomem o modelo normalizado da Claris, sem fan-out Moodle no caminho de leitura;
- cada dado sincronizado preserva origem, frescor e ultimo checkpoint confirmado;
- token e URL Moodle sao resolvidos no backend por uma conexao autorizada;
- um job processa apenas uma conexao/site;
- notas usam uma chamada bulk por curso no caminho principal;
- conteudo estatico de atividades e carregado uma vez por curso/job;
- o worker executa unidades curtas, idempotentes e retomaveis;
- falhas externas ou de persistencia nunca aparecem como sucesso vazio;
- a mesma suite de contrato cobre Moodle 4.5.x e 5.1.x.

## Problema e baseline

Os bloqueios confirmados sao:

1. `moodle-sync-courses/service.ts` substitui a URL recebida por uma constante FIEG.
2. Cursos, alunos e o perfil Moodle do usuario possuem IDs externos com unicidade global.
3. Existe apenas uma credencial de reautorizacao por usuario.
4. O browser ainda envia URL e token para varios casos de uso.
5. Alunos sem `roles` sao classificados como estudantes; os campos atuais omitem `roles` nos dois sites.
6. A primeira variante de `onlysuspended` usada pelo client e invalida nos dois sites e gera uma chamada desperdicada antes do fallback correto.
7. Notas, completion e metadados estaticos sao consultados repetidamente por estudante/pagina.
8. O job inteiro depende de uma unica execucao sequencial de `EdgeRuntime.waitUntil`.

Baseline autenticada:

| Indicador | FIEG | SENAI |
| --- | ---: | ---: |
| Cursos visiveis para a conta | 415 | 51 |
| Listagem de categorias | 1,83 MB / 4,1 s | 429 KB / 2,0 s |
| Curso validado | 32787 | 8862 |
| Participantes | 10 | 30 |
| Bulk de notas | 8 usuarios / 80 itens | 13 usuarios / 52 itens |
| Paginacao com lote 7 | 2 paginas, 0 duplicatas | 5 paginas, 0 duplicatas |

## Escopo

Incluido:

- registry controlado e extensivel para N sites, inicialmente FIEG e SENAI;
- multiplas conexoes Moodle por conta Claris;
- schema greenfield com isolamento de IDs externos desde a primeira gravacao;
- convite, cadastro assistido, login, recuperacao e sessao da conta Claris;
- autenticacao, reautorizacao e selecao de conexao Moodle;
- otimizacao de cursos, estudantes, atividades, notas e risco;
- sincronizacao incremental com fallback full;
- worker persistente com cursor, lease, retry e retomada;
- atualizacao dos consumidores Moodle fora do sync;
- telemetria, testes, feature flags, canario e remocao do prototipo incompatível antes da publicacao.

Fora de escopo:

- alterar configuracoes ou instalar plugins nos Moodles;
- escrever notas, matriculas ou conteudo como parte da sincronizacao;
- unificar automaticamente pessoas por e-mail entre sites;
- substituir Supabase ou Edge Functions;
- executar testes de carga ou falha induzida nos Moodles de producao;
- cadastro publico sem convite, SSO social ou provisionamento automatico por dominio;
- redesenhar telas sem relacao com conta, conexoes ou progresso do job.

## Decisoes arquiteturais

### 1. Site faz parte da identidade

`moodle_user_id`, `moodle_course_id` e qualquer outro ID Moodle nao sao globais. Toda resolucao deve possuir `moodle_site_id` direto ou ser alcancavel por um curso/conexao que possua o site.

Atividades ja sao identificadas pelo curso interno em suas chaves. Elas nao precisam duplicar `moodle_site_id`, mas toda consulta deve partir de `course_id`, nunca apenas de `moodle_activity_id`.

### 2. Claris e o centro; conexao e a unidade de acesso Moodle

O [`Julioall/moodle-conector`](https://github.com/Julioall/moodle-conector) e uma referencia util para separar a conta da aplicacao das conexoes Moodle, mas nao define o modelo da Claris. A conta Claris existe por conta propria e possui zero ou mais conexoes. A senha Moodle autentica somente uma conexao e nunca e reutilizada ou sincronizada como senha da conta Claris.

Uma conexao liga uma conta Claris a uma conta em um site Moodle e possui alias, credencial, capabilities e estado proprios. A conta pode ter FIEG, SENAI e outras conexoes futuras, inclusive mais de uma conta externa no mesmo site quando os IDs Moodle forem diferentes. O mesmo e-mail nunca cria merge automatico.

Novas conexoes sao adicionadas somente dentro de uma sessao Claris autenticada. Como a aplicacao ainda nao foi publicada, nao existe ponte de migracao: o login Moodle do prototipo e removido antes do primeiro canario. Cadastro, login e recuperacao da Claris nunca dependem da disponibilidade ou da senha de nenhum Moodle.

O onboarding Moodle e opcional e adiavel. Uma conta valida pode permanecer com zero conexoes sem ficar em estado inconsistente. O primeiro administrador nasce por uma operacao segura e auditada; os demais usuarios entram por convite administrativo. O primeiro release nao possui cadastro publico.

### 3. O browser nao escolhe hosts arbitrarios

O frontend envia `connectionId` nos casos Moodle. Ao cadastrar uma conexao, envia `siteId`, alias e credenciais efemeras. O backend resolve `base_url` e service a partir de um site aprovado. Payloads operacionais nao aceitam `moodleUrl` ou token.

Somente HTTPS e hosts cadastrados sao aceitos. Redirects de autenticacao ou REST nao podem sair do host registrado. A arquitetura aceita N sites, mas a inclusao de um host novo e uma operacao administrativa auditada; autoatendimento de URL so pode ser adicionado futuramente com protecao SSRF/DNS completa e aprovacao.

### 4. Uma conexao por job

Todo job `moodle_sync` possui um `moodle_connection_id` imutavel. Cursos enviados ao job devem pertencer ao mesmo site da conexao. Uma solicitacao com mais de uma conexao, mesmo que elas apontem para o mesmo site, e particionada em jobs separados antes de entrar no worker.

### 5. Incremental e uma otimizacao segura

`core_course_get_updates_since` e inicialmente um sinal consultivo, porque informa mudancas que afetam o usuario autenticado e ainda nao foi provado que cobre toda alteracao de terceiro relevante para notas/completion. O rollout comeca em shadow mode, comparando delta e full. Uma entidade so pode ser pulada depois dessa equivalencia; ausencia da capability, watermark antigo/invalido, warning, resposta ambigua ou mudanca de versao executa full sync. Deve existir reconciliacao full periodica, e o watermark so avanca depois do commit bem-sucedido.

### 6. Worker usa entrega pelo menos uma vez

Unidades podem ser reexecutadas apos timeout. Todas as gravacoes precisam ser idempotentes. O claim usa lease atomico; expirar uma lease devolve o item para processamento sem concluir o job duas vezes.

### 7. Compatibilidade e definida por capability e campos opcionais

O adaptador nao espalha condicionais de versao pelos services. Ele registra release/functions e normaliza respostas para tipos internos. Campos como `suspended`, `grademax` e `percentageformatted` podem estar ausentes.

### 8. Claris possui o modelo operacional canonico

Os Moodles permanecem a origem autoritativa de matriculas, atividades, completion e notas geradas neles. A Claris e a fonte de verdade para conexoes, identidade interna, dados normalizados sincronizados, relacionamentos internos, preferencias, risco, historico, jobs e auditoria.

Telas, dashboards, Claris/LLM e automacoes consultam o banco Claris. Nao fazem fan-out sincrono aos Moodles para montar uma resposta. Cada registro sincronizado preserva `moodle_site_id`, ID externo, instante observado, timestamp de origem quando existir, hash de conteudo e a conexao do ultimo sync. A UI informa frescor; uma falha Moodle mantem o ultimo snapshot valido marcado como desatualizado, nunca o substitui por vazio.

## Organizacao normativa dos escopos

| Escopo | Chave autoritativa | Pertence ao escopo | Nunca deve conter |
| --- | --- | --- | --- |
| Conta Claris | `user_id` | identidade, login/recuperacao, perfil Claris, risco e preferencias globais | senha/token Moodle |
| Site Moodle | `moodle_site_id` | URL aprovada, service, versao observada, limites e circuit breaker do host | credencial de usuario |
| Conexao Moodle | `connection_id` | owner, alias, conta Moodle, segredo criptografado, capabilities, write gate e estado | preferencia global da conta |
| Catalogo/entidade | `moodle_site_id + external_id` | cursos e alunos compartilhados daquele ambiente | `external_id` sem site |
| Acesso do tutor | `user_id + connection_id + course_id` | descoberta, elegibilidade e origem do vinculo | substituicao global de outro Moodle |
| Sync | `connection_id + course_id + entity` | preferencias, watermark, cache visivel e metricas | cache de outra conexao |
| Job/item | `job_id/item_id`, com contexto de conexao imutavel | cursor, lease, tentativa, checkpoint e erro | token/credencial |
| Escrita Moodle | `connection_id + actor + resource` | permissao Claris, `can_write`, capability Moodle, confirmacao e auditoria | inferencia de conexao por ID externo |

Regras de resolucao:

1. `connectionId` deve pertencer ao ator autenticado ou estar autorizado por politica administrativa explicita.
2. O curso interno deve possuir o mesmo `moodle_site_id` da conexao.
3. Aluno/atividade sempre sao resolvidos por UUID interno e curso; IDs Moodle isolados nao atravessam a fronteira HTTP.
4. Alias serve para exibicao e selecao humana. Banco, jobs, caches e auditoria usam UUID da conexao.
5. Nao existe conexao default nem fallback implicito. Operacoes de origem unica exigem `connectionId`; visoes consolidadas recebem um conjunto/filtro explicito e consultam dados ja sincronizados na Claris.
6. Rate limit/circuit breaker de disponibilidade e por site; auth, token, capabilities e cache de visibilidade sao por conexao.
7. Desconectar muda a conexao para `disconnecting`, impede novos jobs e solicita cancelamento dos ativos. O segredo e removido depois que itens em lease terminarem/cancelarem. Dados academicos sao preservados conforme retencao; nunca ha cascade de cursos/alunos.

## Modelo de dados alvo

Os nomes abaixo sao normativos. O schema final nasce com os invariantes obrigatorios; nao ha fase nullable, backfill de usuarios ou dual-read de producao.

### `claris_invitations`

| Coluna | Regra |
| --- | --- |
| `id uuid` | PK |
| `email_normalized text` | e-mail convidado, indice parcial unico enquanto `pending` |
| `full_name text` | perfil inicial informado pelo administrador |
| `app_role text` | papel inicial permitido pela politica Claris; nunca aceito de metadata enviada pelo usuario |
| `status text` | `pending`, `accepted`, `revoked` ou `expired` |
| `invited_by uuid` | administrador autenticado |
| `auth_user_id uuid` | preenchido ao aceitar, unico quando nao nulo |
| `expires_at`, `accepted_at`, timestamps | ciclo de vida e auditoria |

A tabela e service-only. O backend usa a API administrativa do Supabase para enviar o convite, mas nao persiste token/link. No primeiro callback autenticado, uma transacao valida convite pendente + e-mail confirmado, cria `public.users` com `id = auth.uid()`, aplica o papel server-side e marca o convite como aceito. `user_metadata` nunca concede autorizacao.

### `moodle_sites`

| Coluna | Regra |
| --- | --- |
| `id uuid` | PK |
| `slug text` | unico; string extensivel, inicialmente `fieg` e `senai` |
| `name text` | nome para UI |
| `base_url text` | HTTPS, normalizada, unica e sem path final |
| `service text` | default `moodle_mobile_app` |
| `status text` | `pending`, `approved` ou `disabled`; somente `approved` recebe credenciais |
| `release text`, `version text` | snapshot observado |
| `limits jsonb` | tamanho de pagina, concorrencia e timeouts por site |
| timestamps | auditoria |

Somente administradores/backend podem alterar essa tabela. O endpoint autenticado retorna apenas `id`, `slug`, `name` e disponibilidade; URL/service nao sao escolhidos pelo browser durante uma operacao.

### `user_moodle_connections`

| Coluna | Regra |
| --- | --- |
| `id uuid` | PK |
| `user_id uuid` | FK `users`, cascade |
| `moodle_site_id uuid` | FK `moodle_sites`, restrict |
| `alias text` | nome unico dentro da conta Claris |
| `moodle_user_id text` | identidade externa dentro do site |
| `moodle_username text` | nunca usado como chave global |
| `moodle_full_name`, `moodle_email`, `moodle_avatar_url` | perfil externo especifico da conexao |
| `credential_ciphertext text` | opcional, criptografado pelo backend |
| `reauth_enabled boolean` | opt-in explicito |
| `can_write boolean` | kill switch da conexao; default `false` |
| `capabilities jsonb` | funcoes disponiveis para aquele token/usuario |
| `status text` | `active`, `reauth_required`, `disconnecting` ou `disabled` |
| `last_reauth_at`, `last_token_issued_at`, `last_error` | estado operacional |
| timestamps | auditoria |

Constraints:

- `unique (user_id, alias)` com alias normalizado;
- `unique (user_id, moodle_site_id, moodle_user_id)` para impedir conexao duplicada na mesma conta;
- `unique (moodle_site_id, moodle_user_id)` para impedir que a mesma conta externa pertença a duas contas Claris;
- nenhuma policy permite ler `credential_ciphertext` pelo browser.

`user_moodle_reauth_credentials` pertence ao prototipo de uma credencial por usuario e e removida antes da publicacao. Nao existe dual-read; ambientes de desenvolvimento sao recriados com seed quando necessario.

### Entidades sincronizadas

- `courses.moodle_site_id uuid not null` ao final;
- `students.moodle_site_id uuid not null` ao final;
- substituir unicidade global por `unique (moodle_site_id, moodle_course_id)` e `unique (moodle_site_id, moodle_user_id)`;
- manter relacionamentos academicos usando UUIDs internos;
- registrar proveniencia e frescor com `source_updated_at` quando fornecido, `observed_at`, `content_hash`, `last_synced_at` e `last_synced_connection_id` conforme a entidade;
- apos a transicao, `users.moodle_user_id` deixa de ser fonte de verdade e e removido em epic de limpeza.

O perfil em `users` e identidade da conta Claris e nao deve mais ser sobrescrito por `core_webservice_get_site_info`. Nome/e-mail/avatar Moodle ficam na conexao. `user_metadata.moodle_user_id` tambem deixa de ser fonte de verdade.

### Acesso e preferencias por conexao

Evoluir `user_course_catalog_eligibility` para incluir `moodle_connection_id` na chave. A substituicao de catalogo remove somente elegibilidades da conexao consultada; listar SENAI nunca remove elegibilidade FIEG.

Criar `user_moodle_sync_preferences` com chave unica `(user_id, moodle_connection_id)` para `selected_keys`, inclusao de cursos vazios/finalizados e preferencias de exibicao. Temperatura, intervalos, cooldown e proxima execucao sao politica operacional calculada pela Claris e nao podem ser aumentados arbitrariamente pelo usuario. `user_sync_preferences` permanece no nivel da conta para risco, Claris/LLM e outras configuracoes globais.

### Controle incremental e cache

Criar `moodle_sync_watermarks` com chave unica `(moodle_connection_id, course_id, entity)`, `last_successful_sync_at`, `moodle_since`, `source_release` e timestamps.

Criar cache service-only por conexao para categorias visiveis, com dados normalizados, `cache_key`, `expires_at` e limite de tamanho. Nao persistir o payload bruto de 1,83 MB. Categorias usam TTL inicial de 6 horas; capabilities ficam na conexao e sao renovadas ao validar credenciais e no maximo a cada 24 horas.

### Politica adaptativa de frescor

Criar `moodle_sync_policies`, administrada pelo backend, com campos `moodle_site_id`, `entity`, `temperature`, `stale_after_seconds`, `full_reconcile_after_seconds`, `manual_cooldown_seconds`, `enabled` e timestamps. Usar indice unico `(moodle_site_id, entity, temperature)` quando o site nao for nulo e indice parcial unico `(entity, temperature) WHERE moodle_site_id IS NULL` para a politica global. Configuracao especifica do site prevalece.

Criar `moodle_course_sync_state` com chave unica `(moodle_connection_id, course_id)`, `temperature`, `reason_codes`, `last_claris_access_at`, `next_incremental_at`, `last_manual_refresh_at`, `last_full_sync_at`, `last_successful_sync_at` e timestamps. A temperatura e recalculada somente com dados Claris:

- `hot`: curso selecionado/em acompanhamento, em andamento e com prazo nos proximos 14 dias ou acesso recente na Claris;
- `warm`: curso selecionado/em acompanhamento e em andamento, sem sinal de urgencia;
- `cold`: curso selecionado, encerrado ou sem atividade recente;
- `archived`: curso fora do acompanhamento; nao recebe sync academico periodico.

Valores iniciais para staging, ajustaveis por site depois do benchmark:

| Entidade | `hot` | `warm` | `cold` | `archived` |
| --- | ---: | ---: | ---: | ---: |
| estudantes | 30 min | 4 h | 24 h | somente manual |
| atividades + completion | 30 min | 1 h | 24 h | somente manual |
| notas | 10 min | 1 h | 24 h | somente manual |
| reconciliacao full | 24 h | 7 dias | 30 dias | somente manual |

Catalogo/categorias permanecem com TTL inicial de 6 horas por conexao. O scheduler aplica jitter, limites e circuit breaker por site. Reduzir intervalo exige configuracao administrativa e novo benchmark; uma solicitacao manual nao ignora cooldown, rate limit, circuit breaker ou limites de memoria.

### Jobs e leases

Preservar `background_jobs` como modelo generico e criar `moodle_sync_job_context` em relacao 1:1 com o job, contendo `moodle_connection_id`, schema version e politica de sync. Em `background_job_items`, adicionar campos genericos de execucao:

- `available_at`;
- `lease_owner`;
- `leased_until`;
- `heartbeat_at`;
- `attempt_count` e `max_attempts`;
- `cursor jsonb`;
- `last_error_code`.

O claim deve ser uma RPC transacional com `FOR UPDATE SKIP LOCKED`. Um cron/dispatcher duravel invoca periodicamente o worker para reivindicar itens pendentes ou leases expiradas; `EdgeRuntime.waitUntil` serve apenas como aceleracao inicial. O browser continua sem permissao de mutacao direta de jobs/itens.

## Contratos HTTP V2

### Conta Claris por convite

Cadastro inicial e fechado por convite. Nao existe rota publica `/signup` no primeiro release.

```ts
interface CreateClarisInvitationRequestV1 {
  action: 'create_invitation'
  email: string
  fullName: string
  appRole: 'tutor'
}

interface ClarisInvitationResponseV1 {
  contractVersion: 1
  id: string
  emailMasked: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  expiresAt: string
}

interface ProvisionClarisAccountResponseV1 {
  contractVersion: 1
  userId: string
  onboardingRequired: boolean
  nextPath: '/onboarding/moodle' | '/'
}

type ManageClarisInvitationRequestV1 =
  | CreateClarisInvitationRequestV1
  | { action: 'resend_invitation'; invitationId: string }
  | { action: 'revoke_invitation'; invitationId: string }
```

Casos de uso:

- `create_invitation`, `resend_invitation` e `revoke_invitation`: somente administrador; chamam Supabase Admin no backend;
- `provision_account`: sessao autenticada apos aceite; idempotente e transacional;
- login Claris: `signInWithPassword` por e-mail/senha;
- esqueci minha senha: `resetPasswordForEmail`, sempre com resposta publica generica contra enumeracao;
- nova senha: `updateUser` somente em sessao de recovery valida;
- logout global/local conforme politica existente.

Rotas publicas e de onboarding:

- `/login`: e-mail e senha Claris;
- `/auth/accept-invite`: valida callback, define senha e chama `provision_account`;
- `/forgot-password`: solicita recuperacao sem revelar se o e-mail existe;
- `/reset-password`: define nova senha em sessao de recovery;
- `/onboarding/moodle`: rota autenticada para adicionar a primeira conexao ou seguir sem Moodle.

Rota administrativa:

- `/admin/users/invitations`: lista estados sanitizados e permite criar, reenviar e revogar convites; nunca exibe token ou link de autenticacao.

Convite/recuperacao exigem URLs de redirect allowlisted, templates Claris, expiracao, rate limit e SMTP de producao. O callback nao confia em papel, `connectionId` ou `moodle_user_id` vindo de query string/metadata do usuario.

### Configuracao Moodle

O endpoint de configuracao publica passa a expor:

```ts
interface MoodleSiteOptionDto {
  id: string
  name: string
  slug: string
}
```

Autenticacao Claris usa exclusivamente Supabase Auth e nao recebe credencial Moodle. Adicao de conexao ocorre depois do login/onboarding:

```ts
interface CreateMoodleConnectionRequestV2 {
  alias: string
  canWrite: false
  moodlePassword: string
  moodleUsername: string
  siteId: string
}
```

O endpoint `moodle-auth` e o formulario de login Moodle do prototipo sao removidos antes do primeiro canario. Senhas e tokens Moodle nunca aparecem em response, storage do browser, log, evento ou metadata de job.

### Conexoes autenticadas

Criar casos de uso tipados para:

- `list_connections`;
- `create_connection` usando `siteId`, alias e credenciais no request efemero;
- `validate_connection` e `update_connection`;
- `update_reauth`;
- `disconnect_connection`, que bloqueia novos jobs, solicita cancelamento dos ativos e finaliza a remocao do segredo com seguranca.

O DTO de leitura contem `id`, alias, site, username mascarado quando aplicavel, `reauthEnabled`, `canWrite`, `lastValidatedAt` e status sanitizado.

### Jobs de sincronizacao

Evoluir `moodle-sync-jobs` para contrato V2:

```ts
type StartInitialSyncV2 = {
  action: 'start_initial_sync'
  connectionId: string
  courseIds: string[]
}

type StartCourseSyncV2 = {
  action: 'start_course_sync'
  connectionId: string
  courseIds: string[]
  entities: Array<'students' | 'activities' | 'grades'>
}
```

`list_available_courses`, preferencias, contagens e recalculo recebem `connectionId`. Responses de curso/job incluem `connectionId`, `siteSlug` e `contractVersion: 2`.

Consultas consolidadas recebem filtros explicitos de site/conexao, leem somente o modelo Claris e retornam proveniencia/frescor. Elas nao escolhem uma conexao implicitamente nem chamam Moodle durante a requisicao.

### Snapshot, stale-while-revalidate e refresh manual

Leituras de curso usam um contrato Claris-first. `refreshPolicy: 'if_stale'` permite enfileirar uma atualizacao, mas a requisicao nunca aguarda nem chama Moodle diretamente:

```ts
type MoodleSyncEntityV2 = 'students' | 'activities' | 'grades'
type FreshnessStateV2 = 'fresh' | 'stale' | 'refreshing' | 'never_synced'

interface GetCourseSnapshotRequestV2 {
  action: 'get_course_snapshot'
  connectionId: string
  courseId: string
  entities: MoodleSyncEntityV2[]
  refreshPolicy: 'never' | 'if_stale'
}

interface EntityFreshnessDtoV2 {
  entity: MoodleSyncEntityV2
  state: FreshnessStateV2
  observedAt: string | null
  sourceUpdatedAt: string | null
  lastSuccessfulSyncAt: string | null
  staleAt: string | null
  refreshJobId: string | null
  lastErrorCode: string | null
}

interface CourseSnapshotResponseV2<T> {
  contractVersion: 2
  connectionId: string
  courseId: string
  siteId: string
  data: T | null
  freshness: EntityFreshnessDtoV2[]
  refresh: {
    status: 'not_requested' | 'queued' | 'deduplicated' | 'cooldown'
    jobId: string | null
    retryAfterSeconds: number | null
  }
}

interface RequestCourseRefreshV2 {
  action: 'request_course_refresh'
  connectionId: string
  courseId: string
  entities: MoodleSyncEntityV2[]
  reason: 'manual'
}

interface RequestCourseRefreshResponseV2 {
  contractVersion: 2
  status: 'queued' | 'deduplicated'
  jobId: string
  acceptedEntities: MoodleSyncEntityV2[]
  requestedAt: string
}
```

Regras do contrato:

1. `get_course_snapshot` responde com o snapshot Claris, mesmo desatualizado. Sem snapshot, retorna `data: null`, `never_synced` e, quando solicitado, agenda o primeiro job.
2. `if_stale` retorna HTTP `200` com os dados atuais e `queued`/`deduplicated`; nao bloqueia esperando Moodle.
3. `request_course_refresh` retorna HTTP `202`. Pedidos identicos concorrentes reutilizam o job ativo pela chave canonica `connectionId + courseId + entities ordenadas + sync_kind`.
4. Cooldown manual inicial de 60 segundos por `connectionId + courseId`; violacao retorna HTTP `429`, `moodle_refresh_cooldown` e `Retry-After`. Nao existe `force` no contrato do usuario.
5. Falha de refresh preserva o snapshot anterior, muda o estado para `stale`, preenche apenas codigo sanitizado e nunca converte falha em lista vazia.
6. O backend valida ownership da conexao, elegibilidade do curso e correspondencia de site antes de ler ou agendar.
7. O scheduler pode promover/rebaixar temperatura, mas requests do browser nao enviam temperatura, intervalo, `staleAt` ou prioridade.

Metadata persistida:

```ts
interface MoodleSyncJobMetadataV2 {
  connection_id: string
  course_ids: string[]
  entities: Array<'students' | 'activities' | 'grades'>
  schema_version: 2
  sync_kind: 'initial' | 'incremental'
  trigger: 'initial' | 'scheduler' | 'stale_read' | 'manual' | 'reconciliation'
}
```

### Erros

Codigos minimos:

- `moodle_connection_not_found`;
- `moodle_site_disabled`;
- `moodle_authentication_failed`;
- `moodle_capability_missing`;
- `moodle_permission_denied`;
- `moodle_invalid_payload`;
- `moodle_rate_limited`;
- `moodle_refresh_cooldown`;
- `moodle_transient_failure`;
- `sync_course_site_mismatch`;
- `sync_item_lease_lost`;
- `sync_persistence_failed`.

Erros Moodle 4xx funcionais nao recebem retry. Rede, timeout, HTTP 429 e 5xx usam backoff exponencial com jitter, `Retry-After` e limite por site.

## Fluxo alvo

```text
conta Claris -> adicionar/selecionar connectionId -> registry + credencial
                                                     |
                                                     v
start sync -> connectionId + internal courseIds -> planner
                                               |
                       background_job + work items paginados
                                               |
                  claim lease -> adapter -> normalize -> upsert
                                               |
                     checkpoint/watermark -> next invocation
                                               |
                         aggregate/risk -> terminal job
```

Dependencias por curso:

```text
courses -> students -> activities ----+
                    -> grades --------+-> aggregates/risk/finalize
```

`activities` e `grades` podem rodar em paralelo limitado depois de estudantes. O numero inicial e `1` curso simultaneo por site, configuravel apenas depois do benchmark de staging.

## Epics e historias

As tasks devem ser executadas na ordem dos epics. Uma checkbox so pode ser marcada quando seus criterios de aceite e testes estiverem satisfeitos.

### Epic 0 - Bloqueios de corretude e seguranca

Objetivo: remover riscos do prototipo antes de qualquer canario.

- [x] `MSYNC-0001` Criar registry de sites e validacao SSRF
  - Semear FIEG e SENAI por migration; permitir novos sites por operacao administrativa auditada.
  - Resolver URL/service no backend e validar HTTPS, host, DNS e redirects.
  - AC: URL arbitraria, IP privado/link-local, HTTP, userinfo, porta nao permitida e redirect cross-host falham antes de enviar credenciais.

- [x] `MSYNC-0002` Redigir logs e desativar o login Moodle do prototipo
  - Remover corpo de autenticacao dos logs; permitir apenas status, host cadastrado, duracao e correlation ID.
  - Impedir novos usos de `moodle-auth`; nao corrigir fluxo morto que sera removido no Epic 2.
  - AC: testes de redacao impedem token/senha em logs/erros e guard bloqueia nova dependencia do login Moodle.

- [x] `MSYNC-0003` Remover `PRIMARY_MOODLE_URL` depois do registry
  - Fazer `syncCourses` aceitar somente um contexto de conexao ja resolvido pelo backend, nunca URL bruta do request.
  - AC: teste de contrato prova que token SENAI nunca e enviado ao host FIEG e vice-versa.

- [x] `MSYNC-0004` Instrumentar baseline segura
  - Registrar funcao, site, tentativa, duracao, bytes, resultado e job/item IDs. O item concluido recebe agregados limitados por funcao; logs estruturados mantem tambem a tentativa que encerra em falha antes da conclusao do item.
  - AC: nenhuma metrica ou log estruturado contem token, senha, nome, e-mail, nota, URL ou payload bruto.

- [x] `MSYNC-0005` Fechar a arquitetura de autenticacao da conta Claris
  - Definir convite administrativo, aceite/definicao de senha, login, recuperacao, logout e provisioning idempotente, sem cadastro publico.
  - Provisionar o primeiro administrador por seed seguro/operacao controlada, nunca por e-mail hardcoded no frontend ou migration publica.
  - AC: conta nasce sem Moodle, papel vem apenas do backend e indisponibilidade Moodle nao impede cadastro, login ou recuperacao Claris.

### Epic 1 - Fundacao multi-Moodle no banco

Objetivo: criar o schema greenfield definitivo com site/conexao obrigatorios desde a primeira gravacao.

- [x] `MSYNC-0101` Criar `moodle_sites`
  - Schema, seeds, RLS/grants service-only e leitura publica sanitizada.
  - AC: slugs e URLs sao unicos, normalizados e imutaveis para chamadas em andamento.

- [x] `MSYNC-0102` Criar `user_moodle_connections`
  - Suportar alias por conta e N conexoes, com criptografia, capabilities, status e write gate.
  - AC: schema nasce com constraints finais; browser nao le ciphertext e fixtures criam FIEG/SENAI sem linha legada.

- [x] `MSYNC-0103` Escopar cursos e alunos por site
  - Criar `moodle_site_id not null` e constraints compostas diretamente no schema final; dados de desenvolvimento podem ser descartados/reseeded.
  - AC: fixtures permitem o mesmo ID Moodle em FIEG e SENAI sem update cruzado.

- [x] `MSYNC-0104` Atualizar repositories centrais, elegibilidade, RPCs e views
  - Inventariar toda consulta por `moodle_user_id`, `moodle_course_id` e `moodle_activity_id`.
  - Escopar discovery/elegibilidade por conexao e impedir que a substituicao de catalogo de um site remova o outro.
  - AC: guard automatizado bloqueia novas consultas de ID Moodle sem escopo aprovado.

- [x] `MSYNC-0105` Separar preferencias globais e de sync
  - Criar `user_moodle_sync_preferences` para selecao/exibicao por conexao e manter risco/LLM em `user_sync_preferences`. Temperaturas/intervalos sao politica backend, nao preferencia livre do usuario.
  - AC: alterar selecao SENAI nao modifica FIEG nem preferencias globais; browser nao grava intervalo, temperatura ou prioridade.

- [x] `MSYNC-0106` Regenerar tipos e validar schema reproduzivel
  - Atualizar tipos Supabase compartilhados/frontend.
  - AC: banco local/staging sobe do zero com seeds tecnicos e todos os testes passam sem dados ou colunas legadas.

- [x] `MSYNC-0107` Tornar o modelo Claris canonico e rastreavel
  - Adicionar proveniencia, frescor, hash e ultima conexao de sync onde aplicavel; criar leitura consolidada sem fan-out Moodle.
  - AC: uma consulta FIEG + SENAI usa apenas o banco Claris, mostra origem/frescor e preserva o ultimo snapshot valido quando uma origem falha.

### Epic 2 - Autenticacao e experiencia de conexoes

Objetivo: criar a conta Claris independente e permitir adicionar/alternar N conexoes Moodle sem confiar em URLs operacionais do browser.

- [x] `MSYNC-0201` Implementar convites e provisioning da conta Claris
  - Implementar `claris_invitations`, casos de uso administrativos, provisioning transacional e runbook idempotente do primeiro administrador.
  - AC: papel vem do backend; convite expirado/revogado falha; reenvio nao cria duas contas; nenhuma credencial/token de convite e persistida ou exposta.

- [ ] `MSYNC-0202` Implementar paginas e ciclo de sessao Claris
  - Criar `/admin/users/invitations`, `/login`, `/auth/accept-invite`, `/forgot-password`, `/reset-password` e `/onboarding/moodle`.
  - Configurar redirects allowlisted, templates, expiracao/rate limit e SMTP de staging/producao; remover pagina/endpoint `moodle-auth`.
  - AC: convite -> senha -> login funciona ponta a ponta; recovery nao enumera e-mails; onboarding pode ser adiado; conta com zero Moodle entra normalmente; nao existe `/signup` publico nem codigo de login Moodle alcancavel.

- [x] `MSYNC-0203` Expor registry e seletor de conexoes
  - Remover FIEG hardcoded; listar sites aprovados e conexoes da conta com alias.
  - AC: FIEG/SENAI aparecem pelo backend, alias e unico por conta, site desabilitado nao aceita credenciais e nenhuma operacao escolhe conexao implicitamente.

- [x] `MSYNC-0204` Implementar gerenciamento de conexoes
  - Adicionar, validar, editar alias/credencial, definir write gate, alterar reauth e desconectar.
  - AC: adicionar SENAI nao altera identidade/senha/perfil Claris; desconexao respeita jobs ativos e nao apaga cursos/alunos compartilhados.

- [x] `MSYNC-0205` Implementar reautorizacao por conexao
  - `resolveMoodleAccess` passa a exigir `connectionId`; cache de token e por conexao e curto.
  - AC: falha/revogacao SENAI nao invalida FIEG; erro de auth invalida o cache correspondente.

- [x] `MSYNC-0206` Atualizar sessao e caches frontend
  - Manter `selectedConnectionId` apenas como contexto explicito da UI; query/cache keys que dependem de Moodle incluem `connectionId`.
  - AC: alternar conexao nao reutiliza cursos, conversas ou progresso do outro site.

### Epic 3 - Adaptador Moodle compativel e resiliente

Objetivo: concentrar diferencas entre Moodle 4.5 e 5.1 em uma fronteira testavel.

- [x] `MSYNC-0301` Criar client por conexao
  - Pooling, timeout, abort, retry seletivo, limite de resposta e correlation ID.
  - AC: politica de retry e testada para timeout, 429, 5xx, parametro invalido, permissao e cancelamento.

- [x] `MSYNC-0302` Persistir snapshot de capabilities
  - Normalizar `release`/`version` por site e lista de funcoes por conexao.
  - AC: capability ausente aciona fallback documentado, nunca chamada repetidamente invalida.

- [x] `MSYNC-0303` Corrigir participantes e papeis
  - Paginar por ID com lote inicial 100; solicitar `roles`, `groups`, `suspended` e campos realmente persistidos.
  - Remover "sem papel = aluno" do caminho normal.
  - AC: fixtures separam aluno/equipe, lidam com papel ausente e nao removem vinculo por resposta ambigua.

- [x] `MSYNC-0304` Corrigir suspensos
  - Enviar diretamente `options[name/value]=onlysuspended/1`; remover a tentativa top-level invalida.
  - AC: fixtures 4.5/5.1 e smoke dos dois cursos retornam as contagens validadas sem chamada duplicada.

- [x] `MSYNC-0305` Normalizar notas e atividades
  - Campos ausentes permanecem `null`; percentual so e derivado com valores validos.
  - AC: fixture SENAI sem `grademax` nao grava zero nem produz percentual enganoso.

### Epic 4 - Pipeline otimizado

Objetivo: reduzir chamadas e gravacoes mantendo equivalencia funcional.

- [x] `MSYNC-0401` Otimizar descoberta de cursos/categorias
  - Usar o contexto da conexao, cache normalizado de categorias por conexao e evitar nova listagem no inicio do job.
  - AC: job iniciado a partir da selecao nao repete os ~2,3 MB de discovery FIEG dentro do TTL.

- [x] `MSYNC-0402` Otimizar estudantes
  - Consumir paginas incrementalmente e evitar `core_user_get_users_by_field` quando os campos ja vierem na matricula.
  - AC: 100 alunos usam no maximo paginas de matricula + uma consulta paginada de suspensos, salvo fallback registrado.

- [x] `MSYNC-0403` Otimizar atividades/completion
  - Buscar contents, assignments, quizzes e forums uma vez por curso/job; reutilizar entre paginas.
  - AC: numero dessas chamadas e constante em relacao ao total de alunos.

- [x] `MSYNC-0404` Implementar bulk de notas
  - Uma chamada `gradereport_user_get_grade_items` com `userid=0`; mapear por usuario e curso.
  - Aplicar limite previo por numero de matriculados e leitura com teto de bytes/memoria; usar fallback individual paginado quando o bulk nao for seguro ou permitido.
  - AC: os cursos 32787 e 8862 mantem a quantidade de itens da amostra individual; caminho principal faz uma chamada.

- [x] `MSYNC-0405` Implementar delta e watermarks
  - Executar inicialmente em shadow mode, comparar com full sync e habilitar skip por entidade/versao somente depois de provar ausencia de falso negativo.
  - Manter reconciliacao full periodica e executar full em warning, watermark antigo ou resposta ambigua.
  - AC: incremental aprovado sem mudanca nao faz upsert massivo; falha antes do commit nao avanca watermark; divergencia desabilita delta daquela conexao.

- [x] `MSYNC-0406` Reduzir writes e agregacoes
  - Comparar hash/colunas relevantes, upsert apenas alterados e recalcular agregados/risco uma vez ao final.
  - AC: reprocessar o mesmo payload e idempotente e nao altera `updated_at` academico sem mudanca.

- [x] `MSYNC-0407` Implementar frescor adaptativo e stale-while-revalidate
  - Criar `moodle_sync_policies` e `moodle_course_sync_state`; classificar cursos em `hot`, `warm`, `cold` ou `archived` usando apenas sinais Claris.
  - Implementar `get_course_snapshot` e `request_course_refresh` conforme o contrato V2, sempre servindo o snapshot antes de enfileirar trabalho Moodle.
  - Aplicar cooldown, deduplicacao atomica, jitter, backpressure e reconciliacao full por temperatura; usuario nao controla intervalo/prioridade. O dispatcher duravel seleciona estados vencidos com `SKIP LOCKED`, enfileira localmente e respeita o circuit breaker por site antes de o worker consultar Moodle.
  - AC: leitura fresca ou stale faz zero chamadas Moodle no request; dez pedidos identicos concorrentes produzem um unico job; cooldown retorna `429`/`Retry-After`; falha mantem o snapshot e erro sanitizado; relogio controlado prova transicoes de temperatura, SLAs e full reconciliation em FIEG/SENAI.

### Epic 5 - Worker curto e retomavel

Objetivo: remover a dependencia de uma invocacao longa e sequencial.

- [x] `MSYNC-0501` Evoluir jobs para metadata V2
  - Criar `moodle_sync_job_context`, incluir `connectionId` na chave canonica e criar work items por `curso + entidade + pagina/fase`.
  - AC: item nao pode acessar curso de outro site e o endpoint rejeita payload/job V1; nao existe migracao de job ativo.

- [x] `MSYNC-0502` Implementar claim/lease atomico
  - RPC com `SKIP LOCKED`, heartbeat e recuperacao de lease expirada.
  - AC: dois workers nao concluem o mesmo item simultaneamente; worker morto e recuperado apos expiry.

- [x] `MSYNC-0503` Aplicar budget de execucao e checkpoint
  - Processar com budget inicial configuravel de 20-30 s, salvar cursor e deixar o dispatcher duravel reivindicar a continuacao. No ambiente local, o Compose inclui `claris-moodle-sync-runner`; no deploy com Supabase gerenciado, o workflow `moodle-sync-runner.yml` chama o planejador e o worker com segredo de cron separado do browser.
  - AC: interrupcao em cada checkpoint retoma sem duplicar dados ou perder pagina; item pendente/lease expirada progride mesmo sem request de usuario aberto.

- [x] `MSYNC-0504` Implementar dependencias e backpressure
  - Estudantes precedem dependentes; atividades/notas podem rodar com concorrencia limitada por site e conexao.
  - AC: indisponibilidade do host SENAI abre circuit breaker do site sem bloquear FIEG; falha de auth afeta somente a conexao correspondente.

- [x] `MSYNC-0505` Tornar progresso e erros verdadeiros
  - Services retornam resultado tipado ou lancam erro; remover catches que convertem falha em zero.
  - AC: erro parcial incrementa `error_count`, identifica item/codigo e impede status `completed` enganoso.

- [x] `MSYNC-0506` Cancelamento, retry e finalizacao
  - Retry cria novas tentativas dos itens elegiveis; cancelamento impede novos claims; finalizacao e atomica.
  - AC: nenhuma transicao reativa job cancelado e somente um evento terminal e produzido.

### Epic 6 - Consumidores Moodle fora da sincronizacao

Objetivo: impedir mistura de sites em operacoes dependentes da conexao.

- [x] `MSYNC-0601` Atualizar mensagens e campanhas
  - `moodle-messaging`, bulk, agendamentos e campanhas referenciam `connectionId`/site; destinatarios guardam contexto imutavel.
  - AC: destinatario SENAI nunca e enviado por uma conexao FIEG.

- [x] `MSYNC-0602` Atualizar sugestoes de nota
  - Contexto e jobs usam conexao do curso; operacoes de escrita continuam separadas do sync e exigem confirmacao/autorizacao existentes.
  - AC: curso/conexao divergentes falham antes de consultar ou escrever no Moodle.

- [x] `MSYNC-0603` Atualizar Claris e diagnosticos administrativos
  - Ferramentas resolvem conexao por IDs internos e respostas permanecem sanitizadas.
  - AC: nenhum payload do browser contem token/URL; testes cobrem acesso cruzado.

- [x] `MSYNC-0604` Atualizar preferencias, query keys e observabilidade
  - Consumir `user_moodle_sync_preferences`, apos a separacao feita no Epic 1, e particionar metricas por site/conexao sem cardinalidade sensivel.
  - AC: estado FIEG e SENAI aparece separado na UI e nos jobs administrativos.

### Epic 7 - Qualidade, rollout e pre-publicacao

Objetivo: validar o schema greenfield, remover o prototipo incompatível e liberar com seguranca.

- [x] `MSYNC-0701` Criar fixtures de contrato 4.5.x e 5.1.x
  - Incluir campos opcionais ausentes, lista vazia valida, warning, exception e payload grande.
  - AC: todas as funcoes usadas possuem ao menos sucesso e falha representativos sem dados pessoais.

- [x] `MSYNC-0702` Criar suite de isolamento multi-site
  - Uma conta com N conexoes, aliases distintos e IDs de usuario, curso e atividade deliberadamente iguais nos sites.
  - AC: sync, cache, preferencias, elegibilidade, leitura, mensagem, diagnostico e sugestao nao cruzam registros.

- [ ] `MSYNC-0703` Executar testes de resiliencia em staging
  - Timeout, 429, 5xx, token expirado, lease perdida, worker interrompido e corrida de finalizacao.
  - Implementacao local: `moodle-sync-resilience.test.ts` cobre retries, falha de auth, lease/cancelamento e corrida de finalizacao; o circuit breaker por site e validado em transacao PostgreSQL.
  - AC: retries sao limitados, checkpoints retomam e circuit breaker fica isolado por site sob condicoes reais de staging.

- [x] `MSYNC-0704` Executar benchmark sintetico controlado local
  - Cursos sinteticos com 0, 10, 100 e 500+ alunos.
  - AC: metas de chamadas logicas, lotes, tempo e memoria aprovadas e registradas em `docs/benchmarks/moodle-sync-synthetic-contract.json`.

- [ ] `MSYNC-0708` Executar benchmark comparativo em staging
  - Repetir a matriz 0/10/100/500+ em conexoes de staging autorizadas, comparar com a linha de base e registrar latencia, tamanho de resposta e taxa de retries por site.
  - AC: nenhum budget e aumentado sem justificativa; os resultados nao registram dados academicos, tokens ou payloads brutos.

- [x] `MSYNC-0707` Validar remocao do prototipo antes do canario
  - Remover contratos/pagina `moodle-auth`, `users.moodle_user_id`, tabela de reauth unica, URLs/tokens no browser, constraints globais e fallbacks FIEG.
  - AC: busca automatizada, schema do zero e testes confirmam zero codigo alcancavel ou fonte de verdade do prototipo.

- [ ] `MSYNC-0705` Rollout FIEG
  - Executar somente apos `MSYNC-0707`; feature flag por site/usuario, canario interno, observacao por dois ciclos completos e rollback por flag.
  - AC: sem mistura de dados, erro silencioso ou regressao alem do budget.

- [ ] `MSYNC-0706` Rollout SENAI
  - Habilitar canario somente apos FIEG e suite 4.5 passarem.
  - AC: dois ciclos completos, jobs retomaveis e metricas dentro do budget.

## Ordem de entrega e PRs

```text
Epic 0 -> Epic 1 -> Epic 2 -> Epic 3 -> Epic 4 -> Epic 5 -> Epic 6 -> Epic 7
```

Epics 3 e partes internas do Epic 4 podem ser desenvolvidos em paralelo depois que o modelo do Epic 1 estiver estabilizado, mas nao devem ser habilitados em producao antes dos gates anteriores.

PRs recomendadas:

1. seguranca, logs e URL correta;
2. schema greenfield, registry e seeds tecnicos;
3. conta Claris por convite, paginas e SMTP;
4. conexoes N, aliases e auth Moodle isolada;
5. constraints compostas, preferencias, elegibilidade e repositories;
6. adapter/paginacao/papeis/suspensos;
7. bulk grades e cache estatico;
8. incremental/watermarks/frescor/SWR;
9. leases/checkpoints;
10. consumidores secundarios;
11. fixtures, staging e flags;
12. remocao do prototipo e checklist de publicacao.

Antes da primeira publicacao, ambientes de desenvolvimento/staging podem ser recriados e reseeded para adotar o schema final. Cada PR de runtime deve continuar reversivel por deploy/feature flag; depois da primeira publicacao, alteracoes destrutivas passam obrigatoriamente a seguir expand/contract.

## Definition of Done

Uma task so esta concluida quando:

- possui teste unitario/contrato proporcional ao risco;
- nao registra segredo ou dado academico bruto;
- usa IDs internos e connection/site scoping;
- trata cancelamento e timeout quando faz I/O;
- propaga erro tipado sem retornar vazio enganoso;
- atualiza tipos/fixtures/documentacao afetados;
- passa typecheck, testes e guards do repositorio;
- schema/migrations foram testados do zero com seeds e fixtures greenfield.

Um epic so esta concluido quando todas as tasks e seus criterios de aceite estao marcados, o artefato de validacao correspondente esta versionado e nao ha TODO funcional oculto no caminho habilitado.

## Gates de rollout

### Gate A - Codigo desabilitado

- schema greenfield aplicado do zero em ambiente limpo;
- seeds tecnicos FIEG/SENAI e primeiro administrador validados sem e-mail hardcoded;
- zero nulo ou colisao inesperada;
- convite, aceite, login, recuperacao e onboarding Claris aprovados com SMTP de staging;
- pagina/endpoint de login Moodle e contratos V1 indisponiveis;
- uma conta de teste possui duas conexoes isoladas por UUID e nenhuma selecao implicita;
- contratos e fixtures aprovados.

### Gate B - Canario FIEG

- URL hardcoded removida;
- isolamento por site e por conexao ativo;
- bulk/delta/frescor adaptativo/worker sob feature flags separadas;
- dashboard operacional mostra volume de execucoes/itens, latencia, retries, itens presos, falhas e circuito por site; chamadas logicas e bytes processados entram como metrica de gate por instrumentacao sem persistir payloads.
  - A entrega local expoe no `admin-observability` os agregados duraveis por `siteSlug + connectionId`: duracao media/P95 de jobs e itens, retries, falhas, itens presos, jobs ativos, estado do circuit breaker e os contadores persistidos `moodle_api_calls`/`moodle_response_bytes`. `moodle_api_calls` conta chamadas logicas feitas por itens concluidos; `moodle_response_bytes` e o tamanho do JSON processado, nao bytes de transferencia na rede. A metadata do item tambem preserva totais limitados por funcao (tentativas, status, duracao, falhas e bytes), enquanto logs estruturados correlacionam tentativas de falha a job/item/conexao/site. Nenhuma superficie inclui alias, usuario Moodle, URL, credenciais, payload ou texto de erro.
  - O limiar de item preso e configuravel somente dentro de 60–3600 segundos; o endpoint limita a janela a 1 hora–90 dias e e acessivel exclusivamente por administradores.

### Gate C - Canario SENAI

- Gate B estavel por dois ciclos;
- suite Moodle 4.5 aprovada;
- nenhuma operacao escreve no Moodle durante o smoke de sync;
- rollback por flag testado.

### Gate D - Publicacao

- dominio e redirects de Auth allowlisted;
- SMTP de producao, templates, expiracao e rate limits validados;
- primeiro administrador provisionado por operacao segura e auditada;
- nenhum consumidor usa codigo/coluna/contrato do prototipo;
- backup, observabilidade e procedimento de rollback registrados.

## Metricas de aceite do epic

- zero chamada Moodle sem `connectionId` e site resolvidos no backend;
- uma conta Claris suporta N conexoes sem compartilhar segredo, cache, preferencias, elegibilidade ou job;
- visoes consolidadas leem somente a Claris e exibem origem/frescor sem fan-out Moodle;
- leitura stale faz zero chamadas Moodle inline e preserva o ultimo snapshot valido;
- dez refreshes manuais identicos concorrentes resultam em um job ativo e os demais sao deduplicados;
- zero token/senha/body de autenticacao em logs e metadata;
- uma chamada de notas por curso no caminho bulk;
- chamadas de contents/assignments/quizzes/forums constantes por curso/job;
- incremental sem mudancas reduz chamadas em pelo menos 90% e nao regrava dados;
- sync inicial de 100 alunos reduz chamadas em pelo menos 45%;
- p95 do mesmo curso/site pelo menos 50% menor que a baseline;
- nenhum item fica `processing` alem da lease sem ser recuperado;
- falha externa/persistencia nunca finaliza como sucesso vazio;
- IDs Moodle iguais entre sites nunca compartilham registro interno;
- FIEG e SENAI aprovados na mesma suite, com variantes 5.1.x e 4.5.x.

## Validacao padrao

Executar conforme a task:

```bash
npm run guard:supabase-boundary
npm run typecheck
npm test
npm run smoke:edge
npm run build
```

Para banco: subir schema/migrations do zero com seeds tecnicos e fixtures sinteticas; validar RLS/grants, constraints, funcoes, triggers e isolamento sem snapshot ou backfill de usuarios FIEG.

Para staging: usar fixtures/cursos sinteticos. Producao recebe somente smoke de leitura controlado e canario explicitamente habilitado; carga, falhas induzidas e concorrencia nao sao testadas contra os Moodles reais.
