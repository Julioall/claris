export interface JsonArrayStreamProgress {
  bytesRead: number;
  totalBytes: number;
  percent: number;
  recordsRead: number;
}

export interface JsonArrayChunkMeta {
  chunkIndex: number;
  recordsRead: number;
}

interface StreamJsonArrayOptions<T> {
  totalBytes: number;
  recordsPerChunk?: number;
  onChunk: (records: T[], meta: JsonArrayChunkMeta) => Promise<void> | void;
  onProgress?: (progress: JsonArrayStreamProgress) => void;
  isRecord?: (value: unknown) => value is T;
}

interface StreamJsonArrayResult {
  totalRecords: number;
  chunkCount: number;
}

const DEFAULT_RECORDS_PER_CHUNK = 1000;

function createProgress(
  bytesRead: number,
  totalBytes: number,
  recordsRead: number,
): JsonArrayStreamProgress {
  return {
    bytesRead,
    totalBytes,
    percent: totalBytes > 0 ? Math.min(100, Math.round((bytesRead / totalBytes) * 100)) : 0,
    recordsRead,
  };
}

export async function streamJsonArrayReadable<T extends Record<string, unknown>>(
  stream: ReadableStream<Uint8Array>,
  {
    totalBytes,
    recordsPerChunk = DEFAULT_RECORDS_PER_CHUNK,
    onChunk,
    onProgress,
    isRecord,
  }: StreamJsonArrayOptions<T>,
): Promise<StreamJsonArrayResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let cursor = 0;
  let bytesRead = 0;
  let recordsRead = 0;
  let chunkIndex = 0;
  let inString = false;
  let escapeNext = false;
  let objectStartStack: number[] = [];
  let pendingChunk: T[] = [];

  const emitProgress = () => {
    onProgress?.(createProgress(bytesRead, totalBytes, recordsRead));
  };

  const flushChunk = async () => {
    if (pendingChunk.length === 0) return;

    chunkIndex += 1;
    const records = pendingChunk;
    pendingChunk = [];
    await onChunk(records, { chunkIndex, recordsRead });
  };

  const maybeEmitObject = async (jsonText: string) => {
    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('Arquivo JSON invalido.');
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return;
    }

    if (isRecord && !isRecord(parsed)) {
      return;
    }

    pendingChunk.push(parsed as T);
    recordsRead += 1;
    emitProgress();

    if (pendingChunk.length >= recordsPerChunk) {
      await flushChunk();
    }
  };

  const trimConsumedPrefix = () => {
    const earliestOpenObjectStart =
      objectStartStack.length > 0 ? Math.min(...objectStartStack) : cursor;

    if (earliestOpenObjectStart <= 0) {
      return;
    }

    buffer = buffer.slice(earliestOpenObjectStart);
    cursor -= earliestOpenObjectStart;
    objectStartStack = objectStartStack.map((index) => index - earliestOpenObjectStart);
  };

  const processBuffer = async (isFinalChunk: boolean) => {
    while (cursor < buffer.length) {
      const char = buffer[cursor];

      if (inString) {
        if (escapeNext) {
          escapeNext = false;
        } else if (char === '\\') {
          escapeNext = true;
        } else if (char === '"') {
          inString = false;
        }

        cursor += 1;
        continue;
      }

      if (char === '"') {
        inString = true;
        cursor += 1;
        continue;
      }

      if (char === '{') {
        objectStartStack.push(cursor);
        cursor += 1;
        continue;
      }

      if (char === '}') {
        const objectStart = objectStartStack.pop();
        cursor += 1;

        if (objectStart !== undefined) {
          await maybeEmitObject(buffer.slice(objectStart, cursor));
        }

        trimConsumedPrefix();
        continue;
      }

      cursor += 1;
    }

    trimConsumedPrefix();

    if (isFinalChunk) {
      if (objectStartStack.length > 0 || inString) {
        throw new Error('Arquivo JSON incompleto.');
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        await processBuffer(true);
        break;
      }

      bytesRead += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      emitProgress();
      await processBuffer(false);
    }

    await flushChunk();
    emitProgress();

    if (recordsRead === 0) {
      throw new Error('Nenhum registro JSON valido foi encontrado no arquivo.');
    }

    return { totalRecords: recordsRead, chunkCount: chunkIndex };
  } finally {
    reader.releaseLock();
  }
}

export async function streamJsonArrayFile<T extends Record<string, unknown>>(
  file: Blob,
  options: Omit<StreamJsonArrayOptions<T>, 'totalBytes'>,
): Promise<StreamJsonArrayResult> {
  return streamJsonArrayReadable(file.stream(), {
    ...options,
    totalBytes: file.size,
  });
}
