import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const allowedExtensions = new Set(['.ts', '.tsx']);

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (allowedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function isUiBoundaryFile(relativePath) {
  if (relativePath.includes('/__tests__/') || relativePath.endsWith('.test.ts') || relativePath.endsWith('.test.tsx')) {
    return false;
  }

  if (relativePath.includes('/api/')) {
    return false;
  }

  return (
    relativePath.startsWith('src/pages/')
    || relativePath.startsWith('src/components/')
    || /^src\/features\/[^/]+\/pages\//.test(relativePath)
    || /^src\/features\/[^/]+\/components\//.test(relativePath)
  );
}

const directClientImportPattern = /from\s+['"]@\/integrations\/supabase\/client['"]|import\s+['"]@\/integrations\/supabase\/client['"]/;
const directSupabaseUsagePattern = /\bsupabase\.(from|rpc|functions|auth)\b/;

const violations = [];

for (const absolutePath of walk(srcDir)) {
  const relativePath = normalizePath(path.relative(rootDir, absolutePath));

  if (!isUiBoundaryFile(relativePath)) {
    continue;
  }

  const source = stripComments(fs.readFileSync(absolutePath, 'utf8'));
  const reasons = [];

  if (directClientImportPattern.test(source)) {
    reasons.push("importa '@/integrations/supabase/client' diretamente");
  }

  if (directSupabaseUsagePattern.test(source)) {
    reasons.push('usa `supabase.*` diretamente');
  }

  if (reasons.length > 0) {
    violations.push({ relativePath, reasons });
  }
}

if (violations.length > 0) {
  console.error('Supabase boundary guard falhou. Mova o acesso a dados para api/, hooks/, application/ ou infrastructure/.');

  for (const violation of violations) {
    console.error(`- ${violation.relativePath}: ${violation.reasons.join(' e ')}`);
  }

  process.exit(1);
}

console.log('Supabase boundary guard: OK');
