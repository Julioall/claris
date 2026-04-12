import { useMemo } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  GraduationCap,
  LineChart,
  ShieldAlert,
  Target,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Course } from '@/features/courses/types';

import { useDashboardManagerialData } from '../hooks/useDashboardManagerialData';

interface ManagerialViewsProps {
  courses: Course[];
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatGrade(value: number) {
  return value.toFixed(1);
}

function DashboardTableEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function InsightsKpi({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

export function ManagerialViews({ courses }: ManagerialViewsProps) {
  const { insights, isLoading, error } = useDashboardManagerialData(courses);

  const totalRisks = useMemo(
    () => insights.riskDistribution.risco + insights.riskDistribution.critico,
    [insights.riskDistribution.critico, insights.riskDistribution.risco],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Visoes gerenciais
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-40 items-center justify-center">
          <Spinner className="h-6 w-6" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Visoes gerenciais
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Leitura executiva das 10 visoes para cursos, pessoas, risco e efetividade operacional.
        </p>
        {error ? (
          <p className="text-sm text-risk-risco">Falha ao carregar analytics: {error}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InsightsKpi label="Media geral" value={formatGrade(insights.executive.globalAverageGrade)} helper="nota percentual media" />
          <InsightsKpi label="Aprovacao" value={formatPercent(insights.executive.approvalRate)} helper="notas >= 60" />
          <InsightsKpi label="Risco alto" value={totalRisks} helper="risco + critico" />
          <InsightsKpi label="Fila operacional" value={insights.executive.pendingCorrections + insights.executive.pendingSubmissions} helper="correcoes + envios pendentes" />
        </div>

        <Tabs defaultValue="cursos" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="cursos">Cursos</TabsTrigger>
            <TabsTrigger value="monitores">Monitores</TabsTrigger>
            <TabsTrigger value="professores">Professores</TabsTrigger>
            <TabsTrigger value="disciplinas">Disciplinas</TabsTrigger>
            <TabsTrigger value="risco">Risco</TabsTrigger>
            <TabsTrigger value="temporal">Temporal</TabsTrigger>
            <TabsTrigger value="equidade">Equidade</TabsTrigger>
            <TabsTrigger value="intervencoes">Intervencoes</TabsTrigger>
            <TabsTrigger value="funil">Funil</TabsTrigger>
            <TabsTrigger value="executivo">Executivo</TabsTrigger>
          </TabsList>

          <TabsContent value="cursos" className="space-y-3">
            {insights.courses.length === 0 ? <DashboardTableEmpty message="Sem dados de curso para o recorte atual." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Curso</TableHead>
                    <TableHead>Alunos</TableHead>
                    <TableHead>Media</TableHead>
                    <TableHead>Mediana</TableHead>
                    <TableHead>Dispersao</TableHead>
                    <TableHead>Aprovacao</TableHead>
                    <TableHead>Risco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.courses.slice(0, 10).map((course) => (
                    <TableRow key={course.courseId}>
                      <TableCell className="font-medium">{course.courseName}</TableCell>
                      <TableCell>{course.studentCount}</TableCell>
                      <TableCell>{formatGrade(course.averageGrade)}</TableCell>
                      <TableCell>{formatGrade(course.medianGrade)}</TableCell>
                      <TableCell>{formatGrade(course.gradeStdDev)}</TableCell>
                      <TableCell>{formatPercent(course.approvalRate)}</TableCell>
                      <TableCell>{formatPercent(course.riskRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="monitores" className="space-y-3">
            {insights.monitors.length === 0 ? <DashboardTableEmpty message="Nao ha monitores vinculados aos cursos filtrados." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Monitor</TableHead>
                    <TableHead>Cursos</TableHead>
                    <TableHead>Alunos</TableHead>
                    <TableHead>Media</TableHead>
                    <TableHead>Intervencoes</TableHead>
                    <TableHead>Fila</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.monitors.map((actor) => (
                    <TableRow key={`${actor.userId}-${actor.role}`}>
                      <TableCell className="font-medium">{actor.name}</TableCell>
                      <TableCell>{actor.courseCount}</TableCell>
                      <TableCell>{actor.studentCount}</TableCell>
                      <TableCell>{formatGrade(actor.averageGrade)}</TableCell>
                      <TableCell>{actor.interventions}</TableCell>
                      <TableCell>{actor.pendingQueue}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="professores" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Nesta versao, papeis diferentes de tutor sao tratados como docentes (proxy de professor).
            </p>
            {insights.professors.length === 0 ? <DashboardTableEmpty message="Nao ha docentes no recorte selecionado." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Professor</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Cursos</TableHead>
                    <TableHead>Media</TableHead>
                    <TableHead>Alunos em risco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.professors.map((actor) => (
                    <TableRow key={`${actor.userId}-${actor.role}`}>
                      <TableCell className="font-medium">{actor.name}</TableCell>
                      <TableCell>{actor.role}</TableCell>
                      <TableCell>{actor.courseCount}</TableCell>
                      <TableCell>{formatGrade(actor.averageGrade)}</TableCell>
                      <TableCell>{actor.riskStudents}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="disciplinas" className="space-y-3">
            {insights.disciplines.length === 0 ? <DashboardTableEmpty message="Sem disciplinas para analisar." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Disciplina</TableHead>
                    <TableHead>UCs</TableHead>
                    <TableHead>Alunos</TableHead>
                    <TableHead>Media</TableHead>
                    <TableHead>Aprovacao</TableHead>
                    <TableHead>Risco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.disciplines.map((discipline) => (
                    <TableRow key={discipline.discipline}>
                      <TableCell className="font-medium">{discipline.discipline}</TableCell>
                      <TableCell>{discipline.courseCount}</TableCell>
                      <TableCell>{discipline.studentCount}</TableCell>
                      <TableCell>{formatGrade(discipline.averageGrade)}</TableCell>
                      <TableCell>{formatPercent(discipline.approvalRate)}</TableCell>
                      <TableCell>{formatPercent(discipline.riskRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="risco" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
              <InsightsKpi label="Normal" value={insights.riskDistribution.normal} />
              <InsightsKpi label="Atencao" value={insights.riskDistribution.atencao} />
              <InsightsKpi label="Risco" value={insights.riskDistribution.risco} />
              <InsightsKpi label="Critico" value={insights.riskDistribution.critico} />
              <InsightsKpi label="Inativo" value={insights.riskDistribution.inativo} />
            </div>
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              Combine esta visao com o funil para priorizar alunos em risco/critico que ainda nao receberam intervencao.
            </div>
          </TabsContent>

          <TabsContent value="temporal" className="space-y-3">
            {insights.temporal.length === 0 ? <DashboardTableEmpty message="Sem serie temporal para os ultimos meses." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Media de notas</TableHead>
                    <TableHead>Mudancas de risco</TableHead>
                    <TableHead>Intervencoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.temporal.map((point) => (
                    <TableRow key={point.period}>
                      <TableCell className="font-medium">{point.period}</TableCell>
                      <TableCell>{formatGrade(point.averageGrade)}</TableCell>
                      <TableCell>{point.riskChanges}</TableCell>
                      <TableCell>{point.interventions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="equidade" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Segmentacao de equidade baseada em categoria/disciplina enquanto nao houver polos/turnos estruturados.
            </p>
            {insights.equity.length === 0 ? <DashboardTableEmpty message="Sem segmentos para comparacao." /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Segmento</TableHead>
                    <TableHead>Alunos</TableHead>
                    <TableHead>Media</TableHead>
                    <TableHead>Aprovacao</TableHead>
                    <TableHead>Risco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.equity.map((segment) => (
                    <TableRow key={segment.segment}>
                      <TableCell className="font-medium">{segment.segment}</TableCell>
                      <TableCell>{segment.studentCount}</TableCell>
                      <TableCell>{formatGrade(segment.averageGrade)}</TableCell>
                      <TableCell>{formatPercent(segment.approvalRate)}</TableCell>
                      <TableCell>{formatPercent(segment.riskRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="intervencoes" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <InsightsKpi label="Intervencoes" value={insights.interventions.totalInterventions} />
              <InsightsKpi label="Alunos contatados" value={insights.interventions.contactedStudents} />
              <InsightsKpi label="Risco melhorou" value={insights.interventions.improvedRiskAfterAction} />
              <InsightsKpi label="Risco piorou" value={insights.interventions.worsenedRiskAfterAction} />
              <InsightsKpi label="Taxa de efetividade" value={formatPercent(insights.interventions.effectivenessRate)} />
            </div>
          </TabsContent>

          <TabsContent value="funil" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <InsightsKpi label="Identificados em risco" value={insights.funnel.identifiedAtRisk} helper="risco + critico" />
              <InsightsKpi label="Contatados" value={insights.funnel.contacted} />
              <InsightsKpi label="Com acao registrada" value={insights.funnel.withAction} />
              <InsightsKpi label="Com melhora" value={insights.funnel.improved} />
              <InsightsKpi label="Estabilizados" value={insights.funnel.stabilized} />
            </div>
          </TabsContent>

          <TabsContent value="executivo" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <InsightsKpi label="Alunos ativos" value={insights.executive.activeStudents} />
              <InsightsKpi label="Media geral" value={formatGrade(insights.executive.globalAverageGrade)} />
              <InsightsKpi label="Aprovacao" value={formatPercent(insights.executive.approvalRate)} />
              <InsightsKpi label="Risco" value={formatPercent(insights.executive.riskRate)} />
              <InsightsKpi label="Correcoes pendentes" value={insights.executive.pendingCorrections} />
              <InsightsKpi label="Envios pendentes" value={insights.executive.pendingSubmissions} />
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Prioridades da semana</p>
              <div className="space-y-2">
                {insights.priorities.map((priority) => (
                  <div key={priority.label} className="flex items-center justify-between gap-3 rounded-md bg-muted/20 p-2">
                    <div>
                      <p className="text-sm font-medium">{priority.label}</p>
                      <p className="text-xs text-muted-foreground">{priority.note}</p>
                    </div>
                    <Badge variant="secondary">{priority.value}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Pessoas</span>
          <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3" /> Notas</span>
          <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> Risco</span>
          <span className="inline-flex items-center gap-1"><ClipboardCheck className="h-3 w-3" /> Operacao</span>
          <span className="inline-flex items-center gap-1"><LineChart className="h-3 w-3" /> Tendencia</span>
          <span className="inline-flex items-center gap-1"><Target className="h-3 w-3" /> Priorizacao</span>
          <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Monitoramento continuo</span>
        </div>
      </CardContent>
    </Card>
  );
}
