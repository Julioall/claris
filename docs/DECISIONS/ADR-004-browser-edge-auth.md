# ADR-004: Deploy de Edge Functions com `--no-verify-jwt`

Data: `2026-03-26`

## Contexto

Algumas Edge Functions sao chamadas diretamente pelo navegador. O preflight `OPTIONS` precisa ser aceito antes que a autenticacao de negocio seja avaliada.

## Decisao

Publicar essas functions com `--no-verify-jwt` e manter a autenticacao dentro do handler compartilhado com `requireAuth: true`.

## Consequencias

- o browser consegue completar CORS/preflight
- a function continua exigindo usuario autenticado para requests reais
- a validacao fica centralizada e consistente no runtime `_shared/http`

Essa decisao nao significa endpoint publico irrestrito; significa separar preflight de autorizacao de negocio.
