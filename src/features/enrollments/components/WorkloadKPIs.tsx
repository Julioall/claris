import { useState } from 'react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BookOpen,
  GraduationCap,
  Layers,
  Users,
  UserSquare2,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/StatCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useWorkloadKPIs } from '../hooks/useWorkloadKPIs';
import { KpiTooltip } from './KpiTooltip';
import type { EnrollmentDashboardFilters } from '../types';

interface WorkloadKPIsProps {
  hasData: boolean;
  filters: EnrollmentDashboardFilters;
}

function fmt(value: number, decimals = 1) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(value: number) {
  return `${fmt(value)}%`;
}

function fmtGrade(value: number | null) {
  if (value === null) return '-';
  return fmt(value);
}

function fmtInt(value: number) {
  return value.toLocaleString('pt-BR');
}

function RateCell({ value }: { value: number }) {
  const color =
    value >= 75
      ? 'text-green-600 dark:text-green-400'
      : value >= 50
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-red-600 dark:text-red-400';
  return <span className={color}>{fmtPct(value)}</span>;
}

export function WorkloadKPIs({ hasData, filters }: WorkloadKPIsProps) {
  const { data, isLoading, error } = useWorkloadKPIs(filters, hasData);
  const [actorTab, setActorTab] = useState<'tutores' | 'monitores'>('tutores');

  if (!hasData) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Carga de Trabalho por Papel
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
            <Layers className="h-5 w-5 text-primary" />
            Carga de Trabalho por Papel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {error ?? 'Sem dados de carga de trabalho disponíveis.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    tutors,
    monitors,
    categoryBreakdown,
    monitorCategoryBreakdown,
    totalTutors,
    totalMonitors,
    totalTutorUcs,
    totalMonitorUcs,
    totalTutorStudents,
    totalMonitorStudents,
  } = data;

  const actorRows = actorTab === 'tutores' ? tutors : monitors;
  const actorCategoryBreakdown = actorTab === 'tutores' ? categoryBreakdown : monitorCategoryBreakdown;
  const totalActors = actorTab === 'tutores' ? totalTutors : totalMonitors;
  const totalActorUcs = actorTab === 'tutores' ? totalTutorUcs : totalMonitorUcs;
  const totalActorStudents = actorTab === 'tutores' ? totalTutorStudents : totalMonitorStudents;
  const actorLabel = actorTab === 'tutores' ? 'tutor' : 'monitor';
  const actorPluralLabel = actorTab === 'tutores' ? 'tutores' : 'monitores';

  const avgStudentsPerActor = totalActors > 0 ? Math.round(totalActorStudents / totalActors) : 0;

  const avgUcsPerActor =
    totalActors > 0
      ? (actorRows.reduce((acc, t) => acc + t.totalUcs, 0) / actorRows.length)
      : 0;

  const barData = actorRows.slice(0, 15).map((t) => ({
    name: t.tutorName.split(' ')[0],
    fullName: t.tutorName,
    alunos: t.totalStudents,
    ucs: t.totalUcs,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          Carga de Trabalho por Papel
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Distribuição de UCs, alunos, desempenho e engajamento por tutor e monitor, sem mistura
          entre papéis, e por tipo de curso,
          calculado a partir da base importada do Moodle.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs value={actorTab} onValueChange={(value) => setActorTab(value as 'tutores' | 'monitores')}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="tutores">KPIs de Tutores</TabsTrigger>
            <TabsTrigger value="monitores">KPIs de Monitores</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* KPI summary */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title={actorTab === 'tutores' ? 'Tutores na base' : 'Monitores na base'}
            value={fmtInt(totalActors)}
            subtitle={`${fmtInt(totalActorUcs)} UCs monitoradas`}
            icon={UserSquare2}
            variant="pending"
            tooltip={`Número de ${actorPluralLabel} distintos identificados na base importada, com pelo menos uma UC no recorte filtrado.`}
          />
          <StatCard
            title="Alunos únicos"
            value={fmtInt(totalActorStudents)}
            subtitle={`acompanhados por ${actorPluralLabel}`}
            icon={Users}
            variant="default"
            tooltip={`Total de alunos distintos acompanhados por ${actorPluralLabel} no recorte aplicado. Um aluno é contado uma única vez por papel.`}
          />
          <StatCard
            title={`Média alunos / ${actorLabel}`}
            value={fmtInt(avgStudentsPerActor)}
            subtitle={`alunos por ${actorLabel}`}
            icon={GraduationCap}
            variant="default"
            tooltip={`Total de alunos únicos do papel dividido pelo número de ${actorPluralLabel}. Indica a carga média de acompanhamento por ${actorLabel}.`}
          />
          <StatCard
            title={`Média UCs / ${actorLabel}`}
            value={fmt(avgUcsPerActor)}
            subtitle="unidades curriculares"
            icon={BookOpen}
            variant="success"
            tooltip={`Soma das UCs de todos os ${actorPluralLabel} dividida pelo número de ${actorPluralLabel}. Indica quantas turmas cada ${actorLabel} gerencia em média.`}
          />
        </div>

        <Tabs defaultValue="tutores" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="tutores">Por Tutor</TabsTrigger>
            <TabsTrigger value="categorias">Por Tipo de Curso</TabsTrigger>
            <TabsTrigger value="comparativo">Comparativo</TabsTrigger>
          </TabsList>

          {/* ── Tab: Por Tutor ────────────────────────────────────────── */}
          <TabsContent value="tutores" className="mt-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  {actorTab === 'tutores' ? 'Indicadores por Tutor' : 'Indicadores por Monitor'}
                  <KpiTooltip content={`UCs supervisionadas, volume de alunos, nota média, taxa de conclusão (nota ≥ 60), taxa de acesso (acessou ao menos uma vez) e taxa de retenção (alunos ativos) por ${actorLabel}.`} />
                </CardTitle>
                <CardDescription>
                  UCs supervisionadas, volume de alunos, nota média, taxa de acesso e retenção por {actorLabel}.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {actorRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum {actorLabel} identificado na base importada.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{actorTab === 'tutores' ? 'Tutor' : 'Monitor'}</TableHead>
                        <TableHead className="text-right">UCs</TableHead>
                        <TableHead className="text-right">Alunos</TableHead>
                        <TableHead className="text-right">Nota Média</TableHead>
                        <TableHead className="text-right">Conclusão ≥ 60</TableHead>
                        <TableHead className="text-right">Acesso</TableHead>
                        <TableHead className="text-right">Retenção (Ativo)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actorRows.map((tutor) => (
                        <TableRow key={tutor.tutorName}>
                          <TableCell className="max-w-[180px] truncate font-medium" title={tutor.tutorName}>
                            {tutor.tutorName}
                          </TableCell>
                          <TableCell className="text-right">{fmtInt(tutor.totalUcs)}</TableCell>
                          <TableCell className="text-right">{fmtInt(tutor.totalStudents)}</TableCell>
                          <TableCell className="text-right">{fmtGrade(tutor.averageGrade)}</TableCell>
                          <TableCell className="text-right">
                            <RateCell value={tutor.completionRate} />
                          </TableCell>
                          <TableCell className="text-right">
                            <RateCell value={tutor.accessRate} />
                          </TableCell>
                          <TableCell className="text-right">
                            <RateCell value={tutor.activeRate} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Por Tipo de Curso ─────────────────────────────────── */}
          <TabsContent value="categorias" className="mt-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  Indicadores por Categoria de Curso
                  <KpiTooltip content={`Distribuição de carga (UCs e ${actorPluralLabel}), volume de alunos, nota média, taxa de conclusão (nota ≥ 60) e taxa de acesso por tipo de curso (categoria).`} />
                </CardTitle>
                <CardDescription>
                  Distribuição de carga, conclusão, acesso e desempenho por tipo de curso para {actorPluralLabel}.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {actorCategoryBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma categoria identificada.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo de Curso</TableHead>
                        <TableHead className="text-right">UCs</TableHead>
                        <TableHead className="text-right">{actorTab === 'tutores' ? 'Tutores' : 'Monitores'}</TableHead>
                        <TableHead className="text-right">Alunos</TableHead>
                        <TableHead className="text-right">Nota Média</TableHead>
                        <TableHead className="text-right">Taxa de Conclusão</TableHead>
                        <TableHead className="text-right">Taxa de Acesso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actorCategoryBreakdown.map((cat) => (
                        <TableRow key={cat.category}>
                          <TableCell className="max-w-[180px] truncate font-medium" title={cat.category}>
                            {cat.category}
                          </TableCell>
                          <TableCell className="text-right">{fmtInt(cat.ucCount)}</TableCell>
                          <TableCell className="text-right">{fmtInt(cat.tutorCount)}</TableCell>
                          <TableCell className="text-right">{fmtInt(cat.studentCount)}</TableCell>
                          <TableCell className="text-right">{fmtGrade(cat.averageGrade)}</TableCell>
                          <TableCell className="text-right">
                            <RateCell value={cat.completionRate} />
                          </TableCell>
                          <TableCell className="text-right">
                            <RateCell value={cat.accessRate} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Comparativo ──────────────────────────────────────── */}
          <TabsContent value="comparativo" className="mt-3">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-sm">
                      {actorTab === 'tutores' ? 'Alunos supervisionados por tutor' : 'Alunos supervisionados por monitor'}
                      <KpiTooltip content={`Top 15 ${actorPluralLabel} pelo total de alunos únicos supervisionados. Permite comparar a distribuição de carga entre ${actorPluralLabel}.`} />
                  </CardTitle>
                    <CardDescription>Top 15 {actorPluralLabel} pelo volume de alunos.</CardDescription>
                </CardHeader>
                <CardContent>
                  {barData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={barData} layout="vertical" margin={{ left: 4, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          width={70}
                        />
                        <Tooltip
                          formatter={(value: number) => [fmtInt(value), 'Alunos']}
                          labelFormatter={(label: string) => {
                            const found = barData.find((d) => d.name === label);
                            return found?.fullName ?? label;
                          }}
                        />
                        <Bar dataKey="alunos" fill="#0f766e" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-sm">
                      {actorTab === 'tutores' ? 'UCs supervisionadas por tutor' : 'UCs supervisionadas por monitor'}
                      <KpiTooltip content={`Top 15 ${actorPluralLabel} pelo número de UCs gerenciadas, ordenados de forma decrescente. Indica quem acumula mais turmas.`} />
                  </CardTitle>
                    <CardDescription>Top 15 {actorPluralLabel} pelo número de UCs.</CardDescription>
                </CardHeader>
                <CardContent>
                  {barData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={[...barData].sort((a, b) => b.ucs - a.ucs)}
                        layout="vertical"
                        margin={{ left: 4, right: 16 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          width={70}
                        />
                        <Tooltip
                          formatter={(value: number) => [fmtInt(value), 'UCs']}
                          labelFormatter={(label: string) => {
                            const found = barData.find((d) => d.name === label);
                            return found?.fullName ?? label;
                          }}
                        />
                        <Bar dataKey="ucs" fill="#0284c7" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
