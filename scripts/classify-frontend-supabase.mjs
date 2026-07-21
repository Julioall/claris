import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInventory } from './inventory-frontend-supabase.mjs';

const rootDir = process.cwd();
const outputPath = path.join(rootDir, 'docs', 'SUPABASE_FRONTEND_ACCESS_INVENTORY.json');
const shouldWrite = process.argv.includes('--write');
const shouldCheck = process.argv.includes('--check');

const destinationRules = [
  [/components\/ui\/api\/tagInput/, ['SB-0205']],
  [/features\/admin\/api\/access/, ['SB-0904']],
  [/features\/admin\/api\/backgroundJobs/, ['SB-0806']],
  [/features\/admin\/api\/(conversations|logs|metrics|support)/, ['SB-0903']],
  [/features\/admin\/api\/services/, ['SB-0905']],
  [/features\/admin\/api\/settings/, ['SB-0902', 'SB-0906']],
  [/features\/agenda\//, ['SB-0605']],
  [/features\/auth\/api\/activity-feed|system-notification/, ['SB-0803']],
  [/features\/auth\/api\/login|useAuthSession/, ['SB-0202']],
  [/features\/auth\/application\/risk/, ['SB-0805']],
  [/features\/auth\/infrastructure\/(course-sync|moodle-api)/, ['SB-0803']],
  [/features\/background-jobs\//, ['SB-0804']],
  [/features\/campaigns\//, ['SB-0704']],
  [/features\/claris\//, ['SB-0901']],
  [/features\/courses\/api\/courses.repository/, ['SB-0401', 'SB-0402', 'SB-0403', 'SB-0404', 'SB-0405']],
  [/features\/courses\/api\/index/, ['SB-0406']],
  [/features\/courses\/api\/sync/, ['SB-0803']],
  [/features\/dashboard\//, ['SB-0302', 'SB-0303', 'SB-0304']],
  [/features\/messages\/api\/bulk-messaging/, ['SB-0702', 'SB-0703']],
  [/features\/messages\/api\/message-templates/, ['SB-0701']],
  [/features\/reports\//, ['SB-0505']],
  [/features\/services\//, ['SB-0905']],
  [/features\/settings\/api\/(cleanup|gradeDebug)/, ['SB-0906']],
  [/features\/settings\/api\/(globalSettings|moodleReauth)/, ['SB-0902']],
  [/features\/students\/api\/gradeSuggestions/, ['SB-0504']],
  [/features\/students\/api\/students.repository/, ['SB-0501']],
  [/features\/students\/api\/index/, ['SB-0502']],
  [/features\/students\/hooks\/useStudentHistory/, ['SB-0503']],
  [/features\/tasks\//, ['SB-0601', 'SB-0602', 'SB-0603', 'SB-0604']],
  [/features\/whatsapp\//, ['SB-0705']],
  [/hooks\/(useErrorLog|useTrackEvent)|lib\/tracking/, ['SB-0204']],
  [/hooks\/useMoodleApi/, ['SB-0803']],
  [/hooks\/usePermissions/, ['SB-0904']],
  [/integrations\/http\/edge-function-client/, ['SB-0202', 'SB-1002']],
  [/lib\/course-access/, ['SB-0401']],
  [/lib\/message-template-seeding/, ['SB-0701']],
];

const taskUseCases = {
  'SB-0202': 'Encapsular sessao e autenticacao no AuthGateway',
  'SB-0204': 'Persistir telemetria por endpoint backend',
  'SB-0205': 'Mover lookups de UI para clients de dominio',
  'SB-0302': 'Obter resumo agregado do dashboard',
  'SB-0303': 'Centralizar regras de pendencia, correcao e risco',
  'SB-0304': 'Consumir o dashboard pelo client HTTP',
  'SB-0401': 'Listar catalogo de cursos do usuario autenticado',
  'SB-0402': 'Obter painel consolidado do curso',
  'SB-0403': 'Alterar associacoes de curso de forma atomica',
  'SB-0404': 'Configurar frequencia por curso',
  'SB-0405': 'Alterar visibilidade de atividades',
  'SB-0406': 'Consultar e registrar presenca',
  'SB-0501': 'Listar alunos com paginacao e escopo autorizado',
  'SB-0502': 'Obter perfil consolidado do aluno',
  'SB-0503': 'Obter historico calculado do aluno',
  'SB-0504': 'Acompanhar jobs de sugestao de nota',
  'SB-0505': 'Gerar dados dos relatorios',
  'SB-0601': 'Consultar tarefas, comentarios e tags',
  'SB-0602': 'Executar comandos de tarefas',
  'SB-0603': 'Localizar ou criar tags atomicamente',
  'SB-0604': 'Alterar comentarios e vinculos de tags',
  'SB-0605': 'Consultar e alterar agenda e eventos',
  'SB-0701': 'Gerenciar templates de mensagem',
  'SB-0702': 'Resolver publico elegivel de mensagens',
  'SB-0703': 'Acompanhar historico e jobs de envio',
  'SB-0704': 'Gerenciar campanhas e suas transicoes',
  'SB-0705': 'Executar operacoes de WhatsApp',
  'SB-0803': 'Executar sincronizacao Moodle no backend',
  'SB-0804': 'Consultar progresso de jobs',
  'SB-0805': 'Recalcular risco no backend',
  'SB-0806': 'Administrar background jobs',
  'SB-0901': 'Gerenciar conversas e sugestoes da Claris',
  'SB-0902': 'Gerenciar configuracoes globais',
  'SB-0903': 'Administrar suporte, logs e metricas',
  'SB-0904': 'Administrar autorizacao e permissoes',
  'SB-0905': 'Consultar e administrar servicos',
  'SB-0906': 'Executar ferramentas administrativas e diagnosticos',
  'SB-1002': 'Manter invocacoes de Edge Functions somente no client HTTP aprovado',
};

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function extractResources(source) {
  return {
    tables: sortedUnique(matches(source, /\.from\s*\(\s*['"]([^'"]+)['"]/g)),
    rpcs: sortedUnique(matches(source, /\.rpc\s*\(\s*['"]([^'"]+)['"]/g)),
    functions: sortedUnique(matches(source, /\.invoke(?:\s*<[^;\n]+?>)?\s*\(\s*['"]([^'"]+)['"]/g)),
  };
}

function resolveFeature(filePath) {
  const featureMatch = filePath.match(/^src\/features\/([^/]+)/);
  if (featureMatch) return featureMatch[1];
  if (filePath.startsWith('src/components/')) return 'shared-ui';
  if (filePath.startsWith('src/hooks/') || filePath.startsWith('src/lib/')) return 'cross-cutting';
  return 'app';
}

function resolveCategories(filePath, counts, source) {
  const categories = [];

  if (counts.auth > 0) categories.push('auth');
  if (counts.channel > 0) categories.push('realtime');
  if (counts.functionsInvoke > 0) categories.push('edge-function');

  if (counts.from > 0 || counts.rpc > 0) {
    if (/useErrorLog|useTrackEvent|lib\/tracking/.test(filePath)) {
      categories.push('telemetry');
    } else {
      if (/\.select\s*\(|\.rpc\s*\(/.test(source)) categories.push('query');
      if (/\.(?:insert|update|upsert|delete)\s*\(/.test(source)) categories.push('command');
      if (/\.rpc\s*\(\s*['"][^'"]*(?:upsert|delete|set|update|cleanup|recalculate)/i.test(source)) categories.push('command');
      if (!categories.includes('query') && !categories.includes('command')) categories.push('legacy');
    }
  }

  if (categories.length === 0 && counts.clientImports > 0) categories.push('legacy');

  return sortedUnique(categories);
}

function resolveDestinations(filePath) {
  const destinations = destinationRules
    .filter(([pattern]) => pattern.test(filePath))
    .flatMap(([, tasks]) => tasks);

  if (destinations.length === 0) {
    throw new Error(`No migration destination configured for ${filePath}`);
  }

  const uniqueDestinations = sortedUnique(destinations);
  for (const task of uniqueDestinations) {
    if (!taskUseCases[task]) throw new Error(`No use case configured for ${task}`);
  }

  return uniqueDestinations;
}

export function buildClassifiedInventory() {
  const detected = buildInventory();
  const files = detected.files.map((file) => {
    const source = fs.readFileSync(path.join(rootDir, file.path), 'utf8');
    const destinationTasks = resolveDestinations(file.path);

    return {
      file: file.path,
      feature: resolveFeature(file.path),
      categories: resolveCategories(file.path, file.counts, source),
      useCases: destinationTasks.map((task) => taskUseCases[task]),
      resources: extractResources(source),
      destinationTasks,
      counts: file.counts,
    };
  });

  return {
    schemaVersion: 1,
    sourceCommand: 'npm run audit:supabase-frontend -- --json',
    generatedBy: 'npm run audit:supabase-frontend:classify -- --write',
    expectedBaseline: {
      filesWithSupabaseAccess: detected.filesWithSupabaseAccess,
      totals: detected.totals,
    },
    files,
  };
}

function serialize(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

function checkVersionedInventory(serialized) {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Missing ${path.relative(rootDir, outputPath)}. Run with --write.`);
  }

  const current = fs.readFileSync(outputPath, 'utf8');
  if (current !== serialized) {
    throw new Error('Classified Supabase inventory is stale. Run npm run audit:supabase-frontend:classify -- --write.');
  }
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const inventory = buildClassifiedInventory();
  const serialized = serialize(inventory);

  if (shouldWrite) {
    fs.writeFileSync(outputPath, serialized);
    console.log(`Updated ${path.relative(rootDir, outputPath)}.`);
  } else if (shouldCheck) {
    checkVersionedInventory(serialized);
    console.log('Classified Supabase inventory is complete and up to date.');
  } else {
    process.stdout.write(serialized);
  }
}
