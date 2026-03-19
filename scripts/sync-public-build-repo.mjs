import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const parsed = {
    distDir: "dist",
    targetDir: "public-site",
    targetRepo: "",
    sourceRepo: "",
    sourceCommit: "",
    siteDirName: "site",
    cname: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === "--dist-dir" && value) {
      parsed.distDir = value;
      index += 1;
      continue;
    }

    if (arg === "--target-dir" && value) {
      parsed.targetDir = value;
      index += 1;
      continue;
    }

    if (arg === "--target-repo" && value) {
      parsed.targetRepo = value;
      index += 1;
      continue;
    }

    if (arg === "--source-repo" && value) {
      parsed.sourceRepo = value;
      index += 1;
      continue;
    }

    if (arg === "--source-commit" && value) {
      parsed.sourceCommit = value;
      index += 1;
      continue;
    }

    if (arg === "--site-dir" && value) {
      parsed.siteDirName = value;
      index += 1;
      continue;
    }

    if (arg === "--cname" && value) {
      parsed.cname = value;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/sync-public-build-repo.mjs " +
          "[--dist-dir dist] [--target-dir public-site] " +
          "--target-repo owner/repo [--source-repo owner/repo] [--source-commit sha] " +
          "[--site-dir site] [--cname example.com]",
      );
      process.exit(0);
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!parsed.targetRepo) {
    throw new Error("Missing required --target-repo <owner/repo> argument.");
  }

  return parsed;
}

function buildReadme({ targetRepo, sourceRepo, sourceCommit, siteDirName }) {
  const sourceLine = sourceRepo
    ? `- Repositorio fonte privado: \`${sourceRepo}\`${sourceCommit ? ` @ \`${sourceCommit}\`` : ""}`
    : "- Repositorio fonte privado: configurado no pipeline de deploy";

  return `# ${targetRepo}

Este repositorio publico recebe somente o build estatico da aplicacao.

- Os arquivos publicados ficam em \`${siteDirName}/\`.
${sourceLine}
- O codigo-fonte, migrations e logica sensivel permanecem no repositorio privado e nas Edge Functions.
- Alteracoes manuais neste repositorio podem ser sobrescritas no proximo deploy.

## Publicacao

O deploy do GitHub Pages e feito pelo workflow versionado neste repositorio, usando apenas os artefatos gerados no pipeline do repositorio privado.
`;
}

function buildPagesWorkflow(siteDirName) {
  return `name: Deploy Public Site

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    concurrency:
      group: github-pages
      cancel-in-progress: true
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./${siteDirName}
      - id: deployment
        uses: actions/deploy-pages@v4
`;
}

async function removeManagedEntries(targetDir) {
  const entries = await readdir(targetDir, { withFileTypes: true }).catch(() => []);

  await Promise.all(
    entries
      .filter((entry) => entry.name !== ".git")
      .map((entry) => rm(path.join(targetDir, entry.name), { recursive: true, force: true })),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const distDir = path.resolve(options.distDir);
  const targetDir = path.resolve(options.targetDir);
  const siteDir = path.join(targetDir, options.siteDirName);
  const workflowDir = path.join(targetDir, ".github", "workflows");

  await mkdir(targetDir, { recursive: true });
  await removeManagedEntries(targetDir);

  await mkdir(siteDir, { recursive: true });
  await cp(distDir, siteDir, { recursive: true });

  if (options.cname) {
    await writeFile(path.join(siteDir, "CNAME"), `${options.cname.trim()}\n`, "utf8");
  }

  await mkdir(workflowDir, { recursive: true });
  await writeFile(
    path.join(targetDir, "README.md"),
    buildReadme(options),
    "utf8",
  );
  await writeFile(
    path.join(workflowDir, "deploy-pages.yml"),
    buildPagesWorkflow(options.siteDirName),
    "utf8",
  );

  console.log(`Public build repository prepared at ${targetDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unexpected error.");
  process.exit(1);
});
