import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLARIS_LLM_SETTINGS,
  parseClarisLlmSettings,
} from "@/lib/claris-settings";

describe("claris settings", () => {
  it("falls back to defaults when settings are empty", () => {
    expect(parseClarisLlmSettings(null)).toEqual(DEFAULT_CLARIS_LLM_SETTINGS);
  });

  it("parses stored custom instructions without affecting connection fields", () => {
    const parsed = parseClarisLlmSettings({
      provider: "openai",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1/",
      apiKey: "sk-test",
      customInstructions: "  Responda com foco em proximos passos.  ",
      configured: true,
    });

    expect(parsed).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      customInstructions: "Responda com foco em proximos passos.",
      configured: true,
    });
  });
});
