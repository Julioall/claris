import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];

function filesUnder(root) {
  const result = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) result.push(...filesUnder(path));
    else result.push(path);
  }
  return result;
}

function inspect(path, rules) {
  const text = readFileSync(path, 'utf8');
  for (const [label, pattern] of rules) {
    if (pattern.test(text)) failures.push(`${relative(workspaceRoot, path)}: ${label}`);
  }
}

const frontendRoot = join(workspaceRoot, 'src');
for (const path of filesUnder(frontendRoot)) {
  if (!['.ts', '.tsx'].includes(extname(path)) || /(?:__tests__|\.test\.)/.test(path)) continue;
  inspect(path, [
    ['browser contract contains a raw Moodle token', /\bmoodleToken\b/],
    ['browser contract contains a raw Moodle URL', /\bmoodleUrl\b/],
  ]);
}

const functionsRoot = join(workspaceRoot, 'supabase', 'functions');
for (const path of filesUnder(functionsRoot)) {
  if (extname(path) !== '.ts') continue;
  const normalized = path.replaceAll('\\', '/');
  if (normalized.includes('/moodle-auth/') || normalized.includes('/moodle-reauth-settings/')) continue;
  if (normalized.endsWith('/index.ts') || normalized.endsWith('/payload.ts')) {
    inspect(path, [
      ['entrypoint depends on retired global Moodle reauth', /domain\/moodle-reauth/],
      ['public payload accepts a raw Moodle URL', /readRequiredMoodleUrl|['"]moodleUrl['"]/],
      ['public payload accepts a raw Moodle token', /['"](?:moodleToken|token)['"]/],
    ]);
  }
}

for (const relativePath of ['supabase/config.toml', 'scripts/deploy-supabase-functions.mjs']) {
  inspect(join(workspaceRoot, relativePath), [
    ['retired Moodle login endpoint is deployable', /moodle-auth|moodle-reauth-settings/],
    ['hardcoded primary Moodle fallback remains', /PRIMARY_MOODLE_URL/],
  ]);
}

if (failures.length > 0) {
  console.error(`Moodle boundary guard failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Moodle boundary guard passed.');
