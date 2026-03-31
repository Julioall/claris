import { describe, expect, it } from "vitest";

import { extractTextFromFileBuffer } from "../../../../supabase/functions/_shared/grade-suggestions/file-text-extraction.ts";

const encoder = new TextEncoder();

describe("file text extraction", () => {
  it("nao extrai texto de arquivo DOCX e encaminha bytes para a IA", async () => {
    const extracted = await extractTextFromFileBuffer({
      fileName: "atividade.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(extracted.extractedText).toBe("");
    expect(extracted.extractionQuality).toBe("none");
    expect(extracted.requiresVisualAnalysis).toBe(true);
    expect(extracted.fileBytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("nao extrai texto de PDF e encaminha bytes para a IA", async () => {
    const extracted = await extractTextFromFileBuffer({
      fileName: "atividade.pdf",
      mimeType: "application/pdf",
      bytes: encoder.encode(
        "%PDF-1.4\n1 0 obj\n<<>>\nstream\nBT (Resposta final do aluno sobre monitoramento de computadores) Tj ET\nendstream\nendobj\n%%EOF",
      ),
    });

    expect(extracted.extractedText).toBe("");
    expect(extracted.extractionQuality).toBe("none");
    expect(extracted.requiresVisualAnalysis).toBe(true);
    expect(extracted.fileBytes).toBeDefined();
  });

  it("nao extrai texto de TXT e encaminha bytes para a IA", async () => {
    const extracted = await extractTextFromFileBuffer({
      fileName: "atividade.txt",
      mimeType: "text/plain",
      bytes: encoder.encode("Inventario concluido\nHostname: LAB-01"),
    });

    expect(extracted.extractedText).toBe("");
    expect(extracted.extractionQuality).toBe("none");
    expect(extracted.requiresVisualAnalysis).toBe(true);
    expect(extracted.fileBytes).toBeDefined();
  });

  it("preserva bytes da imagem PNG e marca como analise visual", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const extracted = await extractTextFromFileBuffer({
      fileName: "diagrama.png",
      mimeType: "image/png",
      bytes: pngBytes,
    });

    expect(extracted.requiresVisualAnalysis).toBe(true);
    expect(extracted.extractedText).toBe("");
    expect(extracted.fileBytes).toBeDefined();
    expect(extracted.fileBytes).toEqual(pngBytes);
    expect(extracted.warning).toBeNull();
  });

  it("preserva bytes de BMP para analise visual", async () => {
    const bmpBytes = new Uint8Array([0x42, 0x4d, 0x00, 0x00]);

    const extracted = await extractTextFromFileBuffer({
      fileName: "imagem.bmp",
      mimeType: "image/bmp",
      bytes: bmpBytes,
    });

    expect(extracted.requiresVisualAnalysis).toBe(true);
    expect(extracted.fileBytes).toEqual(bmpBytes);
    expect(extracted.warning).toBeNull();
  });
});
