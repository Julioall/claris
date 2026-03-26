# ADR-003: Publicar build publico em repositorio separado

Data: `2026-03-26`

## Contexto

O codigo-fonte do produto permanece privado, mas existe necessidade de disponibilizar o build estatico publicamente.

## Decisao

Manter:

- repositorio privado como origem do codigo
- repositorio publico apenas para artefatos do build
- sincronizacao automatica via GitHub Actions

## Consequencias

- o historico publico nao expoe o codigo-fonte
- o deploy do site continua automatizado
- qualquer segredo ou logica sensivel deve continuar no Supabase e nas Edge Functions

Essa decisao reforca a separacao entre cliente publico e backend autenticado.
