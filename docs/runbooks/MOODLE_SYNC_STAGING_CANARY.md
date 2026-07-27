# Runbook — staging e canario da sincronizacao Moodle

Atualizado em `2026-07-26`.

Este runbook encerra os gates externos `MSYNC-0202`, `MSYNC-0703`, `MSYNC-0708`, `MSYNC-0705` e `MSYNC-0706`. Ele nao autoriza alterar Moodle: a aplicacao somente le APIs Moodle durante uma sincronizacao. Carga, falhas induzidas e concorrencia pertencem a um Moodle de staging ou fixture sintetica, nunca aos Moodles FIEG/SENAI publicados.

## Pre-condicoes

- ambiente Claris de staging implantado pelo workflow, com `MOODLE_SYNC_WORKER_CRON_SECRET` aleatorio de pelo menos 32 caracteres;
- `SUPABASE_SITE_URL`, redirects `/auth/accept-invite` e `/reset-password`, SMTP, template, expiracao e rate limit configurados no Supabase Auth de staging;
- administrador Claris temporario e duas conexoes de teste isoladas para FIEG e SENAI/stubs equivalentes;
- nenhum rollout Moodle habilitado antes de iniciar a janela de canario;
- curso e usuarios sinteticos no Moodle de staging para as matrizes 0, 10, 100 e 500+ alunos.

## Preflight somente-leitura

O comando abaixo usa apenas `list_rollouts`, `get_moodle_sync_metrics` e chamadas deliberadamente sem segredo que precisam retornar `401`. Ele nao chama Moodle e nao cria job, usuario, convite, conexao ou flag.

```bash
MOODLE_SYNC_STAGING_URL=https://claris-staging.example \
MOODLE_SYNC_STAGING_PUBLISHABLE_KEY=... \
MOODLE_SYNC_STAGING_ADMIN_JWT=... \
npm run validate:moodle-sync:staging
```

O artefato do comando deve registrar somente os contadores agregados impressos no JSON. Nunca versionar JWT, chave publishable, URL privada, token Moodle, alias, participante, nota ou payload Moodle.

## Gate A — conta Claris

1. Criar convite de staging pelo painel administrativo; confirmar o e-mail recebido e aceitar somente em `/auth/accept-invite`.
2. Definir senha, fazer login, logout, login novamente e recovery em `/reset-password`.
3. Confirmar que convite/recovery expiram e que o rate limit bloqueia repeticoes conforme a configuracao.
4. Adicionar duas conexoes Moodle ao mesmo administrador Claris e alternar a selecao. Nenhum curso, cache, job ou preferencia pode cruzar conexoes.
5. Executar o preflight acima com todos os rollouts desabilitados e arquivar o resultado sanitizado.

## MSYNC-0703 — resiliencia em staging

Usar somente o Moodle fixture/stub de staging para induzir timeout, `429`, `5xx`, token expirado, interrupcao do worker e corrida de finalizacao. Para cada caso, registrar IDs internos de job/item apenas no sistema de observabilidade de staging e verificar:

- timeout/`429`/`5xx`: retries limitados, checkpoint retomado e circuit breaker isolado por site;
- token expirado: conexao fica em reautorizacao, sem retry infinito nem efeito na outra conexao;
- worker interrompido/lease perdida: novo tick recupera o item sem duplicar registros;
- corrida de finalizacao: existe um unico evento terminal e watermark avanca apenas no commit concluido.

Nao induzir nenhuma dessas falhas em `ead.fieg.com.br` ou `ead.senai.br`.

## MSYNC-0708 — benchmark comparativo

Para cada site de staging, executar as matrizes `0`, `10`, `100` e `500+` alunos, com atividades/itens de nota equivalentes ao contrato sintetico. Comparar com a baseline sanitizada e salvar apenas:

- duracao P50/P95 por curso e por item;
- chamadas logicas, bytes processados, retries e itens presos;
- quantidade de lotes, uso de bulk de notas e reuso de metadata estatica;
- decisao de manter ou ajustar budgets, com justificativa.

O benchmark falha se houver aumento de budget sem justificativa ou se o resultado contiver dados academicos, identificadores Moodle externos, token ou payload bruto.

## Gate B — canario FIEG

1. Após Gate A, habilitar explicitamente somente o menor escopo interno FIEG nas flags `worker`, `bulk_grades`, `activity_snapshot` e `delta_shadow`; `delta_skip` permanece desabilitado.
2. Acionar dois ciclos completos por meio do runner publicado e acompanhar `admin-observability` por pelo menos uma lease completa entre ciclos.
3. Executar novamente o preflight com `--allow-enabled-rollouts`; conferir métricas, itens presos, falhas, retries e circuito. Comparar com o benchmark.
4. Em qualquer regressao, desabilitar a flag correspondente; nao apagar job nem alterar Moodle. Confirmar que o snapshot Claris anterior continua disponivel.

## Gate C — canario SENAI

Repetir somente depois de dois ciclos FIEG estaveis e da fixture Moodle 4.5 aprovada. O escopo inicial e um unico usuario/conexao SENAI. Confirmar novamente dois ciclos, retomada de checkpoint, isolamento do circuito e limites do benchmark. Testar rollback por flag antes de ampliar o escopo.

## Evidencia e encerramento

Atualizar `MOODLE_SYNC_IMPLEMENTATION_SPEC.md` apenas com data, ambiente e resultados sanitizados depois de cada gate realmente executado. Os itens externos permanecem desmarcados ate que a evidência esteja arquivada. A publicacao requer ainda backup, rollback documentado e o primeiro administrador provisionado por operacao auditada.
