import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

import { streamJsonArrayFile, type JsonArrayStreamProgress } from '../lib/streamJsonArrayFile';
import type { JsonEnrollmentRecord } from '../types';
import { enrollmentKeys } from './useEnrollmentsData';

interface ImportChunkResponse {
  batchId: string;
  processed: number;
  imported: number;
  ignored: number;
  totalImported: number;
  deleted?: number;
  completed?: boolean;
}

export interface EnrollmentImportProgress extends JsonArrayStreamProgress {
  fileName: string;
  chunksSent: number;
  currentFileIndex: number;
  totalFiles: number;
}

interface ImportResult {
  batchId: string;
  total: number;
  upserted: number;
  ignored: number;
  deleted: number;
}

interface ImportManyResult {
  filesProcessed: number;
  filesSucceeded: number;
  filesFailed: number;
  totalRecords: number;
  totalUpserted: number;
  totalIgnored: number;
  totalDeleted: number;
}

function isJsonEnrollmentRecord(value: unknown): value is JsonEnrollmentRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.aluno === 'string' &&
    typeof record.iduc === 'string' &&
    typeof record.papel === 'string'
  );
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeImportChunkWithRetry(
  payload: {
    batchId?: string | null;
    filename?: string;
    records?: JsonEnrollmentRecord[];
    finalize?: boolean;
  },
  maxAttempts = 3,
): Promise<ImportChunkResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await supabase.functions.invoke<ImportChunkResponse>(
      'import-uc-enrollments',
      { body: payload },
    );

    if (!error && data) {
      return data;
    }

    lastError = new Error(error?.message || 'Falha ao enviar lote de importacao.');

    if (attempt < maxAttempts) {
      await wait(attempt * 1000);
    }
  }

  throw lastError ?? new Error('Falha ao enviar lote de importacao.');
}

export function useImportEnrollments() {
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<EnrollmentImportProgress | null>(null);

  const resetProgress = () => setProgress(null);

  const importOneFile = async (
    file: File,
    currentFileIndex: number,
    totalFiles: number,
    showToasts = false,
  ): Promise<ImportResult | null> => {
    if (file.size === 0) {
      if (showToasts) {
        toast({ title: `Arquivo vazio: ${file.name}`, variant: 'destructive' });
      }
      return null;
    }

    setProgress({
      fileName: file.name,
      bytesRead: 0,
      totalBytes: file.size,
      percent: 0,
      recordsRead: 0,
      chunksSent: 0,
      currentFileIndex,
      totalFiles,
    });

    let batchId: string | null = null;
    let totalRecords = 0;
    let totalIgnored = 0;
    let chunksSent = 0;

    try {
      const streamResult = await streamJsonArrayFile<JsonEnrollmentRecord>(file, {
        recordsPerChunk: 1000,
        isRecord: isJsonEnrollmentRecord,
        onProgress: (streamProgress) => {
          setProgress((current) => ({
            fileName: current?.fileName ?? file.name,
            chunksSent,
            currentFileIndex,
            totalFiles,
            ...streamProgress,
          }));
        },
        onChunk: async (records) => {
          const data = await invokeImportChunkWithRetry({
            batchId,
            filename: batchId ? undefined : file.name,
            records,
          });

          if (!data.batchId) {
            throw new Error('Resposta invalida ao importar o arquivo.');
          }

          batchId = data.batchId;
          chunksSent += 1;
          totalRecords += data.processed;
          totalIgnored += data.ignored;

          setProgress((current) => ({
            fileName: current?.fileName ?? file.name,
            bytesRead: current?.bytesRead ?? 0,
            totalBytes: current?.totalBytes ?? file.size,
            percent: current?.percent ?? 0,
            recordsRead: totalRecords,
            chunksSent,
            currentFileIndex,
            totalFiles,
          }));
        },
      });

      if (!batchId || streamResult.totalRecords === 0) {
        if (showToasts) {
          toast({ title: `Arquivo vazio: ${file.name}`, variant: 'destructive' });
        }
        return null;
      }

      const finalData = await invokeImportChunkWithRetry({
        batchId,
        filename: file.name,
        finalize: true,
      });

      if (!finalData?.batchId || !finalData.completed) {
        throw new Error('A finalizacao da importacao falhou.');
      }

      const result = {
        batchId: finalData.batchId,
        total: totalRecords,
        upserted: finalData.totalImported,
        ignored: totalIgnored,
        deleted: finalData.deleted ?? 0,
      };

      if (showToasts) {
        const descriptionParts = [`${result.upserted} vinculos importados`];

        if (result.ignored > 0) {
          descriptionParts.push(`${result.ignored} registros ignorados`);
        }

        if (result.deleted > 0) {
          descriptionParts.push(`${result.deleted} registros antigos removidos`);
        }

        toast({
          title: 'Importacao concluida',
          description: descriptionParts.join(' | '),
        });
      }

      setProgress({
        fileName: file.name,
        bytesRead: file.size,
        totalBytes: file.size,
        percent: 100,
        recordsRead: result.total,
        chunksSent,
        currentFileIndex,
        totalFiles,
      });

      return result;
    } catch (error) {
      if (showToasts) {
        toast({
          title: `Erro na importacao: ${file.name}`,
          description: error instanceof Error ? error.message : 'Erro desconhecido',
          variant: 'destructive',
        });
      }
      return null;
    }
  };

  const importFiles = async (files: File[]): Promise<ImportManyResult | null> => {
    if (files.length === 0) return null;

    setIsImporting(true);

    let filesSucceeded = 0;
    let filesFailed = 0;
    let totalRecords = 0;
    let totalUpserted = 0;
    let totalIgnored = 0;
    let totalDeleted = 0;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const result = await importOneFile(file, index + 1, files.length, false);

        if (!result) {
          filesFailed += 1;
          continue;
        }

        filesSucceeded += 1;
        totalRecords += result.total;
        totalUpserted += result.upserted;
        totalIgnored += result.ignored;
        totalDeleted += result.deleted;
      }

      await queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });

      if (filesSucceeded === 0) {
        toast({
          title: 'Importacao nao concluida',
          description: 'Nenhum arquivo foi importado com sucesso.',
          variant: 'destructive',
        });
      } else {
        const summaryParts = [
          `${filesSucceeded}/${files.length} arquivo(s) importado(s)`,
          `${totalUpserted} vinculos importados`,
        ];

        if (totalIgnored > 0) {
          summaryParts.push(`${totalIgnored} registros ignorados`);
        }

        if (totalDeleted > 0) {
          summaryParts.push(`${totalDeleted} registros antigos removidos`);
        }

        if (filesFailed > 0) {
          summaryParts.push(`${filesFailed} arquivo(s) com falha`);
        }

        toast({
          title: 'Importacao concluida',
          description: summaryParts.join(' | '),
          variant: filesFailed > 0 ? 'destructive' : 'default',
        });
      }

      return {
        filesProcessed: files.length,
        filesSucceeded,
        filesFailed,
        totalRecords,
        totalUpserted,
        totalIgnored,
        totalDeleted,
      };
    } finally {
      setIsImporting(false);
    }
  };

  const importFile = async (file: File): Promise<ImportResult | null> => {
    setIsImporting(true);

    try {
      const result = await importOneFile(file, 1, 1, true);

      if (result) {
        await queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      }

      return result;
    } finally {
      setIsImporting(false);
    }
  };

  return { importFile, importFiles, isImporting, progress, resetProgress };
}
