import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  GraduationCap,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';

import {
  useEnrollmentFilterValues,
  useEnrollmentsData,
  useEnrollmentSummary,
} from '../hooks/useEnrollmentsData';
import { useImportEnrollments } from '../hooks/useImportEnrollments';
import {
  DEFAULT_ENROLLMENT_FILTERS,
  type EnrollmentFilters,
  type JsonEnrollmentRecord,
  type UcEnrollment,
} from '../types';
import { ENROLLMENTS_PAGE_SIZE } from '../api/enrollments.repository';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatLastAccess(date: string | null, never: boolean): string {
  if (never) return 'Nunca';
  if (!date) return '-';
  try {
    return formatDistanceToNow(parseISO(date), { addSuffix: true, locale: ptBR });
  } catch {
    return '-';
  }
}

function formatDate(date: string | null): string {
  if (!date) return '-';
  // date is an ISO date string like "2025-03-01"
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function RoleBadge({ role }: { role: string }) {
  const colorMap: Record<string, string> = {
    'Aluno': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    'Monitor': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    'Tutor': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    'Professor Presencial': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  };
  const cls = colorMap[role] ?? 'bg-muted text-muted-foreground';
  return <Badge variant="outline" className={cn('text-xs font-medium', cls)}>{role}</Badge>;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">-</span>;
  const colorMap: Record<string, string> = {
    'Ativo': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    'Não atualmente': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    'Suspenso': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  const cls = colorMap[status] ?? 'bg-muted text-muted-foreground';
  return <Badge variant="outline" className={cn('text-xs font-medium', cls)}>{status}</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import JSON dialog
// ─────────────────────────────────────────────────────────────────────────────

function ImportDialog() {
  const { isImporting, importEnrollments } = useImportEnrollments();
  const [open, setOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = (value: string) => {
    setJsonText(value);
    setParseError(null);
    setPreviewCount(null);
    if (!value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        setParseError('O JSON deve ser um array de objetos.');
        return;
      }
      setPreviewCount(parsed.length);
    } catch {
      setParseError('JSON inválido. Verifique a formatação.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      handleTextChange(text);
    } catch {
      setParseError('Não foi possível ler o arquivo.');
    }
  };

  const handleImport = async () => {
    if (!jsonText.trim()) return;
    let records: JsonEnrollmentRecord[];
    try {
      records = JSON.parse(jsonText) as JsonEnrollmentRecord[];
    } catch {
      setParseError('JSON inválido.');
      return;
    }
    const filename = fileInputRef.current?.files?.[0]?.name;
    const result = await importEnrollments(records, filename);
    if (result) {
      setOpen(false);
      setJsonText('');
      setPreviewCount(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const canImport = !parseError && previewCount !== null && previewCount > 0 && !isImporting;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          Importar JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar vínculos</DialogTitle>
          <DialogDescription>
            Cole o JSON de acompanhamento ou selecione um arquivo. Os registros serão inseridos
            ou atualizados na base (chave: iduc + cpf + papel).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Selecionar arquivo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
            {previewCount !== null && (
              <span className="text-sm text-muted-foreground">
                {previewCount} {previewCount === 1 ? 'registro' : 'registros'} detectados
              </span>
            )}
          </div>

          <textarea
            className="h-52 w-full rounded-md border bg-muted/30 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={'[\n  { "aluno": "...", "papel": "Aluno", "iduc": "...", ... }\n]'}
            value={jsonText}
            onChange={(e) => handleTextChange(e.target.value)}
          />

          {parseError && (
            <p className="text-sm text-destructive">{parseError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {isImporting ? (
              <><Spinner className="mr-2 h-4 w-4" />Importando...</>
            ) : (
              'Importar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary cards
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCards() {
  const { summary, isLoading } = useEnrollmentSummary();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 w-20 rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-12 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary || summary.total === 0) return null;

  const summaryCards = [
    { label: 'Total de vínculos', value: summary.total, icon: Users },
    ...Object.entries(summary.byRole)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([role, count]) => ({ label: role, value: count, icon: GraduationCap })),
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {summaryCards.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{value.toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment table row
// ─────────────────────────────────────────────────────────────────────────────

function EnrollmentRow({ enrollment }: { enrollment: UcEnrollment }) {
  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <p className="truncate font-medium">{enrollment.nomePessoa}</p>
          {enrollment.email && (
            <p className="truncate text-xs text-muted-foreground">{enrollment.email}</p>
          )}
          {enrollment.cpf && (
            <p className="text-xs text-muted-foreground">{enrollment.cpf}</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <RoleBadge role={enrollment.papel} />
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="min-w-0">
          <p className="truncate text-sm">{enrollment.ucName}</p>
          {enrollment.coursePath && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="truncate text-xs text-muted-foreground max-w-[200px] cursor-default">
                    {enrollment.coursePath}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  {enrollment.coursePath}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {enrollment.category && (
          <Badge variant="secondary" className="text-xs">{enrollment.category}</Badge>
        )}
      </TableCell>
      <TableCell>
        <StatusBadge status={enrollment.enrollmentStatus} />
      </TableCell>
      <TableCell className="hidden xl:table-cell text-sm">
        {enrollment.finalGradeNumeric !== null
          ? enrollment.finalGradeNumeric.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
          : '-'}
      </TableCell>
      <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
        {formatLastAccess(enrollment.lastUcAccessAt, enrollment.neverAccessedUc)}
      </TableCell>
      <TableCell className="hidden 2xl:table-cell text-sm text-muted-foreground">
        {formatDate(enrollment.enrolledAt)}
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function EnrollmentsPage() {
  const { isAdmin } = usePermissions();
  const [filters, setFilters] = useState<EnrollmentFilters>(DEFAULT_ENROLLMENT_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);

  const { items, totalCount, isLoading, isFetching, error } = useEnrollmentsData(
    filters,
    currentPage,
  );

  const roleOptions    = useEnrollmentFilterValues('papel');
  const statusOptions  = useEnrollmentFilterValues('status_uc');
  const categoryOptions = useEnrollmentFilterValues('categoria');
  const ucOptions      = useEnrollmentFilterValues('nome_uc');

  const totalPages = Math.max(1, Math.ceil(totalCount / ENROLLMENTS_PAGE_SIZE));
  const pageStart  = (currentPage - 1) * ENROLLMENTS_PAGE_SIZE;
  const hasFilters = filters.search || filters.papel || filters.statusUc
    || filters.categoria || filters.nomeUc;

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Keep current page within bounds
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const setFilter = <K extends keyof EnrollmentFilters>(key: K, value: EnrollmentFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters(DEFAULT_ENROLLMENT_FILTERS);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel de Gerência</h1>
          <p className="text-muted-foreground">
            Vínculos importados — sem dependência do Moodle em tempo real
          </p>
        </div>
        {isAdmin && <ImportDialog />}
      </div>

      {/* Summary cards */}
      <SummaryCards />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, e-mail ou CPF..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Papel */}
        <Select value={filters.papel || 'all'} onValueChange={(v) => setFilter('papel', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[170px]">
            <Filter className="mr-2 h-4 w-4 shrink-0" />
            <SelectValue placeholder="Papel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os papéis</SelectItem>
            {roleOptions.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status UC */}
        <Select value={filters.statusUc || 'all'} onValueChange={(v) => setFilter('statusUc', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Categoria */}
        {categoryOptions.length > 0 && (
          <Select value={filters.categoria || 'all'} onValueChange={(v) => setFilter('categoria', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* UC */}
        {ucOptions.length > 0 && (
          <Select value={filters.nomeUc || 'all'} onValueChange={(v) => setFilter('nomeUc', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Unidade Curricular" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as UCs</SelectItem>
              {ucOptions.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
            <X className="h-3 w-3" />
            Limpar
          </Button>
        )}

        {/* Fetching indicator */}
        {isFetching && !isLoading && (
          <Spinner className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Pessoa</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead className="hidden md:table-cell">Unidade Curricular</TableHead>
              <TableHead className="hidden lg:table-cell">Categoria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden xl:table-cell">Nota</TableHead>
              <TableHead className="hidden xl:table-cell">Último Acesso à UC</TableHead>
              <TableHead className="hidden 2xl:table-cell">Matriculado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <Spinner className="mx-auto h-6 w-6" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="space-y-1">
                    <p className="font-medium">Nenhum vínculo encontrado</p>
                    <p className="text-sm text-muted-foreground">
                      {hasFilters
                        ? 'Tente ajustar os filtros de busca'
                        : isAdmin
                          ? 'Use o botão "Importar JSON" para carregar os dados'
                          : 'Aguarde a importação dos dados pelo administrador'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((enrollment) => (
                <EnrollmentRow key={enrollment.id} enrollment={enrollment} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {pageStart + 1}–{Math.min(pageStart + ENROLLMENTS_PAGE_SIZE, totalCount)}{' '}
            de {totalCount.toLocaleString('pt-BR')} vínculos
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="min-w-24 text-center text-sm text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="gap-1"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
