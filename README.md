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
- `VITE_SUPABASE_URL=http://127.0.0.1:54321`

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
- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Supabase Mailpit: `http://127.0.0.1:54324`
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
- carregamento das Edge Functions locais em `supabase/functions/` (ex.: `moodle-api`)

## Validacao rapida

1. Verificar status dos containers:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```

1. Ver logs do runner Supabase:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f supabase
```

1. Verificar function local (retorno esperado: HTTP 400 por falta de campos, provando que a function esta ativa):

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/moodle-api \
  -H "Content-Type: application/json" \
  -d '{"action":"login"}'
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
Edge Functions contra uma stack Supabase local descartavel. A publicacao da
aplicacao e da stack Supabase acontece exclusivamente pelo deploy da VPS.

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
publica a stack completa usando `docker-compose.vps.yml`, Nginx para o build
estatico do frontend e Caddy para HTTPS automatico.

Crie no GitHub o environment `vps` e configure:

Dominios fixos do deploy:

- site: `https://claris.novascript.com.br/`;
- Supabase: `https://api.novascript.com.br/`;
- Evolution: `https://evolution.novascript.com.br/`.

Variables:

- `ACME_EMAIL`: e-mail usado pelo Caddy para os certificados;
- `VPS_APP_DIR` (opcional, padrao `/opt/claris`);
- `VPS_SSH_PORT` (opcional, padrao `22`).

Secrets:

- `VPS_HOST` e `VPS_USER`;
- `VPS_SSH_KEY` (recomendado) ou `VPS_SSH_PASSWORD`;
- `EVOLUTION_API_KEY`;
- `MOODLE_REAUTH_SECRET`;
- `SCHEDULED_MESSAGES_CRON_SECRET`;
- `WEBHOOK_SECRET`.

Todos os segredos da aplicacao devem ser valores aleatorios longos, sem quebras
de linha nem `$`. Exemplo para gerar um valor hexadecimal:

```bash
openssl rand -hex 32
```

Crie registros DNS `A`/`AAAA` para `claris.novascript.com.br`,
`api.novascript.com.br` e `evolution.novascript.com.br`, todos apontando para a VPS, e libere
as portas TCP `80` e `443`, UDP `443` e a porta SSH. Banco, Studio, Mailpit e a
porta direta da Evolution nao sao publicados pelo Compose de VPS.

O deploy ocorre em push para `main` nos arquivos relevantes ou manualmente por
`workflow_dispatch`. O primeiro boot pode levar alguns minutos enquanto o
Supabase baixa imagens e aplica as migrations.

> Importante: o runner atual usa o Supabase CLI, que e adequado para
> desenvolvimento e homologacao. Antes de armazenar dados reais ou abrir o
> sistema para usuarios, migre a camada Supabase para o Compose oficial de
> self-hosting, com chaves proprias, backups e monitoramento.

### Desenvolvimento local

Para as Edge Functions locais, o `docker compose` ja injeta defaults de teste para:

- `MOODLE_REAUTH_SECRET`
- `SCHEDULED_MESSAGES_CRON_SECRET`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `SUPABASE_PUBLIC_URL`
- `WEBHOOK_SECRET`

O runner local copia esses segredos automaticamente para `supabase/functions/.env`, que e o arquivo lido pelo runtime local das Edge Functions.

---

## CI/CD

O repositorio utiliza GitHub Actions (`.github/workflows/ci.yml`) para rodar lint, testes e build automaticamente em cada push ou pull request para a branch `main`.

O unico fluxo de publicacao e
[.github/workflows/deploy-vps.yml](.github/workflows/deploy-vps.yml). O scheduler
de mensagens tambem roda continuamente na VPS pelo container
`claris-scheduled-messages-runner`.

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

- `VITE_SUPABASE_URL` no frontend Docker deve permanecer `http://127.0.0.1:54321` para o ambiente local.
- `SUPABASE_PUBLIC_URL` deve apontar para a URL alcancavel pela Evolution API ao registrar webhooks. No local com Docker Compose, o padrao e `http://127.0.0.1:54321`.
