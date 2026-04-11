import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { JsonEnrollmentRecord } from '../types';
import { enrollmentKeys } from './useEnrollmentsData';

interface ImportResult {
  batchId: string;
  total: number;
  upserted: number;
  errors?: string[];
}

export function useImportEnrollments() {
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);

  const importEnrollments = async (
    records: JsonEnrollmentRecord[],
    filename?: string,
  ): Promise<ImportResult | null> => {
    if (records.length === 0) {
      toast({ title: 'Arquivo vazio', variant: 'destructive' });
      return null;
    }

    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke<ImportResult>(
        'import-uc-enrollments',
        { body: { records, filename } },
      );

      if (error) {
        toast({
          title: 'Erro na importação',
          description: error.message,
          variant: 'destructive',
        });
        return null;
      }

      if (data) {
        if (data.errors && data.errors.length > 0) {
          toast({
            title: 'Importação parcial',
            description: `${data.upserted} de ${data.total} registros importados. Verifique os erros.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Importação concluída',
            description: `${data.upserted} vínculos importados com sucesso.`,
          });
        }

        // Invalidate all enrollment queries so the panel refreshes
        await queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
        return data;
      }

      return null;
    } finally {
      setIsImporting(false);
    }
  };

  return { importEnrollments, isImporting };
}
