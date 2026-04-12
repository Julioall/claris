import { useRef, useState } from 'react';
import { FileJson, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

import { useImportEnrollments } from '../hooks/useImportEnrollments';

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

export function EnrollmentImportDialog() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { importFiles, isImporting, progress, resetProgress } = useImportEnrollments();

  const resetDialog = () => {
    setSelectedFiles([]);
    resetProgress();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isImporting) return;
    setOpen(nextOpen);

    if (!nextOpen) {
      resetDialog();
    }
  };

  const handleImport = async () => {
    if (selectedFiles.length === 0) return;

    const result = await importFiles(selectedFiles);
    if (!result) return;

    setOpen(false);
    resetDialog();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          Importar JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar arquivo de gerencia</DialogTitle>
          <DialogDescription>
            Use o JSON exportado do Moodle. A importacao cria um snapshot novo da gerencia
            sem sincronizacao direta com a plataforma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Arquivo exportado do Moodle</p>
                <p className="text-xs text-muted-foreground">
                  Entradas com papel `Professor Presencial` sao ignoradas. Selecione um ou mais arquivos.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => inputRef.current?.click()}
                disabled={isImporting}
              >
                <FileJson className="h-4 w-4" />
                Selecionar arquivos
              </Button>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              multiple
              className="hidden"
              onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
            />

            {selectedFiles.length > 0 ? (
              <div className="mt-4 space-y-2 rounded-md bg-muted/40 p-3">
                <p className="text-sm font-medium">
                  {selectedFiles.length} arquivo(s) selecionado(s)
                </p>
                <div className="max-h-40 space-y-1 overflow-auto pr-1">
                  {selectedFiles.map((file) => (
                    <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-foreground" title={file.name}>{file.name}</span>
                      <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Selecione um ou mais arquivos `.json` completos exportados pelo Moodle.
              </p>
            )}
          </div>

          <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            <p>Regras de importacao:</p>
            <p>1. Apenas `Aluno`, `Monitor` e `Tutor` entram na gerencia.</p>
            <p>2. O arquivo e processado em partes para suportar volumes grandes.</p>
            <p>3. Ao concluir, o snapshot anterior e substituido pelo novo.</p>
          </div>

          {progress && (
            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium">Progresso da importacao</span>
                <span className="text-muted-foreground">
                  Arquivo {progress.currentFileIndex} de {progress.totalFiles} · {progress.percent}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate" title={progress.fileName}>
                {progress.fileName}
              </p>
              <Progress value={progress.percent} className="h-2" />
              <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {formatFileSize(progress.bytesRead)} de {formatFileSize(progress.totalBytes)} lidos
                </span>
                <span>
                  {progress.recordsRead.toLocaleString('pt-BR')} registros processados
                </span>
                <span>
                  {progress.chunksSent.toLocaleString('pt-BR')} lotes enviados
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isImporting}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={selectedFiles.length === 0 || isImporting}>
            {isImporting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Importando...
              </>
            ) : (
              'Importar arquivos'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
