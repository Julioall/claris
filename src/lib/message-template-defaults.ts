export interface MessageTemplateCategoryOption {
  value: string;
  label: string;
}

export interface DefaultMessageTemplate {
  defaultKey: string;
  category: string;
  title: string;
  content: string;
}

export const MESSAGE_TEMPLATE_CATEGORIES: MessageTemplateCategoryOption[] = [
  { value: 'geral', label: 'Geral' },
  { value: 'boas_vindas', label: 'Boas-vindas' },
  { value: 'acompanhamento', label: 'Acompanhamento' },
  { value: 'desempenho', label: 'Desempenho' },
  { value: 'cobranca', label: 'Cobrança' },
  { value: 'incentivo', label: 'Incentivo' },
  { value: 'webconferencia', label: 'Webconferência' },
  { value: 'fechamento', label: 'Fechamento' },
  { value: 'diagnostico', label: 'Diagnóstico completo' },
];

export const DEFAULT_MESSAGE_TEMPLATES: DefaultMessageTemplate[] = [
  {
    defaultKey: 'boas_vindas_inicio_uc',
    category: 'boas_vindas',
    title: 'Boas-vindas - Início da Unidade Curricular',
    content: `Olá, {nome_aluno}.

Seja bem-vindo(a) à unidade curricular {unidade_curricular}.

Sua turma {turma} já está com as atividades disponíveis no ambiente virtual.

É importante acessar regularmente e acompanhar os prazos para manter um bom desempenho.

Qualquer dúvida, estou à disposição para ajudar.

Tutor(a): {nome_tutor}`,
  },
  {
    defaultKey: 'boas_vindas_apresentacao_tutor',
    category: 'boas_vindas',
    title: 'Apresentação do Tutor',
    content: `Olá, {nome_aluno}.

Sou {nome_tutor}, tutor(a) responsável pelo acompanhamento da sua turma no curso {curso}.

Durante esta etapa vou acompanhar seu progresso, orientar nas atividades e apoiar seu desenvolvimento.

Desejo um ótimo início de estudos.`,
  },
  {
    defaultKey: 'acompanhamento_baixo_acesso',
    category: 'acompanhamento',
    title: 'Baixo acesso',
    content: `Olá, {nome_aluno}.

Percebi que seu último acesso foi em {ultimo_acesso}.

É importante retomar as atividades da unidade {unidade_curricular} para evitar acúmulo de pendências.

Se estiver com alguma dificuldade, me avise para que eu possa orientar.`,
  },
  {
    defaultKey: 'acompanhamento_atividades_pendentes',
    category: 'acompanhamento',
    title: 'Atividades pendentes',
    content: `Olá, {nome_aluno}.

Você possui {atividades_pendentes} atividade(s) pendente(s) em {unidade_curricular}.

Sugiro organizar seu tempo para regularizar as entregas e manter seu aproveitamento.

Conte comigo se precisar.`,
  },
  {
    defaultKey: 'acompanhamento_risco_evasao',
    category: 'acompanhamento',
    title: 'Risco de evasão',
    content: `Olá, {nome_aluno}.

Seu acompanhamento atual indica nível de atenção: {nivel_risco}.

Ainda é possível recuperar seu ritmo de estudos e avançar normalmente no curso.

Se precisar, posso ajudar a definir uma estratégia de organização.`,
  },
  {
    defaultKey: 'desempenho_bom',
    category: 'desempenho',
    title: 'Bom desempenho',
    content: `Parabéns, {nome_aluno}.

Sua média atual é {nota_media}.

Seu desempenho na unidade {unidade_curricular} está muito bom. Continue mantendo esse ritmo.`,
  },
  {
    defaultKey: 'desempenho_atencao_media',
    category: 'desempenho',
    title: 'Atenção à média',
    content: `Olá, {nome_aluno}.

Sua média atual é {nota_media}.

É importante reforçar os estudos nesta etapa para melhorar seu desempenho nas próximas atividades.`,
  },
  {
    defaultKey: 'cobranca_prazo_proximo',
    category: 'cobranca',
    title: 'Prazo próximo',
    content: `Olá, {nome_aluno}.

Há atividades com prazo próximo de encerramento em {unidade_curricular}.

Evite deixar para o último momento.`,
  },
  {
    defaultKey: 'cobranca_pendencia_prolongada',
    category: 'cobranca',
    title: 'Pendência prolongada',
    content: `Olá, {nome_aluno}.

Identificamos pendências em aberto há mais tempo na unidade {unidade_curricular}.

Regularizar agora ajuda a evitar impacto no seu resultado final.`,
  },
  {
    defaultKey: 'incentivo_motivacional',
    category: 'incentivo',
    title: 'Motivacional',
    content: `Olá, {nome_aluno}.

Cada atividade concluída aproxima você da conclusão do curso {curso}.

Mantenha constância: pequenos avanços diários geram grandes resultados.`,
  },
  {
    defaultKey: 'incentivo_retorno_apos_ausencia',
    category: 'incentivo',
    title: 'Retorno após ausência',
    content: `Olá, {nome_aluno}.

Que bom ver você novamente no ambiente.

Continue avançando em {unidade_curricular}. Ainda há tempo para manter um ótimo desempenho.`,
  },
  {
    defaultKey: 'webconferencia_convite',
    category: 'webconferencia',
    title: 'Convite para encontro',
    content: `Olá, {nome_aluno}.

Teremos encontro de apoio referente à unidade {unidade_curricular}.

Sua participação é importante para esclarecimento de dúvidas e reforço dos conteúdos.`,
  },
  {
    defaultKey: 'webconferencia_lembrete_aula',
    category: 'webconferencia',
    title: 'Lembrete de aula',
    content: `Olá, {nome_aluno}.

Lembrete: hoje teremos encontro da turma {turma}.

Prepare suas dúvidas e participe.`,
  },
  {
    defaultKey: 'fechamento_encerramento_uc',
    category: 'fechamento',
    title: 'Encerramento da unidade',
    content: `Parabéns pela conclusão da unidade {unidade_curricular}, {nome_aluno}.

Continue acompanhando as próximas etapas do curso.`,
  },
  {
    defaultKey: 'fechamento_encerramento_pendencias',
    category: 'fechamento',
    title: 'Encerramento com pendências',
    content: `Olá, {nome_aluno}.

A unidade {unidade_curricular} está em encerramento e ainda existem pendências registradas.

Verifique o ambiente para regularização.`,
  },
  {
    defaultKey: 'diagnostico_resumo_individual',
    category: 'diagnostico',
    title: 'Resumo individual',
    content: `Olá, {nome_aluno}.

Resumo atual:
Último acesso: {ultimo_acesso}
Média: {nota_media}
Pendências: {atividades_pendentes}
Nível de atenção: {nivel_risco}

Minha orientação neste momento é priorizar a unidade {unidade_curricular}.`,
  },
  {
    defaultKey: 'diagnostico_acompanhamento_tutor',
    category: 'diagnostico',
    title: 'Acompanhamento tutor',
    content: `Olá, {nome_aluno}.

Estou acompanhando seu desenvolvimento na turma {turma} do curso {curso}.

Se precisar de apoio em {unidade_curricular}, pode contar comigo.

Tutor(a): {nome_tutor}`,
  },
];
