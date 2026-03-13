# ACTiM

Fluxo local padrao com Docker Compose para subir frontend + Supabase local.

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
2. Ver logs do runner Supabase:
```bash
docker compose logs -f supabase
```
3. Verificar function local (retorno esperado: HTTP 400 por falta de campos, provando que a function esta ativa):
```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/moodle-api \
  -H "Content-Type: application/json" \
  -d '{"action":"login"}'
```

## Parar tudo

```bash
docker compose down
```

## CI/CD

O repositorio utiliza GitHub Actions (`.github/workflows/ci.yml`) para rodar lint, testes e build automaticamente em cada push ou pull request para a branch `main`.

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

- O `.env` do Lovable pode permanecer no repositorio; o Compose nao depende dele para subir local.
- `VITE_SUPABASE_URL` no frontend Docker deve permanecer `http://127.0.0.1:54321`.
