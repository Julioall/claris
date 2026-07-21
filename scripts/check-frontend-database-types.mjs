import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const allowedPaths = new Set([
  'src/integrations/supabase/client.ts',
  'src/integrations/supabase/types.ts',
]);

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

const violations = walk(srcDir)
  .map((absolutePath) => ({
    absolutePath,
    relativePath: normalizePath(path.relative(rootDir, absolutePath)),
  }))
  .filter(({ relativePath }) => isRuntimeSource(relativePath) && !allowedPaths.has(relativePath))
  .flatMap(({ absolutePath, relativePath }) => {
    const source = stripComments(fs.readFileSync(absolutePath, 'utf8'));
    const reasons = [];

    if (/integrations\/supabase\/types/.test(source)) {
      reasons.push('imports generated Supabase database types');
    }
    if (/\bDatabase\s*\[\s*['"]public['"]\s*\]/.test(source)) {
      reasons.push('references the generated Database public schema');
    }

    return reasons.map((reason) => `${relativePath}: ${reason}`);
  });

if (violations.length > 0) {
  console.error('Frontend database type boundary failed. Use domain DTOs and view models instead.');
  for (const violation of violations.sort()) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Frontend database type boundary: OK (generated database types stay in the Supabase adapter).');
