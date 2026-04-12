import { describe, expect, it } from 'vitest';

import { streamJsonArrayReadable } from '../streamJsonArrayFile';

function createChunkedStream(parts: string[]) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
}

function isEnrollmentRecord(value: unknown): value is { aluno: string; papel: string; iduc: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.aluno === 'string' &&
    typeof record.papel === 'string' &&
    typeof record.iduc === 'string'
  );
}

describe('streamJsonArrayReadable', () => {
  it('streams a JSON array in object chunks', async () => {
    const streamedChunks: Array<Array<{ aluno: string; papel: string; iduc: string }>> = [];

    const result = await streamJsonArrayReadable<{ aluno: string; papel: string; iduc: string }>(
      createChunkedStream([
        '[{"aluno":"Ana","papel":"Aluno","iduc":"1"},',
        '{"aluno":"Bruno","papel":"Monitor","iduc":"2"},',
        '{"aluno":"Carla","papel":"Tutor","iduc":"3"}]',
      ]),
      {
        totalBytes: 140,
        recordsPerChunk: 2,
        isRecord: isEnrollmentRecord,
        onChunk: async (records) => {
          streamedChunks.push(records);
        },
      },
    );

    expect(result).toEqual({ totalRecords: 3, chunkCount: 2 });
    expect(streamedChunks).toEqual([
      [
        { aluno: 'Ana', papel: 'Aluno', iduc: '1' },
        { aluno: 'Bruno', papel: 'Monitor', iduc: '2' },
      ],
      [
        { aluno: 'Carla', papel: 'Tutor', iduc: '3' },
      ],
    ]);
  });

  it('extracts records from a wrapper object', async () => {
    const streamedChunks: Array<Array<{ aluno: string; papel: string; iduc: string }>> = [];

    const result = await streamJsonArrayReadable<{ aluno: string; papel: string; iduc: string }>(
      createChunkedStream([
        '{"metadata":{"source":"moodle"},"items":[',
        '{"aluno":"Ana","papel":"Aluno","iduc":"1"},',
        '{"aluno":"Bia","papel":"Tutor","iduc":"2"}',
        ']}',
      ]),
      {
        totalBytes: 160,
        isRecord: isEnrollmentRecord,
        onChunk: async (records) => {
          streamedChunks.push(records);
        },
      },
    );

    expect(result).toEqual({ totalRecords: 2, chunkCount: 1 });
    expect(streamedChunks).toEqual([
      [
        { aluno: 'Ana', papel: 'Aluno', iduc: '1' },
        { aluno: 'Bia', papel: 'Tutor', iduc: '2' },
      ],
    ]);
  });

  it('extracts records from ndjson', async () => {
    const streamedChunks: Array<Array<{ aluno: string; papel: string; iduc: string }>> = [];

    const result = await streamJsonArrayReadable<{ aluno: string; papel: string; iduc: string }>(
      createChunkedStream([
        '{"aluno":"Ana","papel":"Aluno","iduc":"1"}\n',
        '{"aluno":"Bia","papel":"Tutor","iduc":"2"}\n',
      ]),
      {
        totalBytes: 96,
        isRecord: isEnrollmentRecord,
        onChunk: async (records) => {
          streamedChunks.push(records);
        },
      },
    );

    expect(result).toEqual({ totalRecords: 2, chunkCount: 1 });
    expect(streamedChunks).toEqual([
      [
        { aluno: 'Ana', papel: 'Aluno', iduc: '1' },
        { aluno: 'Bia', papel: 'Tutor', iduc: '2' },
      ],
    ]);
  });

  it('fails when no valid records are found', async () => {
    await expect(
      streamJsonArrayReadable(createChunkedStream(['{"metadata":{"source":"moodle"}}']), {
        totalBytes: 32,
        isRecord: isEnrollmentRecord,
        onChunk: async () => {},
      }),
    ).rejects.toThrow(/nenhum registro json valido/i);
  });
});
