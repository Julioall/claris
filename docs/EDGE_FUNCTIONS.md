# Edge Functions

Atualizado em `2026-04-01`.

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

### Estrutura de um caso de uso

```text
supabase/functions/<function-name>/
  index.ts       # adapta HTTP, auth e resposta; nao acessa tabelas
  payload.ts     # interpreta e valida o contrato de entrada
  contract.ts    # DTOs HTTP independentes do schema
  service.ts     # orquestra o caso de uso e regras de aplicacao
  repository.ts  # unico modulo local que conhece Supabase/PostgreSQL
  mapper.ts      # converte modelos de persistencia em DTOs
```

Arquivos podem ser omitidos quando nao agregarem uma responsabilidade real, mas `index.ts` nao deve conter query, regra de negocio nem mapping de linha do banco. Services recebem repositories por parametro para permitir testes sem banco. O piloto completo e `moodle-reauth-settings`.

## Contrato HTTP V1

As APIs chamadas pelo frontend usam a rota do gateway Supabase:

```text
{SUPABASE_URL}/functions/v1/<function-name>
```

Functions usam nomes `kebab-case`. Quando uma function oferece mais de uma operacao, o campo `action` usa `snake_case` e representa uma intencao de dominio, nunca uma operacao generica sobre tabela. Campos JSON usam `camelCase`; datas sao strings ISO-8601 em UTC.

Durante a migracao, o contrato V1 e solicitado pelo header `x-claris-api-version: 1`. Endpoints legados podem manter temporariamente a resposta anterior quando o header nao estiver presente. Codigo novo deve usar exclusivamente V1.

### Respostas

Sucesso:

```json
{
  "data": { "preferenceEnabled": true },
  "correlationId": "4db3732d-67d5-4746-b213-381c46641912"
}
```

Erro:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Payload invalido.",
    "details": { "field": "enabled" },
    "correlationId": "4db3732d-67d5-4746-b213-381c46641912"
  }
}
```

O mesmo `correlationId` e retornado no header `x-correlation-id`. Codigos HTTP representam a classe do resultado; erros funcionais nao devem retornar HTTP 200.

### Paginacao

Requests paginados usam `page` (iniciando em 1), `pageSize` e um objeto opcional `filters`. Respostas usam:

```json
{
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 25,
    "totalCount": 0,
    "totalPages": 0
  },
  "correlationId": "4db3732d-67d5-4746-b213-381c46641912"
}
```

Os tipos compartilhados e helpers opt-in ficam em `_shared/http/contract.ts` e `_shared/http/response.ts`. `moodle-reauth-settings` e o endpoint piloto: clientes legados continuam recebendo o payload antigo, enquanto requests V1 recebem o envelope padronizado.

## Runtime compartilhado

### HTTP

`_shared/http/` oferece:

- `createHandler`
- CORS centralizado
- parsing de body
- respostas padronizadas
- validacao de autenticacao com `requireAuth`
- `correlationId` e logger estruturado por request
- erros tipados com mapeamento consistente de status
- hook opcional de autorizacao do caso de uso

Erros inesperados retornam uma mensagem generica e nunca incluem stack trace ou a mensagem interna. O logger compartilhado filtra metadados com nomes sensiveis e handlers nao devem registrar body, `Authorization`, tokens ou credenciais.

O runtime limita bodies JSON a 10 MiB por padrao antes do parser. Endpoints que transportam midia podem declarar um limite maior explicitamente. `_shared/http/body.ts` oferece leitores estritos para boolean, inteiros com faixa, UUID, data ISO, objetos, arrays, enums e paginacao; JSON malformado ou com shape invalido retorna 400, enquanto campos semanticamente invalidos em contratos V1 retornam 422.

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
- `data-cleanup`: limpeza operacional admin-only, com ordenacao server-side e cobertura ampliada do banco
- `moodle-reauth-settings`: referencia de handler fino com payload, contrato, service, repository e mapper separados

## Nova function: `moodle-grade-suggestions`

Responsavel pela sugestao de nota/feedback com IA e pela aprovacao manual com envio ao Moodle.

### Fluxo

1. `generate_suggestion`
2. resolve curso, aluno e atividade no banco local
3. monta contexto avaliativo a partir do `assign` e de recursos da mesma secao (`file`, `page`, `label` e `folder`)
4. normaliza a submissao do aluno e extrai texto de arquivos suportados
5. chama o provedor configurado em `app_settings.claris_llm_settings`
6. grava auditoria em `ai_grade_suggestion_history`
7. retorna sugestao estruturada para a UI

### Fluxo em lote por atividade

1. `generate_activity_suggestions`
2. resolve a atividade e lista todas as entregas sincronizadas daquela UC
3. monta o contexto avaliativo uma unica vez
4. reaproveita esse contexto para gerar sugestoes por aluno, variando apenas a submissao
5. retorna um conjunto estruturado de resultados para renderizacao inline na aba de atividades

### Aprovacao

1. `approve_suggestion`
2. valida a auditoria e a relacao usuario/curso/aluno
3. envia nota e feedback para `mod_assign_save_grade`
4. atualiza `student_activities`
5. registra status final da aprovacao na auditoria

### Configuracao

- conexao do modelo: `app_settings.claris_llm_settings`
- knobs operacionais: `app_settings.ai_grading_settings`
- imports npm do runtime Deno: `supabase/functions/deno.json`

### Observacoes de operacao

- a function continua autenticada via `createHandler(..., { requireAuth: true })`
- o `config.toml` local usa `verify_jwt = false` apenas para permitir preflight/browser reachability; a validacao real segue dentro do handler
- respostas `null` do Moodle em `mod_assign_save_grade` sao tratadas como validas pelo cliente compartilhado

## Referencias

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SUPABASE_RLS.md](./SUPABASE_RLS.md)
- [README.md](./README.md)
