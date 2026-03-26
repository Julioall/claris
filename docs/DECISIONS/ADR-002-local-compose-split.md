# ADR-002: Compose base + override de desenvolvimento

Data: `2026-03-26`

## Contexto

O `docker-compose.yml` original misturava Supabase runner, frontend e Evolution API em um unico arquivo. Isso dificultava cenarios simples de backend-only e ampliava a dependencia de `network_mode: host`.

## Decisao

Separar em:

- `docker-compose.yml` para a stack base do Supabase local
- `docker-compose.dev.yml` para frontend e integracoes de desenvolvimento

Tambem foi reduzida a dependencia de host networking:

- o runner Supabase continua em host network por exigencia operacional do fluxo local
- a Evolution API passou a rodar em bridge com `ports` e `host.docker.internal`

## Consequencias

- smoke de Edge Functions usa apenas o compose base
- desenvolvimento manual pode subir a stack completa com dois arquivos
- o ambiente local fica mais portavel e mais facil de documentar por cenario
