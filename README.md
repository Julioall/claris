# ACTiM

Fluxo local padrao com Docker Compose para subir frontend + Supabase local.

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

## O que acontece no boot

O container `supabase` executa automaticamente:

- `supabase start` (stack local)
- `supabase migration up --local --include-all` (migrations pendentes)
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

## Observacoes

- O `.env` do Lovable pode permanecer no repositorio; o Compose nao depende dele para subir local.
- `VITE_SUPABASE_URL` no frontend Docker deve permanecer `http://127.0.0.1:54321`.
