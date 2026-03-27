import { describe, expect, it } from "vitest";

import {
  buildMoodleFileDownloadCandidates,
  buildMoodleFileDownloadUrl,
} from "../../../../supabase/functions/_shared/grade-suggestions/file-support.ts";

describe("grade suggestion file support", () => {
  it("anexa o token sem alterar a URL original do Moodle", () => {
    expect(buildMoodleFileDownloadUrl(
      "https://moodle.local/pluginfile.php/12/mod_assign/intro/arquivo.pdf",
      "abc123",
    )).toBe("https://moodle.local/pluginfile.php/12/mod_assign/intro/arquivo.pdf?token=abc123");
  });

  it("gera fallback entre pluginfile e webservice pluginfile", () => {
    expect(buildMoodleFileDownloadCandidates(
      "https://moodle.local/pluginfile.php/12/mod_assign/intro/arquivo.pdf",
      "abc123",
    )).toEqual([
      "https://moodle.local/pluginfile.php/12/mod_assign/intro/arquivo.pdf?token=abc123",
      "https://moodle.local/webservice/pluginfile.php/12/mod_assign/intro/arquivo.pdf?token=abc123",
    ]);
  });

  it("gera fallback inverso quando o Moodle ja retorna webservice pluginfile", () => {
    expect(buildMoodleFileDownloadCandidates(
      "https://moodle.local/webservice/pluginfile.php/12/mod_assign/intro/arquivo.pdf",
      "abc123",
    )).toEqual([
      "https://moodle.local/webservice/pluginfile.php/12/mod_assign/intro/arquivo.pdf?token=abc123",
      "https://moodle.local/pluginfile.php/12/mod_assign/intro/arquivo.pdf?token=abc123",
    ]);
  });

  it("preserva token existente e evita candidatos duplicados", () => {
    expect(buildMoodleFileDownloadCandidates(
      "https://moodle.local/pluginfile.php/12/mod_assign/intro/arquivo.pdf?token=abc123",
      "abc123",
    )).toEqual([
      "https://moodle.local/pluginfile.php/12/mod_assign/intro/arquivo.pdf?token=abc123",
      "https://moodle.local/webservice/pluginfile.php/12/mod_assign/intro/arquivo.pdf?token=abc123",
    ]);
  });
});
