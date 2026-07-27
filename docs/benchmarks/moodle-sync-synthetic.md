# Benchmark sintético da sincronização Moodle

Atualizado em `2026-07-26`.

Este benchmark mede e protege o caminho principal local da sincronização sem abrir conexão de rede. Ele modela um curso com 12 atividades de completion e 8 itens de nota por aluno, exercita a geração de hashes e a montagem dos lotes que o worker usa hoje.

Os cenários versionados são `0`, `10`, `100` e `500+` alunos. Para cada um, o contrato registra limites de tempo e heap, além de limites para:

- chamadas Moodle lógicas;
- chamadas de metadata estática;
- chamadas bulk de notas;
- chamadas de completion por aluno;
- lotes de escrita de completion, notas por atividade e notas do curso.

O resultado não é uma carga contra FIEG ou SENAI: `execution` sempre é `local-synthetic-no-network`, e o runner não aceita URL, credencial ou token. As chamadas são contadores do comportamento esperado do adaptador, não requisições HTTP realizadas.

Execute localmente:

```bash
npm run benchmark:moodle-sync
```

Para investigar somente o maior cenário:

```bash
node scripts/benchmark-moodle-sync.mjs --scenario five-hundred-plus-students
```

O runner falha se uma métrica de chamadas sair do contrato ou se exceder os limites de CPU/memória. O contrato reprodutível fica em [`moodle-sync-synthetic-contract.json`](./moodle-sync-synthetic-contract.json); alterações de algoritmo que mudem o perfil precisam atualizar o contrato e os testes junto com a justificativa.

O objetivo é detectar regressões locais — por exemplo, metadata por página ou retorno ao fallback individual de notas — antes do benchmark de ambiente e dos canários. Ele não substitui o teste de resiliência e de latência real dos Moodles, que continuam sendo gates de staging do Epic 7.
