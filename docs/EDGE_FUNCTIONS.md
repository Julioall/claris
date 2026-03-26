# Edge Functions

Atualizado em `2026-03-26`.

## Objetivo

As Edge Functions concentram fluxos que nao devem ficar espalhados no frontend:

- integracoes com Moodle e WhatsApp
- operacoes multi-tabela
- jobs e automacoes
- chamadas a provedores de IA
- tarefas que precisam de auditoria, idempotencia ou auth forte

## Estrutura atual

```text
supabase/functions/
  <function-name>/
    index.ts
    payload.ts            # quando a function tem body estruturado
  _shared/
    http/
    db/
    validation/
    domain/
    claris/
    moodle/
    whatsapp/
```

## Convencao recomendada

Para functions novas ou refatoradas, o padrao preferencial e:

- `index.ts`: handler fino, sem regra de negocio extensa
- `payload.ts`: parser/contrato da request
- `service.ts`: orquestracao do caso de uso
- `repository.ts`: acesso a dados e integrações externas
- `mapper.ts`: transformacoes entre payload, banco e resposta

Nem toda function precisa de todos os arquivos, mas `index.ts` deve continuar pequeno.

## Runtime compartilhado

### HTTP

`_shared/http/` oferece:

- `createHandler`
- CORS centralizado
- parsing de body
- respostas padronizadas
- validacao de autenticacao com `requireAuth`

### Banco

`_shared/db/` oferece:

- client com service role quando necessario
- tipos compartilhados entre frontend e functions

### Dominio

`_shared/domain/` concentra repositorios e fluxos reaproveitados por mais de uma function, como:

- bulk messaging
- moodle sync
- task automation
- users

## Autenticacao e browser

O deploy remoto usa `--no-verify-jwt` por design nas functions expostas ao navegador.

Motivo:

- o preflight `OPTIONS` do browser precisa chegar ate o handler compartilhado
- a validacao real continua dentro da function via `createHandler(..., { requireAuth: true })`

Ou seja, a autenticacao nao foi removida; ela foi movida para a camada que tambem consegue responder CORS corretamente.

## Observabilidade minima esperada

Cada function critica deve registrar, de forma consistente quando fizer sentido:

- `user.id`
- nome da function
- latencia
- tipo de erro
- contexto de entrada relevante, sem vazar segredos

O objetivo e permitir troubleshooting de sync, mensageria e IA sem depender de logs difusos no frontend.

## Validacao operacional

Antes de publicar mudancas em functions ou migrations:

1. rodar `npm.cmd run smoke:edge`
2. validar tipos gerados do Supabase
3. atualizar [SUPABASE_RLS.md](./SUPABASE_RLS.md) se houve mudanca de policy
4. manter contratos do payload versionados quando uma function for consumida por mais de um cliente

## Functions chave

- `claris-chat`: loop de IA e ferramentas da Claris
- `bulk-message-send`: criacao e disparo inicial de jobs de envio em massa
- `whatsapp-instance-manager`: operacao das instancias compartilhadas/pessoais
- `moodle-*`: autenticacao e sincronizacao incremental com Moodle
- `data-cleanup`: limpeza orientada pelo backend
