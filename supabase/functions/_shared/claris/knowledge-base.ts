/**
 * Claris Platform — Knowledge Base
 * Structured documentation about the platform, its features, workflows,
 * and best practices. Used by the get_platform_help tool so that
 * Claris IA can answer user questions about the platform itself.
 */

export interface KnowledgeSection {
  id: string
  title: string
  content: string
  keywords: string[]
}

export const KNOWLEDGE_BASE: KnowledgeSection[] = [
  // -----------------------------------------------------------------------
  // OVERVIEW
  // -----------------------------------------------------------------------
  {
    id: 'overview',
    title: 'Visão Geral da Plataforma Claris',
    keywords: ['visão geral', 'o que é', 'plataforma', 'overview', 'apresentação', 'introdução'],
    content: `
A Claris é uma plataforma de acompanhamento acadêmico voltada para tutores, monitores, analistas pedagógicos e gestores de cursos EAD. Ela centraliza dados do Moodle e do histórico de acompanhamento para ajudar as equipes a identificar riscos acadêmicos, organizar intervenções e comunicar com os alunos de forma estruturada.

**Principais recursos:**
- Dashboard com visão consolidada de risco, tarefas e atividades
- Gestão de alunos com classificação de risco (Normal, Atenção, Risco, Crítico)
- Gestão de tarefas pedagógicas com vínculo a alunos, cursos e UCs
- Agenda integrada para web aulas, alinhamentos e compromissos
- Envio de mensagens individuais e em lote via WhatsApp
- Claris IA — assistente inteligente integrado para análise, sugestões e automação

**Sincronização com o Moodle:**
Os dados de cursos, turmas, alunos, notas e atividades são importados do Moodle via sincronização. Se a sincronização estiver desatualizada, os dados exibidos podem estar desatualizados. A Claris IA sempre indica quando estiver usando dados em cache.
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // NAVIGATION
  // -----------------------------------------------------------------------
  {
    id: 'navigation',
    title: 'Navegação e Páginas da Plataforma',
    keywords: ['navegação', 'menu', 'páginas', 'seções', 'onde fica', 'acessar', 'navegar', 'relatórios'],
    content: `
A plataforma possui as seguintes seções acessíveis pelo menu lateral:

**Dashboard (Início)**
Tela inicial com resumo operacional: contagem de alunos por nível de risco, tarefas abertas, atividades aguardando correção e sugestões proativas da Claris IA. É o ponto de partida recomendado para iniciar o dia.

**Alunos**
Lista de todos os alunos vinculados ao tutor/monitor. Permite filtrar por risco, curso ou status. Ao clicar em um aluno, é possível ver o perfil completo: dados, notas, frequência, tarefas e histórico de acompanhamento.

**Tarefas**
Gestão de tarefas pedagógicas: acompanhamentos, contatos, revisões, checklists. Cada tarefa pode ser vinculada a um aluno, curso ou UC específica. É possível criar, atualizar e acompanhar o progresso das tarefas.

**Agenda**
Calendário de compromissos: web aulas, reuniões de alinhamento, entregas e eventos recorrentes. Permite planejar a rotina da semana e visualizar os próximos compromissos.

**Mensagens**
Central de comunicação com alunos via WhatsApp. Suporta envio individual e em lote com templates de mensagens. Inclui histórico de contatos e status de entrega.

**Relatórios**
Exportação de dados acadêmicos em Excel: atividades, notas, matrículas e totais por curso. Use para análise externa ou apresentações à coordenação.

**Automações**
Ferramentas de automação: envios em lote programados, rotinas recorrentes e agendamentos de mensagens em massa.

**Claris IA**
Assistente de IA integrado em tela cheia. Disponível também como widget flutuante em todas as páginas. Responde perguntas, analisa dados, sugere ações e executa tarefas no sistema.

**Administração (apenas admins)**
Configurações globais do sistema: gestão de usuários, configuração da Claris IA, feature flags e suporte.
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // RISK LEVELS
  // -----------------------------------------------------------------------
  {
    id: 'risk-levels',
    title: 'Níveis de Risco Acadêmico',
    keywords: ['risco', 'nível de risco', 'normal', 'atenção', 'crítico', 'classificação', 'cores'],
    content: `
A Claris classifica cada aluno em quatro níveis de risco para priorizar o acompanhamento:

**Normal (Verde)**
Aluno sem sinais de problema. Frequência regular, notas adequadas e engajamento nas atividades. Acompanhamento de rotina é suficiente.

**Atenção (Amarelo)**
Sinais iniciais de alerta: queda de notas, diminuição de frequência ou redução no engajamento. Recomenda-se monitoramento mais próximo e contato preventivo.

**Risco (Laranja)**
Situação preocupante: notas abaixo do mínimo, faltas acumuladas ou prazo de atividades críticas vencendo. Intervenção necessária — entre em contato com o aluno e registre um acompanhamento.

**Crítico (Vermelho)**
Situação urgente: risco de reprovação iminente, abandono ou desengajamento total. Ação imediata obrigatória — contato com o aluno e notificação da coordenação/gestão.

**Como alterar o risco de um aluno:**
Acesse o perfil do aluno em Alunos, clique no indicador de risco e selecione o novo nível. Registre sempre o motivo da mudança para histórico.

**Dica da Claris IA:**
Peça "Quais alunos precisam de atenção hoje?" para receber uma lista priorizada com os alunos em risco mais crítico.
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // STUDENT MONITORING WORKFLOW
  // -----------------------------------------------------------------------
  {
    id: 'student-monitoring-workflow',
    title: 'Fluxo de Acompanhamento de Alunos',
    keywords: ['fluxo', 'acompanhamento', 'workflow', 'como monitorar', 'rotina', 'tutor', 'monitor'],
    content: `
O fluxo recomendado para acompanhamento de alunos na Claris é:

**1. Verificação diária (Dashboard)**
- Acesse o Dashboard ao iniciar o dia
- Verifique o resumo de risco e tarefas abertas
- A Claris IA mostrará sugestões proativas com base nos dados do dia

**2. Revisão de alunos em risco**
- Acesse Alunos → filtre por "Risco" ou "Crítico"
- Para cada aluno em risco, acesse o perfil e verifique: notas, frequência, última atividade e histórico de contato
- Peça à Claris IA: "Resumo do aluno [nome]" para uma análise completa

**3. Registrar intervenção**
- Crie uma tarefa de acompanhamento vinculada ao aluno (ex.: "Contato de recuperação — João Silva")
- Use a Claris IA para rascunhar a mensagem de contato
- Envie via Mensagens (individual ou lote)

**4. Acompanhar evolução pelo Histórico**
- Acesse o perfil do aluno → aba **Histórico** para ver a linha do tempo de sincronizações
- O histórico mostra: nível de risco, último acesso, atividades pendentes e atrasadas em cada sincronização
- Use a Claris IA: "Histórico do aluno [nome]" para analisar tendências e avaliar se as intervenções surtiram efeito
- Alunos sem acesso há mais de 90 dias são classificados como possíveis **desistentes** — acione a escola para atualizar o registro na plataforma

**5. Correção de atividades**
- Acesse Tarefas ou peça à Claris IA: "Atividades aguardando correção"
- Priorize atividades com prazo vencendo
- Registre o feedback para o aluno

**6. Encerramento do dia**
- Use a Claris IA para gerar um checklist do que ficou pendente
- Programe lembretes para o próximo dia via Agenda ou Tarefas
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // TASKS
  // -----------------------------------------------------------------------
  {
    id: 'tasks',
    title: 'Gestão de Tarefas Pedagógicas',
    keywords: ['tarefas', 'criar tarefa', 'pendências', 'prioridade', 'gestão de tarefas', 'task', 'kanban'],
    content: `
As tarefas na Claris representam ações pedagógicas que o tutor/monitor precisa executar.

**Tipos comuns de tarefas:**
- Contato com aluno em risco
- Correção de atividade ou SAP
- Preparação de web aula
- Alinhamento de turma
- Checklist de abertura de UC
- Follow-up de recuperação

**Campos de uma tarefa:**
- **Título**: descrição curta e objetiva (ex.: "Contato de acompanhamento — Maria Santos")
- **Descrição**: detalhes da ação, contexto ou roteiro
- **Prioridade**: Baixa, Média, Alta, Urgente
- **Prazo**: data limite para execução
- **Vínculo**: aluno, curso, UC ou classe relacionada
- **Status**: A Fazer, Em andamento, Concluída
- **Tags**: rótulos de categorização (ex.: recuperacao, risco, uc)

**Visualizações disponíveis:**
- **Lista (padrão)**: todas as tarefas em ordem de prazo/prioridade
- **Kanban**: colunas organizadas por status (A Fazer / Em andamento / Concluída) — alterne pelo botão no cabeçalho da página

**Criando tarefas com a Claris IA:**
- "Crie uma tarefa para contatar o aluno João Silva, risco crítico, prazo amanhã"
- "Gere um checklist de abertura para a UC de Matemática"
- "Crie tarefas de acompanhamento para os 5 alunos mais críticos do Curso de Administração"
- "Liste minhas tarefas do aluno Maria Santos" (filtra por aluno via entity_id)

**Dicas:**
- Sempre vincule tarefas a alunos ou cursos para facilitar o rastreamento
- Use prioridade "Urgente" apenas para ações que precisam de atenção no mesmo dia
- A Claris IA pode listar suas tarefas em aberto, filtrar por aluno/curso/tag e sugerir priorização
- Para excluir uma tarefa, peça à Claris IA — ela solicitará confirmação explícita do usuário antes de executar delete_task. Prefira marcar como concluída com change_task_status quando possível.
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // CALENDAR/AGENDA
  // -----------------------------------------------------------------------
  {
    id: 'agenda',
    title: 'Agenda e Calendário',
    keywords: ['agenda', 'calendário', 'eventos', 'web aula', 'alinhamento', 'compromissos', 'reunião'],
    content: `
A Agenda centraliza todos os compromissos do tutor/monitor: web aulas, reuniões, alinhamentos e entregas.

**Tipos de eventos:**
- **Web Aula**: encontro síncrono com a turma
- **Alinhamento**: reunião com coordenação ou colegas
- **Reunião**: encontro individual ou em grupo
- **Entrega**: prazo de atividade ou relatório
- **Treinamento**: capacitação interna
- **Outro**: compromisso personalizado

**Visualizações disponíveis:**
- **Lista (padrão)**: eventos em ordem cronológica
- **Calendário**: grade mensal com os eventos distribuídos nos dias — alterne pelo botão no cabeçalho

**Criando eventos com a Claris IA:**
- "Crie um evento de web aula para o Curso de Direito na terça às 19h"
- "Agende um alinhamento com a turma de Engenharia na sexta às 10h"
- "Mostre meus próximos compromissos desta semana"
- "Cadastre todos esses eventos" (para listas, a Claris usa batch_create_events)

**Dicas:**
- Antes de cada web aula, peça à Claris IA um checklist preparatório
- Use a Claris IA para identificar conflitos de agenda
- Vincule eventos a cursos para melhor rastreabilidade
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // MESSAGING
  // -----------------------------------------------------------------------
  {
    id: 'messaging',
    title: 'Mensagens e Comunicação com Alunos',
    keywords: ['mensagens', 'whatsapp', 'envio', 'templates', 'comunicação', 'contato', 'lote', 'em massa'],
    content: `
A Claris permite enviar mensagens para alunos via WhatsApp, de forma individual ou em lote.

**Envio individual:**
1. Peça à Claris IA: "Enviar mensagem para [nome do aluno]"
2. A IA irá identificar o aluno (pode pedir confirmação se houver homônimos)
3. Confirme o conteúdo e aprove o envio

**Envio em lote:**
1. Peça à Claris IA: "Enviar mensagem para todos os alunos em risco do Curso X"
2. A IA prepara o job de envio com prévia da mensagem e lista de destinatários
3. Confirme explicitamente o envio — a IA nunca dispara mensagens em massa sem confirmação
4. Acompanhe o status do disparo em Automações

**Templates de mensagem:**
- Acesse em Mensagens → Templates ou peça à Claris IA: "Liste os templates de mensagem"
- Há templates para: abertura de semana, alerta de risco, recuperação, alinhamento, etc.
- A Claris IA seleciona automaticamente o template mais adequado ao contexto

**Segurança:**
- Disparos em massa exigem confirmação explícita do tutor
- A IA nunca envia mensagens sem aprovação do usuário
- Evite duplicidade: a IA verifica jobs semelhantes em andamento antes de criar um novo

**Dicas:**
- Peça à Claris IA para rascunhar a mensagem com linguagem personalizada antes de enviar
- Use a variável de nome do aluno nos templates para personalização automática
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // CLARIS IA
  // -----------------------------------------------------------------------
  {
    id: 'claris-ia',
    title: 'Como Usar a Claris IA',
    keywords: ['claris ia', 'assistente', 'ia', 'inteligência artificial', 'como usar', 'ajuda', 'chat', 'o que pode fazer'],
    content: `
A Claris IA é o assistente inteligente integrado à plataforma. Ela pode responder perguntas, analisar dados, criar tarefas, redigir mensagens e muito mais.

**Como acessar:**
- **Widget flutuante**: clique no ícone da Claris IA no canto inferior direito de qualquer página
- **Página dedicada**: acesse o menu "Claris IA" para tela cheia com histórico de conversas

**O que a Claris IA pode fazer:**

*Cursos e alunos:*
- "Quais são meus cursos?"
- "Liste os alunos do Curso de Administração"
- "Mostre alunos com status ativo no Curso de Direito"
- "Buscar aluno Maria Santos"

*Análise e leitura de dados:*
- "Quais alunos estão em risco crítico?"
- "Resumo do aluno João Silva"
- "Atividades aguardando correção desta semana"
- "Próximos compromissos"
- "Situação geral dos cursos"

*Criação e gestão de tarefas:*
- "Crie uma tarefa para contatar Maria Santos, urgente, prazo sexta"
- "Gere um checklist de abertura de UC para o Curso de Pedagogia"
- "Mostre minhas tarefas em aberto"

*Agenda e eventos:*
- "Agende uma web aula para terça às 20h com a turma de Direito"
- "Quais são meus eventos desta semana?"

*Mensagens:*
- "Rascunhe uma mensagem de acompanhamento para alunos em risco"
- "Envie uma mensagem de abertura de semana para a turma de Administração"
- "Qual o status dos meus envios em lote?" (consulta jobs de mensagem)
- "Cancele o job de envio pendente [id]"

*Sugestões proativas:*
- A Claris IA analisa automaticamente o contexto e exibe sugestões no Dashboard
- Peça: "O que devo priorizar hoje?" para uma visão consolidada
- Use: "Gere sugestões proativas" para acionar todos os motores de análise

**Dicas de uso:**
- Seja específico nas perguntas: "Alunos em risco crítico do Curso de Engenharia" funciona melhor que "alunos com problema"
- A IA pede confirmação antes de executar ações que impactam outros usuários ou enviam mensagens externas
- Para limpar o histórico, digite /limpar no chat
- Histórico de conversas é salvo automaticamente e pode ser acessado no painel lateral

**Limitações:**
- A Claris IA usa dados sincronizados do Moodle; dados muito recentes podem não estar disponíveis
- Ações destrutivas (excluir tarefa, cancelar envio) sempre requerem confirmação
- A IA não acessa dados fora da plataforma Claris
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // PROACTIVE SUGGESTIONS
  // -----------------------------------------------------------------------
  {
    id: 'proactive-suggestions',
    title: 'Sugestões Proativas da Claris IA',
    keywords: ['sugestões', 'proativo', 'proativas', 'cards', 'dashboard', 'automático', 'motores'],
    content: `
As sugestões proativas são alertas e recomendações gerados automaticamente pela Claris IA com base nos dados da plataforma.

**Onde aparecem:**
- Cards no Dashboard (Início) — visíveis ao abrir a plataforma
- Notificações no ícone de sino da barra superior

**Motores de sugestão:**
- **Comunicação**: detecta mensagens não respondidas, contatos interrompidos ou canais ineficazes
- **Agenda**: identifica eventos sem preparação, conflitos de horário ou reuniões recorrentes manuais
- **Tarefas**: alerta sobre tarefas atrasadas, paradas ou sem contexto suficiente
- **Acadêmico**: monitora alunos sem atividade, turmas sem follow-up e UCs sem atualização
- **Operacional**: detecta fluxos recorrentes manuais, pendências antigas e processos interrompidos
- **Uso da plataforma**: identifica módulos subutilizados, padrões repetitivos e mensagens desorganizadas

**Interagindo com sugestões:**
- **Aceitar**: executa a ação recomendada (ex.: cria tarefa, agenda evento)
- **Dispensar**: descarta o card (a sugestão não reaparece por um período)
- **Ver detalhes**: abre o contexto completo da sugestão no chat da Claris IA

**Gerando sugestões manualmente:**
- Peça à Claris IA: "Gere sugestões proativas agora" ou "Execute os motores de análise"
- Use para ter uma visão completa do que precisa de atenção

**Cooldown de sugestões:**
Para evitar repetição excessiva, cada motor tem um período de cooldown após gerar uma sugestão. Sugestões novas são geradas quando o contexto muda significativamente.
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // AUTOMATIONS
  // -----------------------------------------------------------------------
  {
    id: 'automations',
    title: 'Automações e Envios Programados',
    keywords: ['automações', 'agendamento', 'programado', 'lote', 'bulk', 'rotinas', 'automatizar'],
    content: `
A seção de Automações centraliza ferramentas para envios em lote, mensagens programadas e rotinas.

**Abas disponíveis:**

*Envios em Lote (Bulk Jobs):*
- Visualize todos os jobs de envio de mensagens criados
- Acompanhe o status: pendente, processando, concluído, com erro
- Cancele envios antes de serem processados

*Mensagens Agendadas:*
- Programe mensagens para serem enviadas em data e hora específicas
- Útil para abertura de semana, lembretes de prazo e comunicados de turma

*Rotinas (em desenvolvimento):*
- Automações recorrentes para ações periódicas

**Criando automações via Claris IA:**
- "Crie um job de envio para todos os alunos em risco do Curso de Administração"
- "Agende uma mensagem de abertura de semana para segunda às 8h"
- A IA prepara e solicita confirmação antes de qualquer envio

**Dica:**
Use Automações quando precisar comunicar com muitos alunos de uma só vez. Para contatos individuais urgentes, use Mensagens diretamente.
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // REPORTS
  // -----------------------------------------------------------------------
  {
    id: 'reports',
    title: 'Relatórios e Exportação de Dados',
    keywords: ['relatório', 'relatórios', 'exportar', 'excel', 'download', 'planilha', 'dados', 'exportação'],
    content: `
A Claris permite exportar dados acadêmicos em formato Excel (.xlsx) para análise externa ou compartilhamento com a equipe.

**Tipos de relatório disponíveis:**
- **Atividades**: detalhe de todas as atividades dos alunos (tipo, nota, prazo, status de entrega)
- **Notas**: notas por curso e por aluno (média, porcentagem, nota formatada)
- **Matrículas**: lista de alunos matriculados por curso com status de matrícula
- **Totais por curso**: contagem consolidada de atividades, alunos e médias por curso

**Como exportar:**
1. Acesse o menu **Relatórios** na barra lateral
2. Selecione o tipo de relatório e os filtros desejados (curso, período, etc.)
3. Clique em **Exportar** para baixar o arquivo Excel

**Quando usar relatórios:**
- Preparar apresentações para coordenação ou gestão
- Analisar dados em ferramentas externas (Excel, Google Sheets, Power BI)
- Documentar o desempenho de turmas em períodos específicos
- Identificar padrões de entrega e notas que não estão visíveis na plataforma

**Dica:**
A Claris IA não gera relatórios em Excel diretamente — use a seção Relatórios para downloads. A IA pode analisar os dados e apontar os principais insights antes de você exportar.
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // ROLES
  // -----------------------------------------------------------------------
  {
    id: 'roles',
    title: 'Perfis de Usuário e Permissões',
    keywords: ['perfil', 'permissões', 'tutor', 'monitor', 'admin', 'gestor', 'papéis', 'funções'],
    content: `
A Claris tem diferentes perfis de usuário com permissões distintas:

**Tutor / Monitor**
Perfil operacional principal. Pode:
- Visualizar e acompanhar seus alunos e cursos
- Criar e gerenciar tarefas, agenda e mensagens
- Usar a Claris IA para análise e automação
- Ver e interagir com sugestões proativas

**Analista Pedagógico / Gestor**
Perfil com visão ampliada. Pode:
- Acessar dados de múltiplos tutores e turmas
- Gerar relatórios consolidados
- Usar a Claris IA para análise estratégica

**Administrador**
Perfil com acesso total. Pode:
- Configurar a Claris IA (modelo, chave de API)
- Gerenciar usuários e permissões
- Ativar/desativar funcionalidades via feature flags
- Acessar o painel de suporte

**Como verificar seu perfil:**
Acesse o menu de perfil no canto superior direito. Seu papel está exibido abaixo do nome.
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // COMMON QUESTIONS
  // -----------------------------------------------------------------------
  {
    id: 'faq',
    title: 'Perguntas Frequentes (FAQ)',
    keywords: ['dúvida', 'faq', 'pergunta', 'problema', 'erro', 'não funciona', 'como', 'onde'],
    content: `
**Como atualizar os dados do Moodle?**
Acesse Administração → Sincronização e inicie uma nova sincronização. Durante o processo, os dados podem estar temporariamente desatualizados.

**A Claris IA não está respondendo, o que fazer?**
1. Verifique se a IA está configurada em Administração → Configurações → Claris IA
2. Verifique se a chave de API do modelo está válida
3. Tente recarregar a página
4. Se o problema persistir, contate o administrador

**Como limpar o histórico de chat da Claris IA?**
Digite /limpar no campo de mensagem do chat e pressione Enter.

**Como criar uma nova conversa na Claris IA?**
Clique no ícone "+" (Nova conversa) no painel lateral do chat. O histórico anterior fica salvo e pode ser acessado depois.

**Não consigo enviar mensagens para um aluno, o que verificar?**
1. Verifique se o aluno tem número de WhatsApp cadastrado
2. Verifique se a integração com WhatsApp está ativa em Administração
3. Confirme que o aluno está vinculado ao seu curso

**Como priorizar quem contatar primeiro?**
Pergunte à Claris IA: "Quem devo contatar hoje com prioridade?" A IA analisa risco, último contato e prazos para sugerir a ordem de prioridade.

**Como saber se uma mensagem foi entregue?**
Acesse Automações → Envios em Lote e verifique o status do job. Para envios individuais, o status aparece no histórico de mensagens do aluno.

**O que fazer quando um aluno está em risco crítico?**
1. Acesse o perfil do aluno e verifique o histórico completo
2. Peça à Claris IA: "Resumo do aluno [nome]" para análise detalhada
3. Entre em contato imediatamente — use Mensagens para contato rápido
4. Crie uma tarefa de acompanhamento urgente
5. Notifique a coordenação se necessário

**Como organizar minha semana na Claris?**
Peça à Claris IA: "Gere um checklist semanal para mim" ou "Quais são as minhas prioridades desta semana?" A IA consolida alunos em risco, tarefas abertas e compromissos da agenda.
    `.trim(),
  },

  // -----------------------------------------------------------------------
  // WEEKLY ROUTINE
  // -----------------------------------------------------------------------
  {
    id: 'weekly-routine',
    title: 'Rotina Semanal Recomendada para Tutores',
    keywords: ['rotina', 'semana', 'semanal', 'segunda', 'sexta', 'dia a dia', 'checklist semanal'],
    content: `
Rotina semanal recomendada para tutores e monitores usando a Claris:

**Segunda-feira — Abertura da semana**
- Acesse o Dashboard e verifique o resumo de risco
- Peça à Claris IA: "Gere a mensagem de abertura da semana para minha turma"
- Revise alunos em risco e planeje os contatos da semana
- Confirme a agenda de web aulas e alinhamentos

**Terça a Quinta — Acompanhamento operacional**
- Responda chats e fóruns do Moodle (prazo máximo: 48h úteis)
- Corrija atividades e SAPs pendentes
- Execute as tarefas prioritárias do dia
- Registre intervenções realizadas

**Sexta-feira — Encerramento e planejamento**
- Verifique tarefas abertas e atualize status
- Peça à Claris IA: "O que ficou pendente esta semana?"
- Agende ações para a próxima semana via Agenda ou Tarefas
- Atualize o nível de risco dos alunos com quem interagiu

**A qualquer momento:**
- Use a Claris IA para análises rápidas: "Alunos sem acesso há mais de 7 dias"
- Crie tarefas ao identificar demandas para não esquecer
- Gere sugestões proativas quando quiser uma visão ampliada

**Início de nova UC (Unidade Curricular):**
- Peça à Claris IA: "Gere um checklist de abertura de UC para [nome do curso]"
- Valide sala virtual, materiais disponíveis e datas do cronograma
- Envie mensagem de boas-vindas para a turma
    `.trim(),
  },
]

// -----------------------------------------------------------------------
// Search helpers
// -----------------------------------------------------------------------

function normalizeStr(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Finds sections matching a topic query by keyword or ID.
 * Returns all sections if topic is empty or 'all'.
 */
export function findSections(topic?: string): KnowledgeSection[] {
  if (!topic || topic.toLowerCase() === 'all' || topic.toLowerCase() === 'todos') {
    return KNOWLEDGE_BASE
  }

  const q = normalizeStr(topic)

  return KNOWLEDGE_BASE.filter((section) => {
    if (section.id === q) return true
    if (normalizeStr(section.title).includes(q)) return true
    return section.keywords.some((kw) => {
      const nkw = normalizeStr(kw)
      return nkw.includes(q) || q.includes(nkw)
    })
  })
}

/** Returns a list of all available topic IDs and titles. */
export function listTopics(): Array<{ id: string; title: string }> {
  return KNOWLEDGE_BASE.map(({ id, title }) => ({ id, title }))
}
