# Benchmark do resumo do dashboard

Atualizado em `2026-07-21`.

O baseline foi capturado no commit `59826e612bd269561bc865e374d10651b9c02433`, antes da remocao de `dashboard.repository.ts`. Foram executados 5 warmups e 30 pares de medicoes sequenciais contra a mesma fixture local. O `fetch` do navegador foi instrumentado para contar requests e bytes de body; a latencia e de ponta a ponta no ambiente local.

| Metrica | Frontend legado | Edge Function | Variacao |
|---|---:|---:|---:|
| Requests do navegador (mediana) | 13 | 1 | -92,3% |
| Body recebido (mediana) | 631 B | 749 B | +18,7% |
| Latencia local p50 | 56,28 ms | 97,94 ms | +74,0% |
| Latencia local p95 | 66,81 ms | 132,16 ms | +97,8% |

O novo caminho elimina 12 round-trips e deixa o navegador independente do schema. Na fixture minima, o envelope V1 e os metadados tornam o body 118 bytes maior, e a orquestracao na Edge Function aumenta a latencia local. Esse custo e aceito nesta etapa em favor da fronteira arquitetural; uma RPC interna pode ser avaliada futuramente se fixtures representativas confirmarem necessidade.

Os resultados normalizados foram identicos para indicadores, IDs de alunos criticos, fila de correcao e feed. As diferencas funcionais intencionais, cobertas por testes, sao:

- semana anterior usa intervalo fechado-aberto `[segunda anterior, segunda atual)`;
- datas de hoje/semana usam `America/Sao_Paulo`;
- alunos em risco sao deduplicados entre cursos;
- atividade exige matricula ativa no par aluno-curso;
- assignment concluido sem submissao real nao entra na fila de correcao;
- `assign` e `assignment` seguem a mesma regra;
- feeds consultados com `service_role` sao explicitamente limitados ao dono ou ao curso/aluno acessivel;
- listas retornam apenas os volumes exibidos pela UI, mantendo os totais nos indicadores.

Limitacao conhecida: `newAtRiskThisWeek` depende de `risk_history`, mas o projeto ainda nao possui um produtor confiavel para todas as transicoes. O endpoint nao fabrica esse dado a partir de `students.updated_at`; retorna zero quando nao ha historico.

Para repetir a medicao do caminho novo, inicie o stack, rode primeiro o smoke para garantir a fixture e execute:

```bash
npm run benchmark:dashboard
```

O resultado bruto desta execucao esta em `dashboard-summary.json`. Latencia nao e gate de CI por depender da maquina; request count, contrato, isolamento e regressao funcional sao gates automatizados.
