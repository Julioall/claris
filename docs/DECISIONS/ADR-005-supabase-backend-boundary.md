# ADR-005: Edge Functions como fronteira de backend Supabase

Data: `2026-07-21`
Status: Aceita

## Contexto

O frontend acessa tabelas e RPCs do Supabase diretamente em diferentes slices de dominio. Mesmo quando esse acesso esta encapsulado em `api/` ou em um repository TypeScript, o codigo continua executando no navegador e conhece detalhes fisicos do banco, como tabelas, colunas, relacionamentos e filtros PostgREST.

Esse acoplamento distribui autorizacao, composicao de consultas e regras de negocio entre frontend, Edge Functions, RPCs e policies. Tambem dificulta operacoes atomicas e faria uma futura substituicao do backend exigir mudancas extensas no React.

Precisamos organizar a arquitetura atual sem introduzir o backend .NET agora. A solucao intermediaria deve usar os recursos existentes do Supabase e, ao mesmo tempo, criar uma fronteira que possa ser substituida no futuro.

## Decisao

As Edge Functions passam a ser a API e a camada de aplicacao do backend Supabase. O frontend consome casos de uso por contratos HTTP estaveis e deixa de consultar tabelas ou RPCs diretamente.

```text
React
  -> hooks / TanStack Query
    -> clientes de API e DTOs do dominio
      -> Supabase Edge Functions
        -> casos de uso, autenticacao, autorizacao e validacao
          -> repositories / RPCs transacionais
            -> PostgreSQL + RLS
```

A implementacao sera incremental. A existencia temporaria de acessos diretos inventariados nao altera a fronteira escolhida; eles sao divida de migracao, nao um padrao permitido para codigo novo.

### Responsabilidades do frontend

O frontend e responsavel por:

- apresentacao, interacao e estado local de tela
- validacao voltada a experiencia do usuario, sem substituir a validacao server-side
- cache, invalidacao e coordenacao de server state com TanStack Query
- traducao dos DTOs da API em view models quando necessario
- envio do token da sessao ao backend por um adapter compartilhado

O frontend nao deve:

- chamar `supabase.from()` ou `supabase.rpc()`
- conhecer nomes de tabelas, colunas, policies ou funcoes PostgreSQL
- calcular regras de negocio que determinam permissao, elegibilidade, risco ou estado persistido
- coordenar sequencias de escrita que precisam ser atomicas
- enviar o proprio `userId` como fonte de identidade para uma operacao autenticada

Os modulos `src/features/<dominio>/api` representam clientes de casos de uso. O nome `api` nao autoriza acesso direto ao banco.

### Responsabilidades das Edge Functions

As Edge Functions sao responsaveis por:

- autenticar a requisicao e obter a identidade a partir do token
- autorizar o caso de uso e o recurso solicitado
- validar payloads e produzir respostas e erros padronizados
- executar regras de negocio e compor consultas de um ou mais repositories
- iniciar RPCs para operacoes transacionais
- isolar integracoes externas, segredos e credenciais privilegiadas
- aplicar observabilidade, idempotencia e tratamento de falhas quando o caso de uso exigir

Handlers devem permanecer finos. Regras reutilizaveis, repositories, mappers e validadores ficam em modulos compartilhados ou de dominio no backend, sem transformar uma unica function em um monolito.

### Contratos HTTP

Os contratos da API representam intencoes do dominio, e nao operacoes genericas sobre tabelas. Exemplos de formato esperado incluem obter o resumo do dashboard, associar um curso e agendar uma campanha.

Cada contrato deve possuir:

- payload de entrada validado no servidor
- DTO de resposta independente dos tipos gerados do banco
- codigos de status e envelope de erro consistentes
- comportamento de autorizacao documentado e testado
- regra explicita de compatibilidade para alteracoes

Tipos como `Database`, `Tables` e linhas geradas pelo Supabase podem existir na implementacao de persistencia, mas nao fazem parte do contrato com a UI. Mudancas incompativeis exigem versao nova ou periodo de transicao; trocar a implementacao da Edge Function nao deve obrigar o frontend a mudar quando o contrato continua igual.

### Identidade e autorizacao

A identidade do ator vem exclusivamente do token validado pela Edge Function. Casos de uso referentes ao usuario autenticado nao aceitam um `userId` informado pelo navegador como autoridade.

Um identificador de outro usuario so pode fazer parte do payload quando o caso de uso for explicitamente administrativo ou delegado. Nessa situacao, o backend diferencia ator e alvo e verifica a permissao antes de executar a operacao.

O uso de service role nao substitui essa verificacao. Como esse client ignora RLS, ele fica restrito a implementacoes server-side que realmente precisem do privilegio, depois de autenticacao e autorizacao explicitas.

### Banco, RLS e transacoes

RLS permanece habilitado como defesa em profundidade e protege o banco contra acessos fora do caminho esperado. Ela complementa a autorizacao do caso de uso, mas nao define sozinha a API nem substitui as regras da camada de aplicacao.

Aplicam-se as seguintes regras:

- consultas comuns usam o menor privilegio necessario e preservam RLS sempre que possivel
- uma operacao com varias escritas dependentes deve ser executada por uma RPC PostgreSQL atomica, chamada pela Edge Function
- o frontend nunca implementa transacao com sequencias de `delete`, `insert` ou `update`
- efeitos em sistemas externos nao fazem parte da transacao PostgreSQL; esses fluxos precisam de idempotencia, estado persistido e estrategia explicita de retry ou compensacao
- funcoes privilegiadas no banco devem ter permissoes minimas, `search_path` controlado e cobertura de autorizacao

### Excecoes temporarias no navegador

Duas integracoes diretas com o SDK Supabase continuam permitidas, desde que encapsuladas:

1. **Auth:** login, logout, renovacao e observacao da sessao podem usar Supabase Auth por meio do adapter do dominio de autenticacao.
2. **Realtime:** subscriptions podem usar channels por meio de um gateway dedicado quando a atualizacao em tempo real for requisito do produto.

Essas excecoes nao permitem consultas ou mutacoes no banco. O payload recebido por Realtime deve ser tratado como notificacao para invalidar dados obtidos pela API, e nao como um novo contrato de leitura baseado em linhas do banco. Policies continuam obrigatorias para canais expostos.

Uso de Storage ou de outra API direta do Supabase exige uma ADR ou alteracao explicita desta decisao; nao e uma excecao implicita.

## Estrategia de migracao

A transicao segue o padrao Strangler:

1. inventariar e classificar os acessos Supabase existentes no frontend
2. estabelecer runtime, autenticacao, validacao, respostas e cliente HTTP compartilhados
3. migrar um caso de uso por vez para Edge Functions, priorizando regras complexas e escritas nao atomicas
4. manter o contrato do slice e os query keys estaveis sempre que possivel
5. remover o acesso direto migrado e ampliar o guardrail para impedir regressao
6. eliminar tipos de banco da camada de apresentacao

Durante a migracao, codigo legado deve estar identificado no inventario e nao pode ser usado como precedente para novas implementacoes.

## Preparacao para um futuro backend .NET

O backend .NET nao faz parte desta etapa. Quando for adotado, ele implementara os mesmos casos de uso e contratos HTTP hoje atendidos pelas Edge Functions.

A futura Clean Architecture sera uma decisao interna do backend. O frontend nao dependera de EF Core, entidades de dominio, schema PostgreSQL ou detalhes do Supabase; em principio, apenas a configuracao do transporte e da autenticacao precisara mudar.

## Consequencias

### Positivas

- regras de negocio e autorizacao deixam de ser confiadas ao navegador
- operacoes com varias escritas podem ser realmente atomicas
- o schema do banco deixa de ser o contrato publico do frontend
- testes de casos de uso passam a ter uma fronteira backend definida
- a troca futura de implementacao fica concentrada atras dos contratos HTTP

### Custos e riscos

- aumenta a quantidade de Edge Functions e codigo server-side a operar
- algumas telas podem ganhar uma chamada adicional durante a transicao
- contratos duplicados manualmente podem divergir ate existir geracao ou verificacao automatizada
- service role e RPCs privilegiadas exigem revisao de seguranca cuidadosa
- coexistencia temporaria entre caminhos novo e legado exige inventario e guardrails ativos

## Relacao com decisoes anteriores

Esta ADR refina a ADR-001. A organizacao do frontend por dominio permanece, mas `api/`, `application/` e `infrastructure/` deixam de ser fronteiras permitidas para queries diretas ao banco; elas passam a encapsular contratos HTTP e as excecoes de Auth e Realtime descritas aqui.

A ADR-004 continua valida para functions chamadas pelo navegador: `--no-verify-jwt` permite o preflight, enquanto autenticacao e autorizacao permanecem obrigatorias dentro do handler.

## Referencias

- `docs/SUPABASE_BACKEND_SEPARATION_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND_MODULES.md`
- `docs/EDGE_FUNCTIONS.md`
- `docs/SUPABASE_RLS.md`
- `docs/DECISIONS/ADR-001-frontend-domain-boundaries.md`
- `docs/DECISIONS/ADR-004-browser-edge-auth.md`
