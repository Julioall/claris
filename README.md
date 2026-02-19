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

## Observacoes

- O `.env` do Lovable pode permanecer no repositorio; o Compose nao depende dele para subir local.
- `VITE_SUPABASE_URL` no frontend Docker deve permanecer `http://127.0.0.1:54321`.

## Testes

### Testes Unitários

Execute os testes unitários com Vitest:

```bash
npm run test        # Executar testes uma vez
npm run test:watch  # Executar testes em modo watch
```

### Testes End-to-End (E2E)

Os testes E2E utilizam Playwright para testar a aplicação completa.

```bash
npm run test:e2e        # Executar todos os testes E2E
npm run test:e2e:ui     # Executar com interface gráfica
npm run test:e2e:headed # Executar com navegador visível
npm run test:e2e:debug  # Executar em modo debug
```

Para mais informações sobre os testes E2E, consulte a [documentação dos testes](./e2e/README.md).
