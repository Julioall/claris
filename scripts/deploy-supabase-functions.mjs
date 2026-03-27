import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DEFAULT_FUNCTIONS = [
  'moodle-auth',
  'moodle-sync-courses',
  'moodle-sync-students',
  'moodle-sync-activities',
  'moodle-sync-grades',
  'moodle-grade-suggestions',
  'moodle-messaging',
  'bulk-message-send',
  'data-cleanup',
  'generate-automated-tasks',
  'generate-recurring-tasks',
  'generate-proactive-suggestions',
  'process-scheduled-messages',
  'claris-llm-test',
  'claris-chat',
  'whatsapp-instance-manager',
  'receive-whatsapp-webhook',
  'whatsapp-messaging',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function printUsage() {
  console.log(`Usage:\n  node scripts/deploy-supabase-functions.mjs [--project-ref <ref>] [--skip-link] [function ...]\n\nExamples:\n  node scripts/deploy-supabase-functions.mjs --project-ref abcdefghijklmnopqrst claris-llm-test claris-chat\n  node scripts/deploy-supabase-functions.mjs --project-ref abcdefghijklmnopqrst\n  node scripts/deploy-supabase-functions.mjs --skip-link claris-llm-test\n\nNotes:\n  - If no function names are provided, the script deploys the default remote function set.\n  - Each function is deployed with --no-verify-jwt because browser preflight must reach the shared handler, which enforces auth inside the function.`);
}

function parseArgs(argv) {
  const parsed = {
    projectRef: null,
    skipLink: false,
    functions: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--project-ref') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --project-ref');
      }
      parsed.projectRef = value;
      index += 1;
      continue;
    }

    if (arg === '--skip-link') {
      parsed.skipLink = true;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    parsed.functions.push(arg);
  }

  return parsed;
}

function runSupabase(args) {
  console.log(`\n> supabase ${args.join(' ')}`);

  const result = spawnSync(
    npmCommand,
    ['exec', '--yes', '--package', 'supabase@latest', '--', 'supabase', ...args],
    {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`Supabase CLI command failed with exit code ${result.status}.`);
  }
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  const functionsToDeploy = parsed.functions.length > 0 ? parsed.functions : DEFAULT_FUNCTIONS;

  if (!parsed.skipLink) {
    if (!parsed.projectRef) {
      throw new Error('Use --project-ref <ref> or --skip-link to reuse an already linked project.');
    }
    runSupabase(['link', '--project-ref', parsed.projectRef]);
  }

  for (const functionName of functionsToDeploy) {
    runSupabase(['functions', 'deploy', functionName, '--no-verify-jwt']);
  }

  console.log('\nRemote Edge Function deploy finished successfully.');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  console.error(`\nFailed to deploy remote Edge Functions: ${message}`);
  console.error('Authenticate first with supabase login or provide SUPABASE_ACCESS_TOKEN in the environment.');
  process.exit(1);
}
