# Claris

Fluxo local padrao com Docker Compose base para Supabase local e override de desenvolvimento para frontend + integracoes.

## Status do projeto

O Claris **ainda esta em desenvolvimento**.

Para documentacao, planejamento e implementacao tecnica:

- nao assumir operacao em producao com base ativa de usuarios;
- nao priorizar otimizações guiadas por escala real de usuarios;
- favorecer simplicidade, clareza e evolucao incremental de arquitetura;
- registrar premissas e gaps quando uma decisao depender de validacao futura com usuarios reais.

## Variaveis locais

O fluxo local nao depende de `.env`. Os valores de desenvolvimento ficam versionados no `docker-compose.yml` e no `docker-compose.dev.yml`.

Para o frontend local, os valores usados sao:

- `VITE_SUPABASE_PROJECT_ID=local`
- `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`
- `VITE_SUPABASE_URL=http://127.0.0.1:65421`

## Documentacao

- [docs/CLARIS.md](docs/CLARIS.md): visao funcional e fluxo do produto.
- [docs/MOODLE_API.md](docs/MOODLE_API.md): referencias de integracao com Moodle.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): arquitetura atual do app, fronteiras de dominio e seguranca.
- [docs/EDGE_FUNCTIONS.md](docs/EDGE_FUNCTIONS.md): padroes, runtime compartilhado e operacao das Edge Functions.
- [docs/SUPABASE_RLS.md](docs/SUPABASE_RLS.md): estado canonico de RLS por dominio no schema local.
- [docs/auth-architecture.md](docs/auth-architecture.md): separacao atual do modulo de autenticacao, sessao Moodle e sincronizacao.
- [docs/FRONTEND_MODULES.md](docs/FRONTEND_MODULES.md): direcao de modularizacao do frontend por `app/` e `features/`.
- [docs/DECISIONS/](docs/DECISIONS): ADRs com decisoes estruturais do projeto.

## Correcao com IA

A aba de atividades da unidade curricular agora suporta sugestoes assistidas por IA para atividades do tipo `assign`.

- a UI exibe a acao `Corrigir` na linha da atividade, ao lado do expansor de entregas;
- a geracao usa um contexto unico da atividade e produz sugestoes para todas as entregas dos alunos daquela atividade;
- o backend monta contexto da atividade a partir do `assign` e de materiais da mesma secao do Moodle (`file`, `page`, `label` e `folder`);
- a submissao de cada aluno e normalizada com extracao textual de arquivos suportados;
- o professor pode editar nota e feedback em cada linha antes de aprovar manualmente o envio ao Moodle;
- clicar novamente em `Corrigir` regenera as sugestoes dos alunos ainda pendentes de correcao;
- toda geracao/aprovacao fica auditada em `ai_grade_suggestion_history`.

Configuracao:

- conexao com o modelo: `Administracao -> Configuracoes -> Claris IA`
- comportamento da correcao: `Administracao -> Configuracoes -> Correcao com IA`

Observacoes locais:

- a edge function `moodle-grade-suggestions` usa o runtime compartilhado em `supabase/functions/_shared/grade-suggestions/`;
- as imports npm das functions passam por [supabase/functions/deno.json](supabase/functions/deno.json);
- apos mudar codigo de function, reinicie o runtime local do Supabase para recarregar imports e configuracoes.

## Requisito

- Docker Desktop (com Docker Compose)

## Cenarios de compose

Somente Supabase local:

```bash
docker compose -f docker-compose.yml up --build -d
```

Stack completa de desenvolvimento:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

Servicos esperados:

- Frontend: `http://127.0.0.1:8080`
- Supabase API: `http://127.0.0.1:65421`
- Supabase Studio: `http://127.0.0.1:65423`
- Supabase Mailpit: `http://127.0.0.1:65424`
- Evolution API: `http://127.0.0.1:8081` quando o `docker-compose.dev.yml` estiver ativo

Observacao para WhatsApp / Evolution API:

- o compose local usa a imagem oficial `evoapicloud/evolution-api:latest`;
- a imagem antiga `atendai/evolution-api:latest` fica parada na `v2.2.3` e pode deixar `GET /instance/connect/...` preso em `{"count":0}` sem gerar QR Code ou pairing code.

## O que acontece no boot

O container `supabase` executa automaticamente:

- `supabase start` (stack local)
- `supabase migration up --local --include-all` (migrations pendentes)
- `supabase gen types typescript --local --schema public` para regenerar [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts)
- sincronizacao de [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) para [supabase/functions/_shared/db/generated.types.ts](supabase/functions/_shared/db/generated.types.ts)
- sincronizacao dos secrets locais de Edge Functions a partir do `docker-compose.yml` para [supabase/functions/.env](supabase/functions/.env)
- carregamento das Edge Functions locais em `supabase/functions/` (ex.: `moodle-sync-jobs`)

## Validacao rapida

1. Verificar status dos containers:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```

1. Ver logs do runner Supabase:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f supabase
```

1. Verificar function local (retorno esperado: HTTP 401 sem sessao, provando que a function esta ativa):

```bash
curl -i -X POST http://127.0.0.1:65421/functions/v1/moodle-sync-jobs \
  -H "Content-Type: application/json" \
  -d '{"action":"list_active_jobs"}'
```

## Smoke test das Edge Functions

O repositório inclui um smoke test versionado que:

- valida contratos HTTP básicos de payload e autenticação;
- cria ou atualiza um usuário local de teste no Auth;
- semeia dados mínimos no schema público;
- executa uma chamada autenticada até a camada de serviço da function `generate-automated-tasks`.

No Windows, prefira:

```bash
npm.cmd run smoke:edge
```

Alternativamente:

```bash
node scripts/smoke-edge-functions.mjs
```

Em push com mudancas relevantes, o workflow
[.github/workflows/edge-smoke.yml](.github/workflows/edge-smoke.yml) valida as
Edge Functions contra uma stack Supabase local descartavel. O frontend e
publicado na VPS; a publicacao de migrations e Edge Functions no Supabase
gerenciado e uma operacao separada, deliberada e autorizada.

## Tornar o smoke obrigatório na main

O check esperado para proteção da branch principal é o job `Smoke test local Edge Functions` do workflow [.github/workflows/edge-smoke.yml](.github/workflows/edge-smoke.yml).

Há um helper versionado que detecta `origin` e a branch padrão remota automaticamente.

Pré-requisito:

- um token do GitHub com permissão de repositório `Administration: write` em `GITHUB_TOKEN`;
- a branch já estar com branch protection habilitada no GitHub.

Auditar o estado atual:

```bash
npm.cmd run branch-protection:edge-smoke
```

Aplicar o required status check no PowerShell:

```powershell
$env:GITHUB_TOKEN = ''
npm.cmd run branch-protection:edge-smoke:apply
```

Variáveis opcionais:

- `GITHUB_BRANCH` para sobrescrever a branch alvo;
- `GITHUB_OWNER` e `GITHUB_REPO` para sobrescrever o remoto detectado;
- `GITHUB_REQUIRED_CHECK` para sobrescrever o nome do check exigido.

## Parar tudo

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Deploy na VPS

O workflow [`.github/workflows/deploy-vps.yml`](.github/workflows/deploy-vps.yml)
publica somente o frontend estatico na VPS, usando Nginx no container da
aplicacao. O HTTPS e a entrada publica ficam no Caddy central do
`moodle-conector`, que encaminha `claris.novascript.com.br` pela rede Docker
externa compartilhada. Banco, Auth, Storage, Realtime e Edge Functions ficam no
projeto gerenciado da conta Supabase; a VPS nao sobe Supabase, runners de Edge
Functions, Postgres, Evolution ou um proxy para a API.

Crie no GitHub o environment `vps` e configure:

Variables:

- `APP_DOMAIN` (opcional; padrao `claris.novascript.com.br`);
- `PUBLIC_PROXY_NETWORK` (opcional; padrao `novascript-proxy`), a rede Docker
  externa criada e atendida pelo `moodle-conector`;
- `SUPABASE_URL`: URL HTTPS do projeto hospedado, por exemplo `https://<project-ref>.supabase.co`;
- `SUPABASE_PUBLISHABLE_KEY`: chave publishable/anon do mesmo projeto;
- `VPS_APP_DIR` (opcional, padrao `/opt/claris`);
- `VPS_SSH_PORT` (opcional, padrao `22`).

Secrets:

- `VPS_HOST` e `VPS_USER`;
- `VPS_SSH_KEY` (recomendado) ou `VPS_SSH_PASSWORD`;
- `MOODLE_SYNC_WORKER_CRON_SECRET` somente se o workflow agendado de sincronizacao Moodle for usado.

O build recebe `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` apenas no
GitHub Actions. Nenhuma service-role key, segredo Moodle, senha de banco ou
credencial da Evolution e enviada para a VPS.

Crie o DNS de `APP_DOMAIN`, sem `https://`, apontando para a VPS. As portas TCP
`80` e `443`, UDP `443` e a porta SSH sao atendidas pelo Caddy do
`moodle-conector`; o Claris nao publica portas. Nao crie `api.*` nem
`evolution.*` na VPS: o navegador chama diretamente o projeto Supabase hospedado.

Antes do primeiro deploy Claris, publique o `moodle-conector` com
`CLARIS_DOMAIN=claris.novascript.com.br` e
`PUBLIC_PROXY_NETWORK=novascript-proxy`. Depois publique o Claris; seu container
entra nessa rede e o Caddy central resolve `claris-frontend` internamente.

No painel Supabase, configure `Site URL` para `https://<APP_DOMAIN>` e inclua:

- `https://<APP_DOMAIN>/auth/accept-invite`;
- `https://<APP_DOMAIN>/reset-password`.

Tambem configure SMTP, templates e rate limits no Supabase Auth antes de usar
convites ou recuperacao de senha.

### Backend Supabase gerenciado

Migrations e Edge Functions nao sao aplicadas pela VPS. O workflow
[`deploy-supabase.yml`](.github/workflows/deploy-supabase.yml) publica Edge
Functions quando houver alteracao em `supabase/functions/` na `main` e usa o
environment protegido `vps`.

Configure no environment `vps`:

- Variable `SUPABASE_PROJECT_REF`: o project ref da conta Supabase hospedada;
- Secret `SUPABASE_ACCESS_TOKEN`: token pessoal criado no painel Supabase;
- Secret `SUPABASE_DB_PASSWORD`: senha do banco remoto, usada somente quando
  uma migration for solicitada.

Migrations nunca sao aplicadas automaticamente em `push`. Para aplica-las,
dispare manualmente o workflow e marque `apply_migrations`; ele mostra o plano
com `supabase db push --dry-run` antes de executar `supabase db push --yes`.
Nao usa seed nem comandos de reset e nao altera secrets de Edge Functions.

As configuracoes operacionais das functions, como
`MOODLE_SYNC_WORKER_CRON_SECRET`, continuam sendo cadastradas no painel
Supabase (ou por um procedimento explicito separado) e nao ficam no
repositorio nem no workflow de deploy.

O deploy de frontend ocorre em push para `main` nos arquivos relevantes ou por
`workflow_dispatch`. A VPS recebe somente `dist`,
`Dockerfile.frontend.production` e `docker-compose.vps.yml`.

### Sincronizacao Moodle sem VPS backend

O workflow [`.github/workflows/moodle-sync-runner.yml`](.github/workflows/moodle-sync-runner.yml)
executa dispatcher e worker a cada cinco minutos contra as Edge Functions do
Supabase gerenciado. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e o
mesmo `MOODLE_SYNC_WORKER_CRON_SECRET` tanto no environment `vps` do GitHub
quanto nos secrets das Edge Functions do projeto Supabase. Ele nao habilita
rollout Moodle: as flags continuam deny-by-default.

Evolution permanece no codigo, mas o build de producao fixa
`VITE_EVOLUTION_ENABLED=false` e nenhum container Evolution e iniciado. Para
reativa-la no futuro, sera preciso provisionar o provedor e criar um deploy
proprio para ele; mudar somente a flag visual nao e suficiente.

### Desenvolvimento local

Para as Edge Functions locais, o `docker compose` de desenvolvimento ainda injeta defaults de teste para:

- `MOODLE_REAUTH_SECRET`
- `MOODLE_SYNC_WORKER_CRON_SECRET`
- `SCHEDULED_MESSAGES_CRON_SECRET`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_ENABLED`
- `SUPABASE_PUBLIC_URL`
- `WEBHOOK_SECRET`

O runner local copia esses segredos automaticamente para `supabase/functions/.env`, que e o arquivo lido pelo runtime local das Edge Functions.

---

## CI/CD

O repositorio utiliza GitHub Actions (`.github/workflows/ci.yml`) para rodar lint, testes e build automaticamente em cada push ou pull request para a branch `main`.

O frontend e publicado por
[.github/workflows/deploy-vps.yml](.github/workflows/deploy-vps.yml). O backend
e os agendamentos residem no Supabase gerenciado: o tick Moodle esta em
[.github/workflows/moodle-sync-runner.yml](.github/workflows/moodle-sync-runner.yml)
e requer `MOODLE_SYNC_WORKER_CRON_SECRET` com pelo menos 32 caracteres. Ele nao
habilita Moodle por si so: `moodle_sync_rollouts` permanece deny-by-default ate
que um canario seja liberado por site e, quando aplicavel, por usuario.

### GITHUB_TOKEN

O `GITHUB_TOKEN` e um token de acesso temporario **gerado automaticamente pelo GitHub** para cada execucao de workflow. Voce **nao precisa criar nem configurar** nenhum segredo manualmente para usa-lo.

Para referenciar o token dentro de um workflow, use:

```yaml
${{ secrets.GITHUB_TOKEN }}
```

**Exemplo de uso em um step:**

```yaml
- name: Publicar artefato
  run: |
    curl -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
         https://api.github.com/repos/${{ github.repository }}/releases
```

As permissoes do token sao controladas pelo campo `permissions` no arquivo de workflow. O workflow atual usa permissao minima de leitura:

```yaml
permissions:
  contents: read
```

Para acoes que exigem escrita (ex.: criar releases, fazer deploy no GitHub Pages), ajuste as permissoes conforme necessario:

```yaml
permissions:
  contents: write
  pages: write
  id-token: write
```

> **Onde visualizar o token nas configuracoes do repositorio?**
> Acesse **Settings → Secrets and variables → Actions**. O `GITHUB_TOKEN` e gerenciado pelo proprio GitHub e nao aparece listado ali, pois e gerado automaticamente. Os segredos que voce cadastrar manualmente (ex.: chaves de API externas) apareceram nessa tela.

## Observacoes

- `VITE_SUPABASE_URL` no frontend Docker deve permanecer `http://127.0.0.1:65421` para o ambiente local.
- `SUPABASE_PUBLIC_URL` deve apontar para a URL alcancavel pela Evolution API ao registrar webhooks. No local com Docker Compose, o padrao e `http://127.0.0.1:65421`.
