import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const allowedExtensions = new Set(['.ts', '.tsx']);
const outputJson = process.argv.includes('--json');

const operationPatterns = {
  from: /\bsupabase\s*(?:\.\s*from|\s+as\s+[^)\n]+\)\s*\.\s*from)\s*\(/g,
  rpc: /\bsupabase\s*(?:\.\s*rpc|\s+as\s+[^)\n]+\)\s*\.\s*rpc)\s*\(/g,
  functionsInvoke: /\bsupabase\s*\.\s*functions\s*\.\s*invoke\s*(?:<[^;\n]+?>)?\s*\(/g,
  auth: /\bsupabase\s*\.\s*auth\s*\./g,
  storage: /\bsupabase\s*\.\s*storage\s*\./g,
  channel: /\bsupabase\s*\.\s*channel\s*\(/g,
};

const clientImportPattern = /(?:from\s+|import\s*)['"]@\/integrations\/supabase\/client['"]/g;

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
  if (!allowedExtensions.has(path.extname(relativePath))) return false;
  if (relativePath === 'src/integrations/supabase/client.ts') return false;

  return !(
    relativePath.includes('/__tests__/')
    || relativePath.includes('/test/')
    || relativePath.includes('/mocks/')
    || relativePath.endsWith('.test.ts')
    || relativePath.endsWith('.test.tsx')
    || relativePath.endsWith('.spec.ts')
    || relativePath.endsWith('.spec.tsx')
  );
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function emptyCounts() {
  return {
    clientImports: 0,
    from: 0,
    rpc: 0,
    functionsInvoke: 0,
    auth: 0,
    storage: 0,
    channel: 0,
  };
}

function addCounts(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += source[key];
  }
}

function countFile(source) {
  const counts = emptyCounts();
  counts.clientImports = countMatches(source, clientImportPattern);

  for (const [operation, pattern] of Object.entries(operationPatterns)) {
    counts[operation] = countMatches(source, pattern);
  }

  return counts;
}

function hasAccess(counts) {
  return Object.values(counts).some((count) => count > 0);
}

function buildInventory() {
  const files = walk(srcDir)
    .map((absolutePath) => ({
      absolutePath,
      path: normalizePath(path.relative(rootDir, absolutePath)),
    }))
    .filter(({ path: relativePath }) => isRuntimeSource(relativePath))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ absolutePath, path: relativePath }) => {
      const source = stripComments(fs.readFileSync(absolutePath, 'utf8'));
      return { path: relativePath, counts: countFile(source) };
    })
    .filter(({ counts }) => hasAccess(counts));

  const totals = emptyCounts();
  for (const file of files) addCounts(totals, file.counts);

  return {
    schemaVersion: 1,
    scope: 'src runtime TypeScript, excluding tests, mocks and the Supabase client adapter',
    filesWithSupabaseAccess: files.length,
    totals,
    files,
  };
}

function printHumanReadable(inventory) {
  console.log('Frontend Supabase inventory');
  console.log(`Scope: ${inventory.scope}`);
  console.log(`Files with access: ${inventory.filesWithSupabaseAccess}`);
  console.log('');
  console.log('Totals');

  for (const [operation, count] of Object.entries(inventory.totals)) {
    console.log(`- ${operation}: ${count}`);
  }

  console.log('');
  console.log('Files');

  for (const file of inventory.files) {
    const operations = Object.entries(file.counts)
      .filter(([, count]) => count > 0)
      .map(([operation, count]) => `${operation}=${count}`)
      .join(', ');
    console.log(`- ${file.path}: ${operations}`);
  }
}

const inventory = buildInventory();

if (outputJson) {
  console.log(JSON.stringify(inventory, null, 2));
} else {
  printHumanReadable(inventory);
}
