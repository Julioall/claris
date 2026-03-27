import { beforeEach, describe, expect, it, vi } from "vitest";

const unzipSyncMock = vi.fn();
const unzlibSyncMock = vi.fn((bytes: Uint8Array) => bytes);

vi.mock("fflate", () => ({
  unzipSync: unzipSyncMock,
  unzlibSync: unzlibSyncMock,
}));

import { extractTextFromFileBuffer } from "../../../../supabase/functions/_shared/grade-suggestions/file-text-extraction.ts";

const encoder = new TextEncoder();

describe("file text extraction", () => {
  beforeEach(() => {
    unzipSyncMock.mockReset();
    unzlibSyncMock.mockClear();
  });

  it("extrai texto de arquivo DOCX", async () => {
    unzipSyncMock.mockReturnValue({
      "word/document.xml": encoder.encode(
        '<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Relatorio do aluno com evidencias do SAP</w:t></w:r></w:p></w:body></w:document>',
      ),
    });

    const extracted = await extractTextFromFileBuffer({
      fileName: "atividade.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(unzipSyncMock).toHaveBeenCalled();
    expect(extracted.extractedText).toContain("Relatorio do aluno");
    expect(extracted.requiresVisualAnalysis).toBe(false);
  });

  it("extrai texto de PDF com conteudo textual nativo", async () => {
    const extracted = await extractTextFromFileBuffer({
      fileName: "atividade.pdf",
      mimeType: "application/pdf",
      bytes: encoder.encode(
        "%PDF-1.4\n1 0 obj\n<<>>\nstream\nBT (Resposta final do aluno sobre monitoramento de computadores) Tj ET\nendstream\nendobj\n%%EOF",
      ),
    });

    expect(extracted.extractedText).toContain("Resposta final do aluno");
    expect(extracted.requiresVisualAnalysis).toBe(false);
  });

  it("extrai texto de arquivo TXT", async () => {
    const extracted = await extractTextFromFileBuffer({
      fileName: "atividade.txt",
      mimeType: "text/plain",
      bytes: encoder.encode("Inventario concluido\nHostname: LAB-01"),
    });

    expect(extracted.extractedText).toContain("Inventario concluido Hostname: LAB-01");
    expect(extracted.extractionQuality).toBe("low");
  });
});
