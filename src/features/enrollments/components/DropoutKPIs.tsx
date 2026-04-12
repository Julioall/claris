import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  Clock,
  TrendingDown,
  UserCheck,
  UserX,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/StatCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useDropoutKPIs } from '../hooks/useDropoutKPIs';
import { KpiTooltip } from './KpiTooltip';
import type { EnrollmentDashboardFilters } from '../types';

interface DropoutKPIsProps {
  hasData: boolean;
  filters: EnrollmentDashboardFilters;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtPct(value: number) {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtInt(value: number) {
  return value.toLocaleString('pt-BR');
}

function fmtDays(value: number | null) {
  if (value === null) return '-';
  return `${fmtInt(value)} dias`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Red = high dropout is bad */
function DropoutCell({ value }: { value: number }) {
  const color =
    value < 15
      ? 'text-green-600 dark:text-green-400'
      : value < 30
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-red-600 dark:text-red-400';
  return <span className={color}>{fmtPct(value)}</span>;
}

/** Green = high retention is good */
function RetentionCell({ value }: { value: number }) {
  const color =
    value >= 75
      ? 'text-green-600 dark:text-green-400'
      : value >= 50
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-red-600 dark:text-red-400';
  return <span className={color}>{fmtPct(value)}</span>;
}

function barColor(dropoutRate: number) {
  if (dropoutRate >= 30) return '#dc2626';
  if (dropoutRate >= 15) return '#d97706';
  return '#0f766e';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DropoutKPIs({ hasData, filters }: DropoutKPIsProps) {
  const { data, isLoading, error } = useDropoutKPIs(filters, hasData);

  if (!hasData) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Análise de Fuga de Alunos
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-40 items-center justify-center">
          <Spinner className="h-6 w-6" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Análise de Fuga de Alunos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {error ?? 'Sem dados de evasão disponíveis.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { global, topUcsByDropout, tutorDropout, monitorDropout, categoryDropout, schoolRetention } = data;

  const categoryBarData = categoryDropout.slice(0, 10).map((cat) => ({
    name: cat.category.length > 22 ? `${cat.category.slice(0, 20)}…` : cat.category,
    fullName: cat.category,
    evasao: parseFloat(cat.dropoutRate.toFixed(1)),
    fill: barColor(cat.dropoutRate),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-primary" />
          Análise de Fuga de Alunos
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Taxa de evasão e retenção por UC, tutor, monitor, categoria de curso e escola. Engajamento
          calculado a partir dos dados importados do Moodle.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Global KPI cards */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Taxa de evasão geral"
            value={fmtPct(global.dropoutRate)}
            subtitle={`${fmtInt(global.evadedCount)} matrículas evadidas`}
            icon={TrendingDown}
            variant="risk"
            tooltip="Percentual de matrículas consideradas evadidas sobre o total de registros importados. Cálculo: evadidos ÷ total de registros × 100."
          />
          <StatCard
            title="Taxa de retenção (ativos)"
            value={fmtPct(global.activeRate)}
            subtitle={`${fmtInt(global.activeCount)} alunos ativos`}
            icon={UserCheck}
            variant="success"
            tooltip="Percentual de alunos com status ativo sobre o total de registros. Complementar à taxa de evasão. Cálculo: alunos ativos ÷ total × 100."
          />
          <StatCard
            title="Alunos únicos na base"
            value={fmtInt(global.totalStudents)}
            subtitle="nomes distintos"
            icon={UserX}
            variant="default"
            tooltip="Total de nomes distintos na base importada, incluído ativos e evadidos. Um aluno pode aparecer em várias UCs."
          />
          <StatCard
            title="Média dias até evasão"
            value={fmtDays(global.avgDaysToDropout)}
            subtitle={
              global.avgDaysInCourse !== null
                ? `Duração média do curso: ${fmtDays(global.avgDaysInCourse)}`
                : 'tempo do último acesso ao abandono'
            }
            icon={Clock}
            variant="pending"
            tooltip="Média de dias entre a data de matrícula e o último acesso registrado, calculada apenas para alunos identificados como evadidos."
          />
        </div>

        <Tabs defaultValue="ucs" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="ucs">Por UC</TabsTrigger>
            <TabsTrigger value="tutores">Por Tutor</TabsTrigger>
            <TabsTrigger value="monitores">Por Monitor</TabsTrigger>
            <TabsTrigger value="categorias">Por Categoria</TabsTrigger>
            <TabsTrigger value="escolas">Por Escola</TabsTrigger>
          </TabsList>

          {/* ── Tab: Por UC ──────────────────────────────────────────────── */}
          <TabsContent value="ucs" className="mt-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  Taxa de Evasão por Unidade Curricular
                  <KpiTooltip content="Top 25 UCs com maior taxa de evasão. Taxa = evadidos ÷ total de matrículas na UC × 100. ‘Nunca acessou’ indica matrícula sem nenhum acesso registrado, sem necessariamente constar como evadido formalmente." />
                </CardTitle>
                <CardDescription>
                  Top 25 UCs com maior evasão. "Nunca acessou" indica baixo engajamento sem
                  necessariamente constar como evadido.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {topUcsByDropout.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma UC com dados de evasão.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Unidade Curricular</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Ativos</TableHead>
                        <TableHead className="text-right">Evadidos</TableHead>
                        <TableHead className="text-right">Taxa Evasão</TableHead>
                        <TableHead className="text-right">Nunca Acessou</TableHead>
                        <TableHead className="text-right">Sem Acesso %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topUcsByDropout.map((uc) => (
                        <TableRow key={uc.ucId}>
                          <TableCell
                            className="max-w-[200px] truncate font-medium"
                            title={uc.ucName}
                          >
                            {uc.ucName}
                          </TableCell>
                          <TableCell className="text-right">{fmtInt(uc.totalStudents)}</TableCell>
                          <TableCell className="text-right">{fmtInt(uc.activeCount)}</TableCell>
                          <TableCell className="text-right">{fmtInt(uc.evadedCount)}</TableCell>
                          <TableCell className="text-right">
                            <DropoutCell value={uc.dropoutRate} />
                          </TableCell>
                          <TableCell className="text-right">{fmtInt(uc.neverAccessedCount)}</TableCell>
                          <TableCell className="text-right">
                            <DropoutCell value={uc.neverAccessRate} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Por Tutor ───────────────────────────────────────────── */}
          <TabsContent value="tutores" className="mt-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  Taxa de Evasão por Tutor
                  <KpiTooltip content="Percentual de alunos evadidos nas UCs gerenciadas por cada tutor. ‘Dias até abandono’ = do registro de matrícula ao último acesso registrado pelo aluno." />
                </CardTitle>
                <CardDescription>
                  Percentual de alunos evadidos nas UCs gerenciadas por cada tutor.
                  "Dias até abandono" é calculado do momento de matrícula ao último acesso registrado.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {tutorDropout.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum tutor identificado na base importada.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tutor</TableHead>
                        <TableHead className="text-right">Alunos</TableHead>
                        <TableHead className="text-right">Ativos</TableHead>
                        <TableHead className="text-right">Evadidos</TableHead>
                        <TableHead className="text-right">Taxa Evasão</TableHead>
                        <TableHead className="text-right">Retenção</TableHead>
                        <TableHead className="text-right">Média Dias até Abandono</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tutorDropout.map((tutor) => (
                        <TableRow key={tutor.tutorName}>
                          <TableCell
                            className="max-w-[180px] truncate font-medium"
                            title={tutor.tutorName}
                          >
                            {tutor.tutorName}
                          </TableCell>
                          <TableCell className="text-right">{fmtInt(tutor.totalStudents)}</TableCell>
                          <TableCell className="text-right">{fmtInt(tutor.activeCount)}</TableCell>
                          <TableCell className="text-right">{fmtInt(tutor.evadedCount)}</TableCell>
                          <TableCell className="text-right">
                            <DropoutCell value={tutor.dropoutRate} />
                          </TableCell>
                          <TableCell className="text-right">
                            <RetentionCell value={tutor.activeRate} />
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">
                            {fmtDays(tutor.avgDaysToDropout)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Por Monitor ─────────────────────────────────────────── */}
          <TabsContent value="monitores" className="mt-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  Taxa de Evasão por Monitor
                  <KpiTooltip content="Percentual de alunos evadidos nas UCs gerenciadas por cada monitor. ‘Dias até abandono’ = do registro de matrícula ao último acesso registrado pelo aluno." />
                </CardTitle>
                <CardDescription>
                  Percentual de alunos evadidos nas UCs gerenciadas por cada monitor.
                  "Dias até abandono" é calculado do momento de matrícula ao último acesso registrado.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {monitorDropout.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum monitor identificado na base importada.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Monitor</TableHead>
                        <TableHead className="text-right">Alunos</TableHead>
                        <TableHead className="text-right">Ativos</TableHead>
                        <TableHead className="text-right">Evadidos</TableHead>
                        <TableHead className="text-right">Taxa Evasão</TableHead>
                        <TableHead className="text-right">Retenção</TableHead>
                        <TableHead className="text-right">Média Dias até Abandono</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monitorDropout.map((monitor) => (
                        <TableRow key={monitor.tutorName}>
                          <TableCell
                            className="max-w-[180px] truncate font-medium"
                            title={monitor.tutorName}
                          >
                            {monitor.tutorName}
                          </TableCell>
                          <TableCell className="text-right">{fmtInt(monitor.totalStudents)}</TableCell>
                          <TableCell className="text-right">{fmtInt(monitor.activeCount)}</TableCell>
                          <TableCell className="text-right">{fmtInt(monitor.evadedCount)}</TableCell>
                          <TableCell className="text-right">
                            <DropoutCell value={monitor.dropoutRate} />
                          </TableCell>
                          <TableCell className="text-right">
                            <RetentionCell value={monitor.activeRate} />
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">
                            {fmtDays(monitor.avgDaysToDropout)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Por Categoria ───────────────────────────────────────── */}
          <TabsContent value="categorias" className="mt-3 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  Evasão por Tipo de Curso
                  <KpiTooltip content="Gráfico comparativo da taxa de evasão entre categorias de curso. Barras em verde (&lt;15%), amarelo (15–30%) ou vermelho (≥30%) conforme o nível de evasão." />
                </CardTitle>
                <CardDescription>
                  Comparativo de evasão, engajamento e duração entre categorias de curso.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {categoryBarData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados de categoria.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={categoryBarData}
                      layout="vertical"
                      margin={{ left: 4, right: 40, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        width={100}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, 'Taxa de Evasão']}
                        labelFormatter={(label: string) => {
                          const found = categoryBarData.find((d) => d.name === label);
                          return found?.fullName ?? label;
                        }}
                      />
                      <Bar dataKey="evasao" radius={[0, 4, 4, 0]}>
                        {categoryBarData.map((entry, index) => (
                          <Cell key={`bar-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  Detalhamento por Categoria
                  <KpiTooltip content="Acesso, retenção e tempo médio de permanência por tipo de curso. ‘Tempo médio no curso’ é calculado da data de matrícula ao último acesso registrado." />
                </CardTitle>
                <CardDescription>
                  Acesso, retenção e tempo médio de permanência por tipo de curso.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {categoryDropout.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados de categoria.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">UCs</TableHead>
                        <TableHead className="text-right">Alunos</TableHead>
                        <TableHead className="text-right">Taxa Evasão</TableHead>
                        <TableHead className="text-right">Retenção</TableHead>
                        <TableHead className="text-right">Taxa Acesso</TableHead>
                        <TableHead className="text-right">Tempo Médio no Curso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryDropout.map((cat) => (
                        <TableRow key={cat.category}>
                          <TableCell
                            className="max-w-[180px] truncate font-medium"
                            title={cat.category}
                          >
                            {cat.category}
                          </TableCell>
                          <TableCell className="text-right">{fmtInt(cat.ucCount)}</TableCell>
                          <TableCell className="text-right">{fmtInt(cat.totalStudents)}</TableCell>
                          <TableCell className="text-right">
                            <DropoutCell value={cat.dropoutRate} />
                          </TableCell>
                          <TableCell className="text-right">
                            <RetentionCell value={cat.activeRate} />
                          </TableCell>
                          <TableCell className="text-right">
                            <RetentionCell value={cat.accessRate} />
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">
                            {fmtDays(cat.avgDaysInCourse)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Por Escola ──────────────────────────────────────────── */}
          <TabsContent value="escolas" className="mt-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Building2 className="h-4 w-4" />
                  Taxa de Retenção por Escola / Instituição
                  <KpiTooltip content="Percentual de alunos ativos por escola (taxa = ativos ÷ total × 100), derivada do caminho do curso no Moodle. Escolas ordenadas pelo volume de alunos." />
                </CardTitle>
                <CardDescription>
                  Percentual de alunos ativos por escola, derivado do caminho do curso no Moodle.
                  Escolas ordenadas pelo volume de alunos.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {schoolRetention.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma escola identificada nos dados importados.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Escola / Instituição</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Ativos</TableHead>
                        <TableHead className="text-right">Evadidos</TableHead>
                        <TableHead className="text-right">Retenção</TableHead>
                        <TableHead className="text-right">Evasão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schoolRetention.map((school) => (
                        <TableRow key={school.school}>
                          <TableCell
                            className="max-w-[220px] truncate font-medium"
                            title={school.school}
                          >
                            {school.school}
                          </TableCell>
                          <TableCell className="text-right">{fmtInt(school.totalStudents)}</TableCell>
                          <TableCell className="text-right">{fmtInt(school.activeCount)}</TableCell>
                          <TableCell className="text-right">{fmtInt(school.evadedCount)}</TableCell>
                          <TableCell className="text-right">
                            <RetentionCell value={school.retentionRate} />
                          </TableCell>
                          <TableCell className="text-right">
                            <DropoutCell value={school.dropoutRate} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Contextual legend */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
            Evasão &lt; 15% / Retenção ≥ 75%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" />
            Evasão 15–30% / Retenção 50–75%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            Evasão ≥ 30% / Retenção &lt; 50%
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            "Nunca acessou" pode indicar matrícula inativa sem registro de desistência formal.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
