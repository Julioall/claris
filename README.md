# Claris

Fluxo local padrao com Docker Compose para subir frontend + Supabase local.

## Variaveis de ambiente

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Preencha os valores no `.env` com as credenciais do seu projeto Supabase.

> **Importante:** nunca commite o arquivo `.env`. Ele esta listado no `.gitignore` para evitar vazamentos de credenciais.

## Documentacao

- [docs/ACTIM.md](docs/ACTIM.md): visao funcional e fluxo do produto.
- [docs/MOODLE_API.md](docs/MOODLE_API.md): referencias de integracao com Moodle.
- [docs/SUPABASE_RLS.md](docs/SUPABASE_RLS.md): estado canonico de RLS por dominio no schema local.

## Requisito

- Docker Desktop (com Docker Compose)

## Subir tudo

```bash
docker compose up --build -d
```

Servicos esperados:

- Frontend: `http://127.0.0.1:8080`
- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Supabase Mailpit: `http://127.0.0.1:54324`

Observacao para WhatsApp / Evolution API:

- o compose local usa a imagem oficial `evoapicloud/evolution-api:latest`;
- a imagem antiga `atendai/evolution-api:latest` fica parada na `v2.2.3` e pode deixar `GET /instance/connect/...` preso em `{"count":0}` sem gerar QR Code ou pairing code.

## O que acontece no boot

O container `supabase` executa automaticamente:

- `supabase start` (stack local)
- `supabase migration up --local --include-all` (migrations pendentes)
- `supabase gen types typescript --local --schema public` para regenerar [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts)
- sincronizacao de [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) para [supabase/functions/_shared/db/generated.types.ts](supabase/functions/_shared/db/generated.types.ts)
- carregamento das Edge Functions locais em `supabase/functions/` (ex.: `moodle-api`)

## Validacao rapida

1. Verificar status dos containers:

```bash
docker compose ps
```

1. Ver logs do runner Supabase:

```bash
docker compose logs -f supabase
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

Em push para `main` com mudancas relevantes de `supabase/**`, `.env` ou scripts de deploy, o workflow [.github/workflows/edge-smoke.yml](.github/workflows/edge-smoke.yml) roda o smoke local. Se ele concluir com sucesso, o workflow dedicado [.github/workflows/supabase-deploy.yml](.github/workflows/supabase-deploy.yml) dispara o deploy remoto do Supabase aplicando `db push --include-all` e publicando o conjunto remoto padrao de Edge Functions.

Secrets necessarios no GitHub Actions para esse deploy remoto, configurados no **ambiente `supabase`** (Settings → Environments → supabase):

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PASSWORD`

O ambiente `supabase` e referenciado diretamente pelo job de deploy (`environment: supabase`).

O workflow resolve automaticamente o projeto remoto a partir do secret `SUPABASE_PROJECT_ID` configurado no ambiente `supabase` (veja a secao [Variaveis de Ambiente GitHub Actions / Public Build](#variaveis-de-ambiente-github-actions--public-build) abaixo).

Tambem e possivel disparar manualmente o deploy remoto via `workflow_dispatch` no workflow [.github/workflows/supabase-deploy.yml](.github/workflows/supabase-deploy.yml).

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
docker compose down
```

## Variaveis de Ambiente GitHub Actions / Public Build

Os valores do Supabase usados no build do Vite (`VITE_SUPABASE_*`) **nao devem ser commitados no repositorio**. Configure-os como **secrets** no ambiente `supabase` do GitHub para que os workflows de build e deploy os utilizem automaticamente.

### Onde configurar

Todos os secrets abaixo devem ser adicionados em **Settings → Environments → supabase → Environment secrets**:

| Secret | Descricao |
|---|---|
| `SUPABASE_PROJECT_ID` | ID do projeto Supabase (ex.: `mmddjuiemvywwqspjovg`) |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publica (anon key) do Supabase |
| `SUPABASE_URL` | URL do projeto Supabase (ex.: `https://<project-id>.supabase.co`) |
| `SUPABASE_PUBLIC_URL` | URL publica usada pelas Edge Functions para registrar webhooks externos (ex.: `https://<project-id>.supabase.co`) |
| `SUPABASE_ACCESS_TOKEN` | Token de acesso para deploy via CLI |
| `SUPABASE_PASSWORD` | Senha do banco de dados Supabase |

> O ambiente `supabase` e usado pelo job de **build** e pelo job de **deploy remoto** (`supabase-deploy.yml`). Os secrets sao injetados como variaveis de ambiente com o prefixo `VITE_` necessario para o Vite durante o build.

### Publicacao do build em repositorio publico

O fluxo de CI publica o build otimizado em `Julioall/claris-ia`, mantendo este repositorio como origem privada do codigo-fonte.

- o repositorio publico recebe apenas os artefatos estaticos do `dist/`, sincronizados para `site/`;
- o deploy do GitHub Pages acontece no proprio repositorio publico, por um workflow versionado junto com os artefatos;
- alteracoes manuais no repositorio publico podem ser sobrescritas no proximo deploy.

Para habilitar essa publicacao automatica, adicione no repositorio privado o secret abaixo em **Settings -> Environments -> supabase -> Environment secrets**:

| Secret | Descricao |
|---|---|
| `PUBLIC_BUILD_DEPLOY_TOKEN` | Fine-grained PAT com permissao `Contents: Read and write` no repositorio `Julioall/claris-ia` |

Observacoes:

- se o token nao estiver configurado, o workflow de CI continua validando lint/test/build, mas pula a publicacao no repositorio publico;
- o repositorio `Julioall/claris-ia` precisa ficar com **Settings -> Pages -> Source = GitHub Actions**;
- o build publico continua expondo o JavaScript cliente, entao segredos e logica sensivel devem permanecer no Supabase / Edge Functions, nunca no frontend.

### Desenvolvimento local

Para rodar o projeto localmente, copie `.env.example` para `.env` e preencha com seus valores:

```bash
cp .env.example .env
```

O arquivo `.env` esta no `.gitignore` e **nunca deve ser commitado**.

---

## CI/CD

O repositorio utiliza GitHub Actions (`.github/workflows/ci.yml`) para rodar lint, testes e build automaticamente em cada push ou pull request para a branch `main`.

Em push para `main`, o mesmo workflow pode publicar o build otimizado em `Julioall/claris-ia`, desde que o secret `PUBLIC_BUILD_DEPLOY_TOKEN` esteja configurado. O build de deploy calcula automaticamente o subcaminho do repositorio publico e gera um `404.html` a partir do `index.html` para manter o roteamento do React Router funcionando em refresh e links diretos.

## Supabase Remoto

O fluxo local sobe um Supabase isolado com migrations e Edge Functions locais. Isso nao atualiza automaticamente o projeto Supabase remoto usado por previews do Lovable.

Quando houver mudancas de schema ou de Edge Functions que precisem refletir no projeto remoto, sincronize manualmente o projeto correto.

### Migrations remotas

No PowerShell do Windows, prefira `npm.cmd` por causa da `ExecutionPolicy`.

Antes de sincronizar o projeto remoto, autentique a Supabase CLI com `npm.cmd exec --yes --package supabase@latest -- supabase login` ou exporte `SUPABASE_ACCESS_TOKEN` no ambiente.

```powershell
npm.cmd exec --yes --package supabase@latest -- supabase link --project-ref <project-ref>
npm.cmd exec --yes --package supabase@latest -- supabase db push --include-all
```

### Deploy remoto das Edge Functions

As Edge Functions expostas ao navegador usam tratamento de CORS no runtime compartilhado e continuam validando autenticacao dentro da function. Para que o preflight do browser chegue ate esse handler, o deploy remoto deve usar `--no-verify-jwt`.

Deploy apenas das functions da Claris:

```powershell
npm.cmd run supabase:functions:deploy:claris -- --project-ref <project-ref>
```

Deploy do conjunto remoto padrao versionado no repositorio:

```powershell
npm.cmd run supabase:functions:deploy -- --project-ref <project-ref>
```

Se o projeto ja estiver previamente linkado, reutilize o link atual:

```powershell
npm.cmd run supabase:functions:deploy -- --skip-link claris-llm-test claris-chat
```

### Validacao rapida do preflight

Depois do deploy remoto, valide o preflight da function antes de retestar no Lovable:

```powershell
curl.exe -i -X OPTIONS "https://<project-ref>.supabase.co/functions/v1/claris-llm-test" ^
  -H "Origin: https://<seu-preview>.lovable.app" ^
  -H "Access-Control-Request-Method: POST" ^
  -H "Access-Control-Request-Headers: authorization,apikey,content-type,x-client-info"
```

O retorno esperado e `200` ou `204`, com `Access-Control-Allow-Origin` presente na resposta.

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
