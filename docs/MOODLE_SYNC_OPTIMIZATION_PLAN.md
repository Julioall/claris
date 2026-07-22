# Plano de otimizacao da sincronizacao Moodle

Atualizado em `2026-07-21`.

Esta analise e o plano de otimizacao fundamentam a spec executavel [`MOODLE_SYNC_IMPLEMENTATION_SPEC.md`](./MOODLE_SYNC_IMPLEMENTATION_SPEC.md), que contem epics, contratos, modelo de dados, criterios de aceite e gates de rollout.

## Estado atual do plano

A arquitetura e a jornada greenfield estao fechadas. Epics 0, 1, 2, 3, 5 e 6 estao concluidos em codigo; Epics 4 e 7 permanecem em andamento. O status detalhado e as pendencias por epic ficam na [`spec de implementacao`](./MOODLE_SYNC_IMPLEMENTATION_SPEC.md#status-de-execucao).

O primeiro release nao tera cadastro publico nem migracao de usuarios do prototipo. O acesso nasce por convite administrativo, a senha pertence somente a Claris e o onboarding Moodle e opcional. Configuracao de SMTP/redirects, agendamento do worker, benchmark comparativo e canarios FIEG/SENAI sao gates de ambiente e rollout, nao motivos para reintroduzir login Moodle ou uma conexao default.

## Resultado da analise

A sincronizacao ainda nao esta pronta para ser habilitada no SENAI apenas trocando a URL. Ha dois bloqueios de corretude:

1. `moodle-sync-courses` ignora a URL resolvida da credencial e sempre usa `https://ead.fieg.com.br` (`supabase/functions/moodle-sync-courses/service.ts:28,133`). Um token do SENAI acaba sendo enviado ao FIEG.
2. IDs externos sao globais no banco. `users.moodle_user_id`, `students.moodle_user_id` e `courses.moodle_course_id` possuem unicidade sem identificar o Moodle de origem (`supabase/migrations/20260127065717_bc641db4-cbd3-4947-8021-2474619ea29c.sql:10-60`). IDs iguais nos dois ambientes podem sobrescrever dados.

Antes de liberar o segundo Moodle, a aplicacao deve tratar o ambiente Moodle como parte da identidade de toda entidade externa.

## Validacao dos ambientes

Em `2026-07-21`, os seguintes endpoints responderam nos dois ambientes:

| Verificacao | FIEG | SENAI |
| --- | --- | --- |
| Login web | HTTP 200 apos redirect para `/login/index.php` | HTTP 200 apos redirect para `/login/index.php` |
| `/login/token.php` | HTTP 200, JSON Moodle `missingparam` | HTTP 200, JSON Moodle `missingparam` |
| `/webservice/rest/server.php?moodlewsrestformat=json` | HTTP 200, JSON Moodle `invalidtoken` | HTTP 200, JSON Moodle `invalidtoken` |
| Tempo observado do endpoint REST sem token | cerca de 120 ms | cerca de 250 ms |

Isso validou DNS, TLS, rotas de token e REST antes do teste autenticado.

Em seguida foi executado um smoke autenticado estritamente de leitura com uma credencial temporaria, sem gravar credencial, token, IDs Moodle, nomes ou dados academicos. O resultado sanitizado esta em [`benchmarks/moodle-readonly-validation-2026-07-21.json`](./benchmarks/moodle-readonly-validation-2026-07-21.json).

| Verificacao autenticada | FIEG | SENAI |
| --- | --- | --- |
| Release autoritativa (`core_webservice_get_site_info`) | `5.1.2 (Build: 20260209)` | `4.5.5 (Build: 20250609)` |
| Funcoes disponiveis no token | 448 | 443 |
| Cursos retornados para a conta | 415 em 2,8 s / 487 KB | 51 em 0,7 s / 54 KB |
| Categorias | resposta de 1,83 MB em 4,1 s | resposta de 429 KB em 2,0 s |
| Paginacao completa (`limitnumber=7`) | 2 paginas / 10 usuarios / 0 duplicatas | 5 paginas / 30 usuarios / 0 duplicatas |
| `roles` com os campos atuais da Claris | ausente | ausente |
| `roles` incluindo o campo usado pelo conector | presente | presente |
| Participantes no curso validado | 10 (8 alunos, 2 equipe), sem duplicatas | 30 (24 alunos, 6 equipe), sem duplicatas |
| Filtro correto de suspensos (`options`) | aprovado, 1 retorno | aprovado, 11 retornos |
| Filtro atual de suspensos (parametro no nivel raiz) | falhou: `invalidparameter` | falhou: `invalidparameter` |
| Conteudo do curso | aprovado | aprovado |
| Assignments / quizzes / forums | 5 / 1 / 4 | 0 / 2 / 3 |
| Bulk de notas (`userid=0`) | aprovado: 8 usuarios, 80 itens, 351 ms / 43 KB | aprovado: 13 usuarios, 52 itens, 703 ms / 26 KB |
| Bulk versus individual (amostra de 3) | mesma quantidade de itens nos 3 usuarios | mesma quantidade de itens nos 3 usuarios |
| Completion (amostra de 3 alunos) | 3 respostas validas; curso sem status retornado | 3 respostas validas; 3 status retornados |
| `core_course_get_updates_since` (30 dias, filtrado) | 7 instancias / 18 updates | 4 instancias / 6 updates |

A versao `5.0.1` presumida nao corresponde aos ambientes atuais: o alvo real e Moodle `5.1.2` no FIEG e `4.5.5` no SENAI. O suporte e os fixtures devem cobrir `4.5.x` e `5.1.x`.

O bulk de notas foi validado explicitamente no curso `32787` do FIEG e no curso `8862` do SENAI. A resposta agregada funcionou nos dois ambientes sem fallback e confirma a substituicao de `N` chamadas por uma chamada por curso.

A validacao completa desses cursos confirmou ainda que:

- a paginacao real com lote de 7 percorreu 2 paginas no FIEG e 5 no SENAI, sem truncamento ou duplicatas;
- os papeis separam corretamente alunos e equipe quando solicitados explicitamente;
- o parametro `onlysuspended` usado hoje no nivel raiz e rejeitado nos dois sites; a variante suportada deve ser enviada em `options[...][name/value]`;
- a listagem principal omitiu a propriedade `suspended` mesmo havendo matriculas suspensas, portanto ela nao pode ser a unica fonte;
- a busca adicional de perfil nao acrescentou cidade, telefones ou campos customizados na amostra de dois usuarios por site; sua remocao deve ser confirmada por fixture/capability, sem ser obrigatoria no caminho principal;
- os contratos de assignments, quizzes e forums responderam nos dois releases;
- no Moodle 4.5 do SENAI, `grademax` nao veio nos itens de atividade, e `percentageformatted` nao veio em nenhum dos sites. O adaptador nao pode depender desses campos e deve derivar percentuais apenas quando numerador e denominador estiverem presentes;
- os IDs e e-mails da conta autenticada nao coincidem entre os sites. A vinculacao deve ocorrer por conexoes Moodle explicitas sob uma conta Claris, nunca por merge automatico de identidade externa.

## Diagnostico de desempenho

### Chamadas Moodle

Para um curso com `N` estudantes, o fluxo atual faz aproximadamente:

- alunos: listagem completa, segunda consulta de suspensos (hoje com parametro invalido) e `ceil(N / 25)` consultas de perfil;
- atividades: ate tres chamadas estaticas por pagina de 12 estudantes, mais uma chamada de conclusao por estudante;
- notas: uma chamada `gradereport_user_get_grade_items` por estudante;
- cursos: a listagem e buscada ao abrir o seletor e novamente ao iniciar a sincronizacao inicial.

Com 100 estudantes, o total pode passar de 230 chamadas por curso antes de retries. A maior economia disponivel com APIs padrao e consultar as notas do curso em lote: `userid` e opcional em `gradereport_user_get_grade_items`, portanto o caminho principal pode passar de `N` chamadas para uma chamada por curso.

A conta validada recebe 415 cursos no FIEG. So a listagem ocupa cerca de 487 KB, enquanto categorias ocupam 1,83 MB. Buscar ambos novamente no inicio do job adiciona aproximadamente 2,3 MB e 7 segundos antes de sincronizar qualquer aluno. Como o catalogo visivel depende da conta Moodle autenticada, categorias devem ser cacheadas por conexao, nao globalmente por site nem por job.

### Trabalho repetido

- `core_course_get_contents`, prazos de assignments e prazos de quizzes sao buscados novamente em cada pagina de estudantes.
- `userfields` restringe a resposta de matriculados e a lista atual nao pede `roles`; o teste real confirmou que os papeis desaparecem nos dois sites. Como `isStudentLikeUser` considera usuario sem papel como aluno, tutores e equipe podem ser sincronizados como estudantes, aumentando carga e contaminando dados.
- agregados do dashboard sao recalculados ao fim de alunos, atividades, notas e risco, embora possam ser atualizados uma vez ao concluir o curso/job.
- upserts gravam todas as linhas recebidas mesmo quando o conteudo nao mudou.
- a janela de reutilizacao de 10 minutos reduz repeticoes imediatas, mas nao constitui sincronizacao incremental real.

### Orquestracao

O worker percorre `entidades x cursos` de forma totalmente sequencial (`job-runner.ts:337-343`) dentro de uma unica `EdgeRuntime.waitUntil`. Os itens ja existem no banco, mas ainda nao sao unidades independentes e retomaveis. Uma interrupcao do runtime pode deixar o job em `processing` sem lease, heartbeat ou retomada automatica.

### Erros silenciosos

Alguns adaptadores convertem falhas Moodle em listas vazias, e alguns services capturam falha de upsert e retornam sucesso com contagem zero. Assim, indisponibilidade ou falta de permissao pode parecer "curso sem alunos/notas". O job tambem informa `errorCount: 0` para services que ocultaram falhas.

### Autenticacao e seguranca

- o fluxo atual mistura identidade Claris e identidade Moodle: a senha Moodle e usada como senha Supabase e o perfil externo pode sobrescrever e-mail/metadata da conta;
- a tela de login recebe sempre FIEG por configuracao hardcoded; `fetchLoginDefaults` nao consulta as configuracoes do backend (`src/features/auth/api/login.ts:8-12`);
- ha somente uma credencial de reautorizacao por usuario (`user_id` e a chave primaria);
- o caminho `moodle-auth` do prototipo possui referencia invalida a `authEmail`; como nao ha usuarios publicados, ele deve ser removido, nao reparado (`moodle-auth/service.ts:297`);
- o cliente registra os primeiros 500 caracteres da resposta de token, o que pode expor o token em logs;
- a validacao aceita qualquer URL HTTP/HTTPS. Para login com credenciais, deve existir um registro de sites permitido e HTTPS obrigatorio.

## Arquitetura alvo

```text
conta e sessao Claris independentes
              |
              v
lista/adiciona/seleciona N conexoes Moodle (alias + UUID)
              |
              v
registry de sites + conexao escolhida e autorizada
              |
              v
planejador incremental -> background_jobs + contexto Moodle / itens paginados
              |                                  |
              |                                  +-> lease, cursor, retry e retomada
              v
adaptador por conexao -> staging/upsert atomico -> agregados uma vez
```

### Modelo multi-Moodle

O `moodle-conector` e uma referencia para separar conta da aplicacao e conexoes externas, nao um modelo a ser copiado. Na Claris, a conta existe por si so e pode possuir quantas conexoes Moodle forem necessarias. O alias facilita a identificacao humana; o UUID da conexao e obrigatorio e autoritativo em APIs, jobs e autorizacao. Nao existe conexao default ou fallback implicito.

A Claris e o centro operacional: telas, dashboards, risco, Claris/LLM e automacoes leem seu modelo normalizado, sem consultar varios Moodles ao vivo. Os Moodles permanecem a origem autoritativa dos fatos academicos produzidos neles. A Claris preserva proveniencia e frescor, mantem o ultimo snapshot valido em falhas e consolida FIEG/SENAI sem apagar a origem.

Criar/evoluir:

- `moodle_sites`: instalacoes aprovadas pelo administrador, com `id`, `slug`, `name`, `base_url`, `service`, status, release observada e perfil de limites; nao contem dados ou permissoes de uma conta Moodle;
- `user_moodle_connections`: `id`, `user_id`, `moodle_site_id`, `alias`, `moodle_user_id`, perfil externo, username, credencial criptografada, capabilities, `can_write`, reautorizacao, status e timestamps;
- `moodle_site_id` em `courses` e `students`, com unicidade composta `(moodle_site_id, moodle_course_id)` e `(moodle_site_id, moodle_user_id)`;
- proveniencia/frescor nas entidades normalizadas: timestamps de origem/observacao/sync, hash de conteudo e ultima conexao de sync quando aplicavel;
- `moodle_connection_id` em elegibilidade, preferencias de sync, watermarks, caches visiveis e no contexto especializado dos jobs;
- `user_moodle_sync_preferences` por conta/conexao, mantendo risco, LLM e preferencias realmente globais no registro da conta.

Como a aplicacao ainda nao foi publicada, criar diretamente o schema final, sem backfill ou compatibilidade de usuarios. Semear apenas o registry tecnico `fieg`/`senai` e o primeiro administrador por operacao segura; dados locais de desenvolvimento podem ser recriados com fixtures.

### Jornada greenfield de entrada

Conta Claris e conexao Moodle sao duas etapas independentes. O primeiro release usa cadastro fechado por convite, sem `/signup` publico:

1. o primeiro administrador e provisionado por uma operacao segura e auditada, fora do frontend;
2. o administrador cria e acompanha convites em `/admin/users/invitations`;
3. o convidado abre o link, define uma senha exclusiva da Claris e o backend provisiona perfil e papel de forma transacional;
4. a conta consegue entrar, recuperar senha e usar as areas independentes de Moodle mesmo com zero conexoes;
5. no onboarding opcional, o usuario escolhe um site aprovado, informa alias e credenciais Moodle efemeras;
6. o backend valida a conta externa, persiste somente o segredo criptografado quando a reautorizacao estiver habilitada e cria a conexao por UUID;
7. novas conexoes FIEG, SENAI ou futuras sao adicionadas depois pela mesma area autenticada, sempre com selecao explicita e sem conexao default.

Nao existe migracao de usuario, senha, sessao, metadata ou credencial Moodle do prototipo. Antes do primeiro canario, ambientes nao produtivos podem ser recriados e o login Moodle antigo, suas colunas e sua tabela de reautorizacao unica devem ser removidos do schema e do codigo alcancavel.

O job deve aceitar cursos de uma unica conexao. Uma solicitacao com cursos de conexoes diferentes deve criar jobs separados. Isso evita compartilhar token, cache, autorizacao, preferencias ou checkpoints. Concorrencia e circuit breaker de disponibilidade podem ser coordenados por site para proteger a instalacao Moodle inteira.

Desconectar uma conta Moodle desativa seu segredo e impede novos jobs, mas nao apaga em cascata cursos ou alunos do site. A retencao e a limpeza de dados sincronizados seguem politica explicita e auditavel.

Tambem devem ser revisados os pontos que resolvem IDs Moodle fora do sync: mensagens, campanhas, sugestoes de nota, diagnosticos administrativos, Claris e jobs agendados.

## Plano de execucao

### Fase 0 - Baseline e correcoes de bloqueio

- [ ] Instrumentar por chamada: `jobId`, `connectionId`, site, funcao Moodle, tentativa, status, duracao e bytes; nunca token, senha ou URL assinada.
- [ ] Medir um curso pequeno, medio e grande em cada Moodle antes das mudancas.
- [ ] Usar a URL normalizada da conexao em `syncCourses`; remover `PRIMARY_MOODLE_URL`.
- [ ] Remover o log do corpo da resposta de token e enviar credenciais em POST form-encoded quando aceito.
- [ ] Remover o formulario/endpoint `moodle-auth` do prototipo, em vez de corrigir seu fluxo morto.
- [ ] Fechar o desenho greenfield de convite, aceite/definicao de senha, login, recuperacao e logout da conta Claris.
- [ ] Classificar erros em autenticacao, permissao/funcao ausente, rate limit, transiente, payload invalido e persistencia.
- [ ] Nao executar canario SENAI antes do schema final: a URL correta sem escopo por site pode corromper dados por colisao de IDs.

### Fase 1 - Conta Claris e fundacao multi-Moodle

- [ ] Criar `claris_invitations` service-only e provisioning transacional; papel vem do backend e nunca de `user_metadata` do usuario.
- [ ] Criar `/admin/users/invitations` para administradores criarem, reenviarem e revogarem convites sem expor tokens ou links persistidos.
- [ ] Criar `/login`, `/auth/accept-invite`, `/forgot-password`, `/reset-password` e `/onboarding/moodle`; o onboarding pode ser adiado e nao existe `/signup` publico no primeiro release.
- [ ] Configurar redirects allowlisted, templates, expiracao/rate limit, SMTP de staging/producao e um runbook idempotente para provisionar o primeiro administrador.
- [ ] Remover o acoplamento entre `public.users` e identidade Moodle; nome, e-mail e senha Claris nunca sao preenchidos ou sobrescritos pela conexao externa.
- [ ] Criar `moodle_sites` e semear FIEG/SENAI com HTTPS e host exato.
- [ ] Criar `user_moodle_connections` diretamente com alias/capabilities/write gate e suporte a N conexoes; nenhuma credencial Moodle existe antes do onboarding.
- [ ] Criar `moodle_site_id not null` em cursos/alunos e constraints/`onConflict` compostos diretamente no schema final.
- [ ] Atualizar repositories que consultam `moodle_user_id` ou `moodle_course_id` para exigir site; discovery, elegibilidade e acesso do tutor exigem tambem a conexao.
- [ ] Separar preferencias globais das preferencias de sync e impedir que a substituicao do catalogo de uma conexao remova elegibilidade da outra.
- [ ] Incluir `connectionId` na chave canonica, no contexto Moodle e na autorizacao dos jobs, preservando `background_jobs` generico.
- [ ] Expor sites aprovados e conexoes da conta; adicionar, reautorizar, renomear e desconectar somente dentro de uma sessao Claris autenticada. Toda operacao de origem unica exige `connectionId` explicito.
- [ ] Criar leituras consolidadas FIEG/SENAI sobre o banco Claris, com filtros explicitos e indicadores de origem/frescor, sem fan-out Moodle no request.
- [ ] Obter `release`, `version` e `functions` via `core_webservice_get_site_info`; persistir um snapshot de capacidades por conexao.
- [ ] Bloquear URLs arbitrarias e redirects que saiam do host registrado.

### Fase 2 - Reducao de chamadas e gravacoes

- [ ] Paginar `core_enrol_get_enrolled_users` com `limitfrom/limitnumber` (baseline 100), campos minimos e ordenacao estavel por ID.
- [ ] Incluir explicitamente `roles` nos `userfields`. Tratar `groups` e `suspended` como opcionais, pois o Moodle pode omiti-los quando vazios/falsos.
- [ ] Remover a regra "sem papel = aluno" do caminho normal; usa-la apenas como fallback identificado por capability/diagnostico e nunca para remover ou sobrescrever vinculos existentes.
- [ ] Usar o campo `suspended` da listagem principal quando disponivel. Quando omitido, consultar suspensos com `options[0][name]=onlysuspended` e `options[0][value]=1`; remover a variante atual no nivel raiz, que falhou nos dois sites.
- [ ] Evitar `core_user_get_users_by_field` quando a listagem de matriculados ja entregou os campos necessarios.
- [ ] Consultar `gradereport_user_get_grade_items` uma vez por curso (`userid=0`); usar o caminho por estudante apenas quando o Moodle negar o bulk ou o payload exceder o limite definido.
  - Validado no FIEG 5.1.2 e SENAI 4.5.5 com os cursos de teste indicados; a amostra individual retornou a mesma quantidade de itens para 3/3 usuarios em cada site. Falta implementar e cobrir o fallback.
- [ ] Normalizar campos opcionais de nota por release: `grademax` e `percentageformatted` podem estar ausentes; nao converter ausencia em zero ou percentual valido.
- [ ] Buscar conteudo e metadados de atividades uma vez por curso/job e reutilizar em todas as paginas de conclusao.
- [ ] Buscar assignments e quizzes em paralelo e reaproveitar a mesma resposta para atividade e prazo.
- [ ] Executar `core_course_get_updates_since` primeiro em shadow mode contra full sync. So pular entidades depois de provar equivalencia; fazer reconciliacao full periodica e fallback quando a funcao, o watermark ou a resposta forem inadequados.
- [ ] Persistir watermarks por conexao, curso e entidade somente apos commit bem-sucedido.
- [ ] Implementar a task `MSYNC-0407`: classificar cursos em `hot`, `warm`, `cold` e `archived`, com SLAs por entidade administrados pela Claris e reconciliacao full por temperatura.
- [ ] Implementar stale-while-revalidate: toda leitura retorna imediatamente o snapshot Claris e, se stale, pode enfileirar um job sem esperar Moodle.
- [ ] Implementar `request_course_refresh` para um curso/conexao, com cooldown inicial de 60 segundos, deduplicacao atomica e sem parametro `force` para o usuario.
- [ ] Fazer upsert somente de linhas novas/alteradas, preferencialmente por RPC transacional/staging.
- [ ] Gravar snapshot diario e recalcular agregados/risco uma vez ao final do curso ou job.
- [ ] Cachear token por conexao por um TTL curto e invalidar imediatamente em erro de autenticacao.
- [ ] Aplicar retry somente a rede, timeout, `429` e `5xx`, com jitter e `Retry-After`; erros Moodle de parametro/permissao nao devem ser repetidos.

### Fase 3 - Worker curto, retomavel e com backpressure

- [ ] Transformar cada `curso + entidade + pagina` em unidade persistida com cursor, lease e heartbeat.
- [ ] Uma invocacao deve reivindicar poucos itens, executar por no maximo 20-30 segundos, salvar checkpoint e agendar a continuacao.
- [ ] Recuperar automaticamente leases expirados; toda etapa deve ser idempotente.
- [ ] Processar cursos com concorrencia pequena e configuravel por site; dentro do curso, alunos precedem as entidades dependentes.
- [ ] Depois de alunos, atividades e notas podem executar em paralelo limitado quando nao disputarem o mesmo lote de escrita.
- [ ] Implementar circuit breaker por site, nao global, para que falha no SENAI nao pare o FIEG.
- [ ] Finalizar o job somente quando todos os itens estiverem terminais; propagar falhas parciais reais para o DTO.

### Fase 4 - Testes, canario e rollout

- [ ] Criar testes unitarios do adaptador com fixtures 4.5.x e 5.1.x, campos ausentes e respostas de erro.
- [ ] Criar testes de contrato garantindo que a URL/conexao recebida chega a todas as chamadas e chaves de banco.
- [ ] Testar fixtures greenfield com IDs de usuario, curso e atividade deliberadamente iguais nos dois sites.
- [ ] Testar interrupcao apos cada checkpoint, retry, cancelamento e retomada.
- [ ] Executar smoke autenticado somente leitura nos dois Moodles com contas de teste.
- [ ] Testar uma unica conta Claris com N conexoes, inclusive duas conexoes no mesmo site com aliases e contas externas distintas; validar selecao explicita, reautorizacao, desconexao e isolamento de preferencias/cache/elegibilidade.
- [ ] Habilitar primeiro para um grupo canario FIEG; comparar baseline e regressao funcional.
- [ ] Habilitar SENAI por feature flag; ampliar gradualmente depois de dois ciclos de sync sem mistura de dados ou erro silencioso.

## Matriz minima de validacao

| Cenario | FIEG | SENAI | Resultado esperado |
| --- | --- | --- | --- |
| Descoberta de versao/funcoes | Obrigatorio | Obrigatorio | release e capacidades persistidas |
| Convite e aceite Claris | Independente de Moodle | Independente de Moodle | senha definida e perfil/papel provisionados pelo backend |
| Login/recuperacao Claris | Moodle indisponivel | Moodle indisponivel | sessao funciona e resposta de recovery nao enumera e-mail |
| Primeiro onboarding | Obrigatorio | Obrigatorio | conexao adicionada somente depois da sessao Claris |
| Adicionar/reautorizar conexao | Obrigatorio | Obrigatorio | conta Claris preservada; segredo e cache isolados |
| N conexoes e aliases | Obrigatorio | Obrigatorio | selecao explicita por UUID; nenhum fallback implicito |
| Visao consolidada | Obrigatorio | Obrigatorio | leitura somente Claris com origem e frescor por registro |
| Mesmo Moodle ID nos dois sites | Obrigatorio | Obrigatorio | registros internos diferentes |
| Curso com 0, 10, 100 e 500+ alunos | Obrigatorio | Obrigatorio | paginacao completa e sem duplicatas |
| Ativos, suspensos e usuarios sem papel | Obrigatorio | Obrigatorio | classificacao conservadora e auditavel |
| Completion desabilitado/sem permissao | Obrigatorio | Obrigatorio | etapa degradada, nunca sucesso vazio falso |
| Grade bulk permitido/negado | Obrigatorio | Obrigatorio | bulk ou fallback controlado |
| Incremental sem mudancas | Obrigatorio | Obrigatorio | sem upsert massivo; poucas chamadas |
| Snapshot stale | Obrigatorio | Obrigatorio | dados atuais retornados e um refresh enfileirado sem chamada Moodle inline |
| Dez refreshes concorrentes | Obrigatorio | Obrigatorio | um job; demais respostas deduplicadas ou em cooldown |
| Moodle indisponivel no refresh | Obrigatorio | Obrigatorio | ultimo snapshot preservado, stale e erro sanitizado |
| Temperatura e SLA | Obrigatorio | Obrigatorio | relogio controlado prova `hot/warm/cold/archived` e full periodica |
| Token expirado e rate limit | Obrigatorio | Obrigatorio | renovacao/retry limitado e observavel |
| Worker interrompido | Obrigatorio | Obrigatorio | retomada do ultimo checkpoint |

As funcoes minimas a verificar em `siteInfo.functions` sao:

- `core_webservice_get_site_info`;
- `core_enrol_get_users_courses`;
- `core_course_get_categories`;
- `core_enrol_get_enrolled_users`;
- `core_course_get_contents`;
- `core_completion_get_activities_completion_status`;
- `gradereport_user_get_grade_items`;
- `mod_assign_get_assignments`;
- `mod_quiz_get_quizzes_by_courses`;
- `mod_forum_get_forums_by_courses`;
- `core_course_get_updates_since` como otimizacao opcional.

## Metas de aceite

- zero consulta/upsert de entidade Moodle sem site ou conexao resolvida;
- uma conta Claris mantem N conexoes sem alterar sua senha, e-mail, perfil ou sessao ao adicionar/reautorizar um Moodle;
- telas e automacoes leem a Claris; falha Moodle preserva o ultimo snapshot valido e sinaliza desatualizacao;
- zero token, senha ou corpo de autenticacao nos logs;
- notas: `N` chamadas por curso reduzidas para uma no caminho principal;
- atividades/conteudo estatico: uma coleta por curso/job, nao por pagina;
- incremental sem mudancas: reducao de pelo menos 90% nas chamadas e zero regravacao massiva;
- sincronizacao inicial de 100 alunos: reducao de pelo menos 45% nas chamadas usando somente APIs Moodle padrao;
- p95 do tempo total pelo menos 50% menor que o baseline do mesmo site/curso;
- nenhuma invocacao de worker depende de permanecer viva durante o job completo;
- zero chamada Moodle no caminho HTTP de leitura de snapshot, inclusive quando stale;
- pedidos de refresh identicos concorrentes produzem um unico job ativo e respeitam cooldown;
- falha de Moodle ou banco nunca e reportada como sucesso vazio;
- FIEG e SENAI aprovados na mesma suite de contrato e smoke.

## Validacoes restantes para implementacao e staging

As validacoes seguras de contrato em producao foram concluidas. Nao se deve executar teste de carga, falha induzida, token expirado, concorrencia ou interrupcao nos Moodles reais. Durante a implementacao ainda sao necessarios:

- fixtures sanitizados dos contratos observados em Moodle 4.5.x e 5.1.x;
- banco/ambiente de staging com IDs externos deliberadamente colidentes;
- testes automatizados de payload ausente, erro, retry, lease, interrupcao e retomada;
- benchmark controlado com cursos sinteticos de 0, 10, 100 e 500+ alunos;
- verificacao dos limites efetivos do Edge Runtime e ajuste de lote/concorrencia sem pressionar os sites reais;
- canario somente depois do schema greenfield, ciclo de conta Claris e testes de isolamento passarem.

## Referencias

- [Moodle Connector: referencia para multiplas conexoes por alias](https://github.com/Julioall/moodle-conector)
- [Moodle 5.0 External Services](https://moodledev.io/docs/5.0/apis/subsystems/external)
- [Moodle 5.0 Function Definitions](https://moodledev.io/docs/5.0/apis/subsystems/external/functions)
- [Supabase Auth: password-based authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase Auth: invite user by email](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
- [Supabase Auth: custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Edge Functions - Background Tasks](https://supabase.com/docs/guides/functions/background-tasks)
- [Supabase Edge Functions - Limits](https://supabase.com/docs/guides/functions/limits)
