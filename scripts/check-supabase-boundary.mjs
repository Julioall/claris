import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInventory } from './inventory-frontend-supabase.mjs';

const rootDir = process.cwd();
const debtPath = path.join(rootDir, 'scripts', 'supabase-boundary-debt.json');
const writeDebt = process.argv.includes('--write-debt');
const countKeys = ['clientImports', 'from', 'rpc', 'functionsInvoke', 'auth', 'storage', 'channel'];
const supabaseClientPath = 'src/integrations/supabase/client.ts';

const permanentAdapters = new Map([
  ['src/integrations/http/edge-function-client.ts', {
    clientImports: 1,
    from: 0,
    rpc: 0,
    functionsInvoke: 1,
    auth: 0,
    storage: 0,
    channel: 0,
  }],
  ['src/integrations/auth/auth-gateway.ts', {
    clientImports: 1,
    from: 0,
    rpc: 0,
    functionsInvoke: 0,
    auth: 5,
    storage: 0,
    channel: 0,
  }],
  ['src/integrations/realtime/realtime-gateway.ts', {
    clientImports: 1,
    from: 0,
    rpc: 0,
    functionsInvoke: 0,
    auth: 0,
    storage: 0,
    channel: 1,
  }],
]);

function normalizeCounts(counts) {
  return Object.fromEntries(countKeys.map((key) => [key, counts[key] ?? 0]));
}

function sameCounts(left, right) {
  return countKeys.every((key) => left[key] === right[key]);
}

function serializeDebt(files) {
  return `${JSON.stringify({
    schemaVersion: 1,
    description: 'Exact, decreasing budget for legacy Supabase access in frontend runtime files.',
    files: files.map((file) => ({ path: file.path, counts: normalizeCounts(file.counts) })),
  }, null, 2)}\n`;
}

function buildDebt(inventory) {
  return inventory.files.filter((file) => !permanentAdapters.has(file.path));
}

function fail(messages) {
  console.error('Supabase boundary guard failed. New or changed browser-side Supabase access is forbidden.');
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
}

function isRuntimeSource(relativePath) {
  if (!/\.tsx?$/.test(relativePath)) return false;
  return !(
    relativePath.includes('/__tests__/')
    || relativePath.includes('/test/')
    || relativePath.includes('/mocks/')
    || /\.(?:test|spec)\.tsx?$/.test(relativePath)
  );
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function checkRestrictedImports() {
  const errors = [];
  const approvedClientImporters = new Set(permanentAdapters.keys());
  const httpAdapterPath = 'src/integrations/http/edge-function-client.ts';
  const approvedUrlImporters = new Set([httpAdapterPath, supabaseClientPath]);
  const files = walk(path.join(rootDir, 'src'))
    .map((absolutePath) => ({
      absolutePath,
      relativePath: normalizePath(path.relative(rootDir, absolutePath)),
    }))
    .filter(({ relativePath }) => isRuntimeSource(relativePath));

  for (const { absolutePath, relativePath } of files) {
    const source = stripComments(fs.readFileSync(absolutePath, 'utf8'));
    const referencesClient = /integrations\/supabase\/client/.test(source);
    const referencesSdk = /['"]@supabase\/supabase-js['"]/.test(source);
    const referencesFunctionEndpoint = /functions\/v1|SUPABASE_FUNCTIONS_BASE_URL/.test(source);
    const referencesRestEndpoint = /rest\/v1/.test(source);
    const referencesSupabaseUrl = /integrations\/supabase\/url/.test(source);

    if (referencesClient && !approvedClientImporters.has(relativePath)) {
      errors.push(`${relativePath}: Supabase client import is outside the approved adapter allowlist`);
    }
    if (referencesSdk && relativePath !== supabaseClientPath) {
      errors.push(`${relativePath}: Supabase SDK package import is only allowed in ${supabaseClientPath}`);
    }
    if (referencesSupabaseUrl && !approvedUrlImporters.has(relativePath)) {
      errors.push(`${relativePath}: Supabase URL access is outside the approved transport adapters`);
    }
    if (referencesFunctionEndpoint && relativePath !== httpAdapterPath) {
      errors.push(`${relativePath}: direct Edge Function URL access is only allowed in ${httpAdapterPath}`);
    }
    if (referencesRestEndpoint) {
      errors.push(`${relativePath}: direct PostgREST URL access is forbidden in frontend runtime`);
    }
  }

  return errors;
}

export function checkSupabaseBoundary() {
  const inventory = buildInventory();

  if (writeDebt) {
    fs.writeFileSync(debtPath, serializeDebt(buildDebt(inventory)));
    console.log(`Updated ${path.relative(rootDir, debtPath)}.`);
    return;
  }

  if (!fs.existsSync(debtPath)) fail(['missing scripts/supabase-boundary-debt.json']);

  const rawDebt = fs.readFileSync(debtPath, 'utf8');
  const debt = JSON.parse(rawDebt);
  if (debt.schemaVersion !== 1 || !Array.isArray(debt.files)) fail(['invalid debt snapshot schema']);
  if (rawDebt !== serializeDebt(debt.files)) fail(['debt snapshot is not in canonical deterministic format']);

  const detectedByPath = new Map(inventory.files.map((file) => [file.path, normalizeCounts(file.counts)]));
  const debtByPath = new Map(debt.files.map((file) => [file.path, normalizeCounts(file.counts)]));
  const errors = [];

  errors.push(...checkRestrictedImports());
  if (debt.files.length > 0) {
    errors.push('legacy Supabase debt must remain empty after Epic 10');
  }

  for (const [adapterPath, expectedCounts] of permanentAdapters) {
    const detected = detectedByPath.get(adapterPath);
    if (!detected) errors.push(`${adapterPath}: approved adapter is missing`);
    else if (!sameCounts(detected, expectedCounts)) {
      errors.push(`${adapterPath}: approved adapter operations changed; review its explicit budget`);
    }
    detectedByPath.delete(adapterPath);
  }

  for (const [filePath, detectedCounts] of detectedByPath) {
    const allowedCounts = debtByPath.get(filePath);
    if (!allowedCounts) {
      errors.push(`${filePath}: new Supabase access is not in the legacy debt snapshot`);
      continue;
    }
    if (!sameCounts(detectedCounts, allowedCounts)) {
      errors.push(`${filePath}: access counts changed; only reduce debt and refresh the snapshot intentionally`);
    }
    debtByPath.delete(filePath);
  }

  for (const filePath of debtByPath.keys()) {
    errors.push(`${filePath}: stale debt entry; remove it with --write-debt after verifying the migration`);
  }

  if (errors.length > 0) fail(errors.sort());
  console.log(`Supabase boundary guard: OK (${debt.files.length} legacy files frozen, ${permanentAdapters.size} approved adapter).`);
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) checkSupabaseBoundary();
