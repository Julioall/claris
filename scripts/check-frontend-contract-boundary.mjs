import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const sourceExtensions = new Set(['.ts', '.tsx']);
const generatedTypeImport = /from\s+['"]@\/integrations\/supabase\/types['"]/;
const presentationDebt = new Set();

function normalize(filePath) {
  return filePath.split(path.sep).join('/');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function isTest(relativePath) {
  return relativePath.includes('/__tests__/')
    || relativePath.endsWith('.test.ts')
    || relativePath.endsWith('.test.tsx');
}

function isPresentationContract(relativePath) {
  return relativePath.includes('/api/contracts/')
    || relativePath.includes('/components/')
    || relativePath.includes('/pages/')
    || relativePath.includes('/hooks/')
    || /^src\/features\/[^/]+\/types\.ts$/.test(relativePath);
}

const violations = [];
const observedDebt = new Set();
for (const absolutePath of walk(srcDir)) {
  const relativePath = normalize(path.relative(rootDir, absolutePath));
  if (!sourceExtensions.has(path.extname(relativePath)) || isTest(relativePath)) continue;
  if (!isPresentationContract(relativePath)) continue;

  const source = fs.readFileSync(absolutePath, 'utf8');
  if (!generatedTypeImport.test(source)) continue;
  if (presentationDebt.has(relativePath)) observedDebt.add(relativePath);
  else violations.push(relativePath);
}

const staleDebt = [...presentationDebt].filter((relativePath) => !observedDebt.has(relativePath));

if (violations.length > 0) {
  console.error('Frontend contract boundary failed. DTOs and presentation cannot import generated Supabase types.');
  for (const violation of violations.sort()) console.error(`- ${violation}`);
  process.exit(1);
}

if (staleDebt.length > 0) {
  console.error('Frontend contract boundary debt is stale. Remove these entries from the allowlist:');
  for (const relativePath of staleDebt.sort()) console.error(`- ${relativePath}`);
  process.exit(1);
}

console.log(`Frontend contract boundary: OK (${presentationDebt.size} versioned presentation debts remain).`);
