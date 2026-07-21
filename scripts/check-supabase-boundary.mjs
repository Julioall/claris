import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInventory } from './inventory-frontend-supabase.mjs';

const rootDir = process.cwd();
const debtPath = path.join(rootDir, 'scripts', 'supabase-boundary-debt.json');
const writeDebt = process.argv.includes('--write-debt');
const countKeys = ['clientImports', 'from', 'rpc', 'functionsInvoke', 'auth', 'storage', 'channel'];

const permanentAdapters = new Map([
  ['src/integrations/http/edge-function-client.ts', {
    clientImports: 1,
    from: 0,
    rpc: 0,
    functionsInvoke: 1,
    auth: 2,
    storage: 0,
    channel: 0,
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
