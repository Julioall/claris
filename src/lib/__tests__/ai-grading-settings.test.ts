import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_GRADING_CUSTOM_INSTRUCTIONS,
  DEFAULT_AI_GRADING_SETTINGS,
  parseAiGradingSettings,
} from "@/lib/ai-grading-settings";

describe("ai grading settings", () => {
  it("falls back to defaults when the payload is empty", () => {
    expect(parseAiGradingSettings(null)).toEqual(DEFAULT_AI_GRADING_SETTINGS);
  });

  it("keeps the default custom instructions when none were persisted", () => {
    expect(parseAiGradingSettings({}).customInstructions).toBe(DEFAULT_AI_GRADING_CUSTOM_INSTRUCTIONS);
  });

  it("includes the newly enabled supported file types in defaults", () => {
    expect(DEFAULT_AI_GRADING_SETTINGS.supportedTypes).toEqual(expect.arrayContaining([
      "md",
      "htm",
      "gif",
      "bmp",
      "webp",
      "svg",
    ]));
  });

  it("normalizes lists and numeric bounds from persisted settings", () => {
    const parsed = parseAiGradingSettings({
      enabled: false,
      timeoutMs: "60000",
      maxFileBytes: "9999999",
      supportedTypes: " PDF, docx, pdf , jpg ",
      associationMinScore: "1.5",
      associationWeights: {
        sameSection: "0.8",
        similarName: "-2",
      },
      associationKeywords: [" SAP ", "atividade", ""],
      minVisualTextChars: "120",
      minSubmissionTextChars: "75",
      maxStoredTextLength: "16000",
    });

    expect(parsed).toMatchObject({
      enabled: false,
      timeoutMs: 60000,
      maxFileBytes: 9999999,
      supportedTypes: ["pdf", "docx", "jpg"],
      associationMinScore: 1,
      associationWeights: expect.objectContaining({
        sameSection: 0.8,
        similarName: 0,
      }),
      associationKeywords: ["sap", "atividade"],
      minVisualTextChars: 120,
      minSubmissionTextChars: 75,
      maxStoredTextLength: 16000,
      customInstructions: DEFAULT_AI_GRADING_CUSTOM_INSTRUCTIONS,
    });
  });

  it("expands the legacy default supported types to the current default list", () => {
    const parsed = parseAiGradingSettings({
      supportedTypes: ["docx", "pdf", "txt", "html", "csv", "xlsx", "pptx", "png", "jpg", "jpeg"],
    });

    expect(parsed.supportedTypes).toEqual(DEFAULT_AI_GRADING_SETTINGS.supportedTypes);
  });

  it("preserves an explicitly cleared custom instructions field", () => {
    const parsed = parseAiGradingSettings({
      customInstructions: "   ",
    });

    expect(parsed.customInstructions).toBe("");
  });
});
