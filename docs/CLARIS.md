# Claris

Atualizado em `2026-04-01`.

## Visao Geral

Claris e uma aplicacao web para tutores e monitores acompanharem alunos e cursos integrados ao Moodle.

Responsabilidades principais:

- sincronizar dados academicos do Moodle
- registrar acompanhamento pedagogico (acoes, notas e pendencias)
- classificar risco academico por aluno
- apoiar operacao com automacoes, mensageria e recursos de IA

## Escopo de Produto

O projeto segue em desenvolvimento ativo. As decisoes tecnicas devem priorizar:

- simplicidade operacional
- consistencia de dados
- observabilidade
- evolucao incremental sem complexidade prematura

## Fontes de Dados

| Fonte | Responsabilidade |
| --- | --- |
| Moodle | cursos, alunos, atividades e entregas (fonte primaria academica) |
| Supabase | acompanhamento, cache Moodle, jobs, historico e configuracoes |

Regra operacional: em falha de sync Moodle, a UI deve usar cache local no Supabase e sinalizar possivel desatualizacao.

## Fluxos Funcionais Principais

1. autenticacao e sessao
2. sincronizacao academica (cursos, alunos, atividades)
3. acompanhamento de alunos (pendencias, acoes, notas)
4. classificacao e historico de risco
5. mensageria e campanhas
6. suporte IA (chat Claris e sugestao de feedback/nota)

## Modulos de Dominio (Frontend)

O frontend segue modularizacao por dominio em `src/features/`.

Slices ativos:

- `admin`
- `agenda`
- `auth`
- `background-jobs`
- `campaigns`
- `claris`
- `courses`
- `dashboard`
- `messages`
- `reports`
- `services`
- `settings`
- `students`
- `tasks`
- `whatsapp`

## Niveis de Risco

| Nivel | Cor | Significado |
| --- | --- | --- |
| `normal` | Verde | sem sinais relevantes |
| `atencao` | Amarelo | sinais de alerta |
| `risco` | Laranja | requer intervencao |
| `critico` | Vermelho | urgencia alta |

## Referencias Relacionadas

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [FRONTEND_MODULES.md](./FRONTEND_MODULES.md)
- [auth-architecture.md](./auth-architecture.md)
- [EDGE_FUNCTIONS.md](./EDGE_FUNCTIONS.md)
- [SUPABASE_RLS.md](./SUPABASE_RLS.md)
- [README.md](./README.md)
