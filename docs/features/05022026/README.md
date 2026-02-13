# Documentação de Features

## 📚 Índice de Documentação

Esta pasta contém documentação detalhada de features implementadas no projeto ACTiM.

---

## 🎯 Feature: Geração Automática de Pendências de Correção

Implementa criação automatizada de tarefas de pendência a partir de atividades do Moodle elegíveis.

### 📖 Documentos da Feature

| Documento | Propósito | Público |
|-----------|-----------|---------|
| [PENDING_TASKS_GENERATION.md](PENDING_TASKS_GENERATION.md) | **Visão Geral** - O que é a feature, componentes, como funciona | Product Managers, QA |
| [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) | **Como Migrar** - Mudanças no banco, incompatibilidades, testes | Ops, DBAs |
| [API_REFERENCE.md](API_REFERENCE.md) | **API Technical** - Endpoints, payloads, códigos de erro | Frontend Devs, Integrators |
| [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) | **Arquitetura** - Diagrama de sistema, fluxo de dados, performance | Backend Devs, Architects |

---

## 🚀 Quick Start

### Para Product Managers
👉 Leia: [PENDING_TASKS_GENERATION.md](PENDING_TASKS_GENERATION.md)
- Entenda o objetivo da feature
- Veja o fluxo de uso
- Conheça as funcionalidades

### Para QA/Testers
👉 Leia: [PENDING_TASKS_GENERATION.md](PENDING_TASKS_GENERATION.md#-como-testar)
- Como testar a geração
- Casos de teste
- Critérios de aceitação

### Para Frontend Developers
👉 Leia: [API_REFERENCE.md](API_REFERENCE.md)
- Endpoints disponíveis
- Payloads esperados
- Exemplos de código React

### Para Backend/DevOps
👉 Leia: [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md)
- Diagrama de sistema
- Índices de banco
- Performance
- Deployment

### Para Database Administrators
👉 Leia: [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
- Schema changes
- Migrações
- Impacto no banco

---

## 📋 Conteúdo por Documento

### 1. PENDING_TASKS_GENERATION.md
**Seções:**
- Visão Geral
- Objetivo
- Componentes Implementados (DB, Backend, Frontend, UI, Types)
- Fluxo de Dados
- Tecnologias Usadas
- Como Testar
- Dados Sincronizados
- Segurança
- Próximos Passos

**Melhor para:** Entender o big picture da feature

---

### 2. MIGRATION_GUIDE.md
**Seções:**
- Résumé Executivo
- Mudanças no Banco (3 migrações)
- Mudanças no Frontend (React Query v5, 5 hooks)
- Mudanças na Sincronização (Moodle API)
- Arquivos Criados
- Segurança (RLS)
- Testes Executados
- Notas Importantes
- Dependencies
- Checklist Pré-Deploy

**Melhor para:** Implementar migração ou upgrade

---

### 3. API_REFERENCE.md
**Seções:**
- Endpoints (generate-pending-tasks, pending-tasks-preview, moodle-api)
- Estrutura de Dados (tabelas)
- Segurança & RLS
- Rate Limiting
- Tratamento de Erros
- Performance & Índices
- Fluxo Completo de Integração
- Exemplos de Código (cURL, TypeScript)
- Testing

**Melhor para:** Integrar ou consumir as APIs

---

### 4. TECHNICAL_ARCHITECTURE.md
**Seções:**
- Visão Geral da Arquitetura (diagrama)
- Fluxo de Dados - Caso de Uso Completo (5 fases)
- Segurança por Camada
- Performance & Índices
- Modelo de Dados ERD
- State Management (React Query)
- Deployment Checklist
- Métricas de Monitoramento
- Troubleshooting

**Melhor para:** Entender a arquitetura técnica completa

---

## 🔄 Fluxo de Leitura Recomendado

### Primeiro Acesso (15 min)
1. [PENDING_TASKS_GENERATION.md](PENDING_TASKS_GENERATION.md) - Visão Geral (5 min)
2. [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md#-visão-geral-da-arquitetura) - Diagrama (5 min)
3. [PENDING_TASKS_GENERATION.md](PENDING_TASKS_GENERATION.md#-como-testar) - Como Testar (5 min)

### Implementação (2 horas)
1. [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) - Arquitetura completa (45 min)
2. [API_REFERENCE.md](API_REFERENCE.md) - APIs em detalhes (45 min)
3. [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Mudanças (30 min)

### Deployment (1 hora)
1. [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md#-checklist-de-validação-pré-deploy) - Checklist (15 min)
2. [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md#-deployment-checklist) - Deployment steps (30 min)
3. [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md#-troubleshooting) - Troubleshooting prep (15 min)

---

## 🎓 Exemplos por Persona

### "Quero implementar a feature no meu projeto"
```
1. PENDING_TASKS_GENERATION.md → Entender o que é
2. MIGRATION_GUIDE.md → Ver exemplos de código
3. TECHNICAL_ARCHITECTURE.md → Entender a arquitetura
4. API_REFERENCE.md → Implementar integrações
```

### "Preciso debugar um problema em produção"
```
1. TECHNICAL_ARCHITECTURE.md → Entender o fluxo
2. TECHNICAL_ARCHITECTURE.md#troubleshooting → Diagnóstico
3. API_REFERENCE.md#tratamento-de-erros → Códigos de erro
4. MIGRATION_GUIDE.md → Verificar banco
```

### "Vou fazer manutenção no código"
```
1. TECHNICAL_ARCHITECTURE.md → Entender a arquitetura
2. API_REFERENCE.md → Ver interfaces
3. MIGRATION_GUIDE.md → Ver mudanças
4. PENDING_TASKS_GENERATION.md → Context de negócio
```

### "Preciso otimizar performance"
```
1. TECHNICAL_ARCHITECTURE.md#performance--índices → Índices atuais
2. TECHNICAL_ARCHITECTURE.md#query-listagem → Análise de queries
3. TECHNICAL_ARCHITECTURE.md#métricas-de-monitoramento → Métricas
```

---

## 💾 Arquivos Relacionados

### Na Pasta `/docs`
- [DOCUMENTACAO.md](../DOCUMENTACAO.md) - Schema de banco de dados completo
- [HANDOFF.md](../HANDOFF.md) - Documentação geral da arquitetura
- [IMPLEMENTACAO_API_EXTERNA_E_DOCKER.md](../IMPLEMENTACAO_API_EXTERNA_E_DOCKER.md) - Setup do projeto

### No Código
- `supabase/functions/generate-pending-tasks/index.ts` - Implementação
- `supabase/functions/moodle-api/index.ts` - Sync atualizado
- `src/pages/PendingTasks.tsx` - Página principal
- `src/components/actions/NewPendingTaskDialog.tsx` - Modal de criação
- `src/hooks/usePendingTasks*.ts` - (5 hooks)
- `src/types/index.ts` - Tipos TypeScript

---

## 🔧 Manutenção dessa Documentação

### Como Atualizar

Quando há mudanças na feature:

1. **Schema/Banco** → Atualizar [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
2. **API Endpoints** → Atualizar [API_REFERENCE.md](API_REFERENCE.md)
3. **Fluxo de Dados** → Atualizar [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md)
4. **Componentes UI** → Atualizar [PENDING_TASKS_GENERATION.md](PENDING_TASKS_GENERATION.md)

### Versionamento

Adicione quando houver mudanças incompatíveis:

```markdown
## Histórico de Versões

### v2.0 (2025-02-XX)
- Adiciona notificações automáticas
- Breaking: endpoints renomeados
- Migration: 20250220_v2_notifications.sql

### v1.0 (2025-02-05)
- Feature inicial implementada
```

---

## ❓ FAQ

**P: Por onde começo?**
R: Leia [PENDING_TASKS_GENERATION.md](PENDING_TASKS_GENERATION.md) para visão geral, depois escolha seu caminho baseado na persona acima.

**P: Qual é a compatibilidade com React Query?**
R: React Query v5+ é obrigatório. Veja [MIGRATION_GUIDE.md#atualização-de-hooks-react-query-v5](MIGRATION_GUIDE.md) para detalhes.

**P: Como fazer deploy em produção?**
R: Veja [TECHNICAL_ARCHITECTURE.md#-deployment-checklist](TECHNICAL_ARCHITECTURE.md#-deployment-checklist)

**P: O que acontece se tiver atividade duplicada?**
R: UNIQUE constraint na tabela `pending_tasks` previne duplicatas. Veja [API_REFERENCE.md#regras-de-negócio](API_REFERENCE.md)

**P: Como debuga um erro 403 Forbidden?**
R: Verifique RLS em [TECHNICAL_ARCHITECTURE.md#camada-2-rls-row-level-security](TECHNICAL_ARCHITECTURE.md#camada-2-rls-row-level-security)

---

## 📞 Contato

Para dúvidas sobre esta documentação, consulte:
- [HANDOFF.md](../HANDOFF.md) - Documento principal do projeto
- Código-fonte nos arquivos referenciados
- Commits git com histórico de implementação

---

**Última atualização:** 2025-02-05  
**Versão da Feature:** 1.0  
**Status:** ✅ Completo e Testado
