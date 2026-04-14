import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BookOpen,
  CalendarRange,
  Filter,
  GraduationCap,
  RefreshCw,
  School,
  UserMinus,
  Users,
  UserSquare2,
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { DropoutKPIs } from '../components/DropoutKPIs';
import { EnrollmentImportDialog } from '../components/EnrollmentImportDialog';
import { KpiTooltip } from '../components/KpiTooltip';
import { WorkloadKPIs } from '../components/WorkloadKPIs';
import {
  useEnrollmentDashboard,
  useEnrollmentFilterValues,
  useEnrollmentDashboardOptions,
} from '../hooks/useEnrollmentsData';
import type {
  EnrollmentDashboardData,
  EnrollmentDashboardFilters,
  EnrollmentDashboardRankingDatum,
} from '../types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/StatCard';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/usePermissions';

const PIE_COLORS = ['#0f766e', '#0284c7', '#dc2626', '#d97706', '#6366f1', '#64748b'];
const BAR_COLOR = '#0f766e';
const AREA_COLOR = '#0284c7';

const INITIAL_FILTERS: EnrollmentDashboardFilters = {
  startDate: '',
  endDate: '',
  tutor: '',
  school: '',
  category: '',
  statusUc: '',
};

function formatInteger(value: number) {
  return value.toLocaleString('pt-BR');
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return '-';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatGrade(value: number | null) {
  if (value === null || Number.isNaN(value)) return '-';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateLabel(value: string | null) {
  if (!value) return null;

  try {
    return format(parseISO(value), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return value;
  }
}

function applyQuickRange(
  days: number | null,
  setFilters: Dispatch<SetStateAction<EnrollmentDashboardFilters>>,
) {
  if (days === null) {
    setFilters((current) => ({ ...current, startDate: '', endDate: '' }));
    return;
  }

  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  setFilters((current) => ({
    ...current,
    startDate,
    endDate,
  }));
}

function buildStrategicInsights(dashboard: EnrollmentDashboardData) {
  const insights: Array<{ title: string; description: string }> = [];
  const topSchool = dashboard.topSchools[0];
  const topTutor = dashboard.topTutors[0];
  const topMonitor = dashboard.topMonitors[0];
  const topCourse = dashboard.topCourses[0];

  if (dashboard.overview.activeRate !== null) {
    insights.push({
      title: 'Saude da carteira',
      description:
        `${formatPercent(dashboard.overview.activeRate)} dos alunos estao ativos ` +
        `e ${formatPercent(dashboard.overview.neverAccessRate)} ainda nao acessaram a UC.`,
    });
  }

  if (topSchool) {
    insights.push({
      title: 'Escola com maior volume',
      description:
        `${topSchool.label} concentra ${formatInteger(topSchool.students)} alunos ` +
        `em ${formatInteger(topSchool.units)} UCs no recorte atual.`,
    });
  }

  if (topTutor) {
    insights.push({
      title: 'Tutor com maior cobertura',
      description:
        `${topTutor.label} acompanha ${formatInteger(topTutor.students)} alunos ` +
        `distribuidos em ${formatInteger(topTutor.units)} UCs.`,
    });
  }

  if (topMonitor) {
    insights.push({
      title: 'Monitor com maior cobertura',
      description:
        `${topMonitor.label} acompanha ${formatInteger(topMonitor.students)} alunos ` +
        `distribuidos em ${formatInteger(topMonitor.units)} UCs.`,
    });
  }

  if (topCourse) {
    insights.push({
      title: 'Curso mais relevante',
      description:
        `${topCourse.label} aparece com ${formatInteger(topCourse.students)} alunos ` +
        `e ${formatInteger(topCourse.units)} UCs no periodo filtrado.`,
    });
  }

  return insights.slice(0, 3);
}

function EmptyDashboardState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card>
      <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Nenhum dado de gerencia disponivel</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Importe o arquivo JSON exportado do Moodle para habilitar os KPIs, os rankings e as
            visoes estrategicas desta tela.
          </p>
        </div>
        {isAdmin && <EnrollmentImportDialog />}
      </CardContent>
    </Card>
  );
}

function RankingCard({
  title,
  description,
  items,
  tooltip,
}: {
  title: string;
  description: string;
  items: EnrollmentDashboardRankingDatum[];
  tooltip?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          {title}
          {tooltip && <KpiTooltip content={tooltip} />}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para este recorte.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatInteger(item.units)} UCs
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{formatInteger(item.students)}</p>
                </div>
                <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{
                      width: `${Math.max(
                        8,
                        Math.min(100, (item.students / Math.max(items[0].students, 1)) * 100),
                      )}%`,
                  }}
                />
              </div>
            </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EnrollmentsPage() {
  const { isAdmin } = usePermissions();
  const [filters, setFilters] = useState<EnrollmentDashboardFilters>(INITIAL_FILTERS);
  const [sessionTab, setSessionTab] = useState<'estrategico' | 'carga' | 'fuga'>('estrategico');
  const [strategicTab, setStrategicTab] = useState<'overview' | 'tendencias' | 'rankings' | 'executivo'>('overview');
  const [rankingActorTab, setRankingActorTab] = useState<'tutores' | 'monitores'>('tutores');

  const categoryOptions = useEnrollmentFilterValues('categoria');
  const statusOptions = useEnrollmentFilterValues('status_uc');
  const { dashboard, isLoading, isFetching, error } = useEnrollmentDashboard(filters);
  const [excludeSuspended, setExcludeSuspended] = useState(true);

  const hasData = (dashboard?.overview.rows ?? 0) > 0;
  const activeFilterBadges = [
    filters.startDate ? `Inicio: ${filters.startDate}` : null,
    filters.endDate ? `Fim: ${filters.endDate}` : null,
    filters.school ? `Escola: ${filters.school}` : null,
    filters.tutor ? `Tutor: ${filters.tutor}` : null,
    filters.category ? `Categoria: ${filters.category}` : null,
    filters.statusUc ? `Status: ${filters.statusUc}` : null,
  ].filter(Boolean) as string[];
  const insights = dashboard ? buildStrategicInsights(dashboard) : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Filter className="h-3.5 w-3.5" />
              Painel estrategico
            </Badge>
            {activeFilterBadges.map((badge) => (
              <Badge key={badge} variant="outline">
                {badge}
              </Badge>
            ))}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Painel de Gerencia</h1>
            <p className="text-muted-foreground">
              KPIs, graficos e leituras estrategicas por periodo, tutor e escola, usando a base
              importada do Moodle.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isFetching && !isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
          {isAdmin && <EnrollmentImportDialog />}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros estrategicos</CardTitle>
          <CardDescription>
            Recorte a gerencia por periodo, tutor, escola, categoria e status de matricula.
            {options?.dateRange.min && options?.dateRange.max && (
              <> Janela disponivel: {formatDateLabel(options.dateRange.min)} ate {formatDateLabel(options.dateRange.max)}.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => applyQuickRange(30, setFilters)}>
              Ultimos 30 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickRange(90, setFilters)}>
              Ultimos 90 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickRange(180, setFilters)}>
              Ultimos 180 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickRange(null, setFilters)}>
              Todo o historico
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(INITIAL_FILTERS)}
              disabled={
                !filters.startDate
                && !filters.endDate
                && !filters.school
                && !filters.tutor
                && !filters.category
                && !filters.statusUc
              }
            >
              Limpar filtros
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data inicial</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Data final</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select
                value={filters.school || 'all'}
                onValueChange={(value) => setFilters((current) => ({ ...current, school: value === 'all' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as escolas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as escolas</SelectItem>
                  {(options?.schools ?? []).map((school) => (
                    <SelectItem key={school} value={school}>
                      {school}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tutor</label>
              <Select
                value={filters.tutor || 'all'}
                onValueChange={(value) => setFilters((current) => ({ ...current, tutor: value === 'all' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os tutores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tutores</SelectItem>
                  {(options?.tutors ?? []).map((tutor) => (
                    <SelectItem key={tutor} value={tutor}>
                      {tutor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Categoria</label>
              <Select
                value={filters.category || 'all'}
                onValueChange={(value) => setFilters((current) => ({ ...current, category: value === 'all' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={filters.statusUc || 'all'}
                onValueChange={(value) => setFilters((current) => ({ ...current, statusUc: value === 'all' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoadingOptions && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Carregando opcoes de filtro...
            </div>
          )}

          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            <UserMinus className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Excluir alunos suspensos dos indicadores</p>
              <p className="text-xs text-muted-foreground">
                Quando ativo, alunos com status "Suspenso" não são contabilizados nos indicadores de
                desempenho (Carga de Trabalho e Fuga de Alunos). Indicadores de evasão podem incluí-los quando desativado.
              </p>
            </div>
            <Switch
              checked={excludeSuspended}
              onCheckedChange={setExcludeSuspended}
              aria-label="Excluir alunos suspensos dos indicadores"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="flex min-h-64 items-center justify-center">
            <Spinner className="h-7 w-7" />
          </CardContent>
        </Card>
      ) : !hasData || !dashboard ? (
        <EmptyDashboardState isAdmin={isAdmin} />
      ) : (
        <>
          <Tabs value={sessionTab} onValueChange={(value) => setSessionTab(value as 'estrategico' | 'carga' | 'fuga')}>
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="estrategico">Visao Estrategica</TabsTrigger>
              <TabsTrigger value="carga">Carga de Trabalho</TabsTrigger>
              <TabsTrigger value="fuga">Fuga de Alunos</TabsTrigger>
            </TabsList>
          </Tabs>

          {sessionTab === 'estrategico' && (
            <Tabs value={strategicTab} onValueChange={(value) => setStrategicTab(value as 'overview' | 'tendencias' | 'rankings' | 'executivo')}>
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
                <TabsTrigger value="rankings">Rankings</TabsTrigger>
                <TabsTrigger value="executivo">Executivo</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <StatCard
                    title="Alunos unicos"
                    value={formatInteger(dashboard.overview.students)}
                    subtitle={`${formatInteger(dashboard.overview.units)} UCs monitoradas`}
                    icon={Users}
                    variant="default"
                    tooltip="Total de alunos distintos na base importada do Moodle. Um aluno pode ter matrículas em várias UCs e é contado uma única vez."
                  />
                  <StatCard
                    title="Tutores ativos"
                    value={formatInteger(dashboard.overview.tutors)}
                    subtitle={`${formatInteger(dashboard.overview.schools)} escolas no recorte`}
                    icon={UserSquare2}
                    variant="pending"
                    tooltip="Número de tutores e monitores distintos identificados na base importada, dentro do recorte de filtros aplicado."
                  />
                  <StatCard
                    title="Cursos monitorados"
                    value={formatInteger(dashboard.overview.courses)}
                    subtitle={`${formatInteger(dashboard.overview.rows)} registros importados`}
                    icon={BookOpen}
                    variant="default"
                    tooltip="Número de disciplinas/cursos distintos presentes na base importada, no recorte de filtros selecionado."
                  />
                  <StatCard
                    title="Alunos ativos"
                    value={formatInteger(dashboard.overview.activeStudents)}
                    subtitle={`${formatPercent(dashboard.overview.activeRate)} da carteira`}
                    icon={GraduationCap}
                    variant="success"
                    tooltip="Alunos com status de matrícula ativo no Moodle. Taxa = alunos ativos ÷ total de alunos únicos × 100."
                  />
                  <StatCard
                    title="Nunca acessaram"
                    value={formatInteger(dashboard.overview.neverAccessedStudents)}
                    subtitle={`${formatPercent(dashboard.overview.neverAccessRate)} dos alunos`}
                    icon={AlertTriangle}
                    variant="warning"
                    tooltip="Alunos matriculados que não registraram nenhum acesso ao curso no Moodle. Taxa = nunca acessaram ÷ total de alunos únicos × 100."
                  />
                  <StatCard
                    title="Media de nota"
                    value={formatGrade(dashboard.overview.averageGrade)}
                    subtitle={`${formatInteger(dashboard.overview.completedStudents)} alunos concluidos`}
                    icon={School}
                    variant="risk"
                    tooltip="Média aritmética das notas finais registradas no Moodle para os alunos do recorte. Alunos sem nota são excluídos do cálculo."
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  {insights.map((insight) => (
                    <Card key={insight.title} className="border-l-4 border-l-primary">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{insight.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{insight.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="tendencias" className="space-y-4 mt-4">
                <div className="grid gap-4 xl:grid-cols-3">
                  <Card className="xl:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-1.5 text-base">
                        Evolucao de alunos no periodo
                        <KpiTooltip content="Série mensal com o volume de alunos e UCs por mês de matrícula no período filtrado. Permite visualizar tendências de crescimento ou redução da carteira." />
                      </CardTitle>
                      <CardDescription>
                        Quantidade de alunos e UCs por mes no recorte selecionado.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {dashboard.monthlyTrend.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem dados historicos para o periodo.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={280}>
                          <AreaChart data={dashboard.monthlyTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Area
                              type="monotone"
                              dataKey="students"
                              stroke={AREA_COLOR}
                              fill={AREA_COLOR}
                              fillOpacity={0.2}
                              strokeWidth={2}
                              name="Alunos"
                            />
                            <Area
                              type="monotone"
                              dataKey="units"
                              stroke={BAR_COLOR}
                              fill={BAR_COLOR}
                              fillOpacity={0.12}
                              strokeWidth={2}
                              name="UCs"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-1.5 text-base">
                        Status dos alunos
                        <KpiTooltip content="Distribuição dos status de matrícula (ativo, concluído, suspenso, etc.) conforme o campo status_uc da base importada do Moodle." />
                      </CardTitle>
                      <CardDescription>
                        Distribuicao dos alunos por status de matricula.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {dashboard.statusBreakdown.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem dados de status neste recorte.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={280}>
                          <PieChart>
                            <Pie
                              data={dashboard.statusBreakdown}
                              dataKey="value"
                              nameKey="label"
                              innerRadius={55}
                              outerRadius={92}
                              paddingAngle={3}
                            >
                              {dashboard.statusBreakdown.map((entry, index) => (
                                <Cell key={`${entry.label}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-1.5 text-base">
                        Perfil de acesso
                        <KpiTooltip content="Classifica alunos pela recência do último acesso registrado no Moodle: sem nenhum acesso, acesso recente ou acesso antigo. Indica nível de engajamento ativo." />
                      </CardTitle>
                      <CardDescription>
                        Velocidade de acesso dos alunos a partir da ultima visita na UC.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {dashboard.accessBreakdown.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem dados de acesso neste recorte.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={dashboard.accessBreakdown}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="value" fill={BAR_COLOR} radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-1.5 text-base">
                        Papeis na base importada
                        <KpiTooltip content="Distribuição por papel no curso (aluno, tutor, monitor, etc.) conforme o campo role da base importada do Moodle." />
                      </CardTitle>
                      <CardDescription>
                        Participacao de alunos, monitores e tutores no recorte atual.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {dashboard.roleBreakdown.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem dados de papeis neste recorte.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={dashboard.roleBreakdown}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="value" fill={AREA_COLOR} radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="rankings" className="space-y-4 mt-4">
                <Tabs value={rankingActorTab} onValueChange={(value) => setRankingActorTab(value as 'tutores' | 'monitores')}>
                  <TabsList className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="tutores">Ranking de Tutores</TabsTrigger>
                    <TabsTrigger value="monitores">Ranking de Monitores</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="grid gap-4 xl:grid-cols-3">
                  <RankingCard
                    title="Escolas com maior cobertura"
                    description="Onde a gerencia concentra mais alunos no recorte selecionado."
                    items={dashboard.topSchools}
                    tooltip="Top escolas pelo volume de alunos únicos no filtro aplicado. A escola é extraída do caminho do curso no Moodle."
                  />
                  <RankingCard
                    title={rankingActorTab === 'tutores' ? 'Tutores com maior carteira' : 'Monitores com maior carteira'}
                    description={rankingActorTab === 'tutores' ? 'Distribuicao de alunos por tutor no escopo filtrado.' : 'Distribuicao de alunos por monitor no escopo filtrado.'}
                    items={rankingActorTab === 'tutores' ? dashboard.topTutors : dashboard.topMonitors}
                    tooltip={rankingActorTab === 'tutores' ? 'Top tutores pelo número de alunos únicos acompanhados nas UCs dentro do recorte de filtros.' : 'Top monitores pelo número de alunos únicos acompanhados nas UCs dentro do recorte de filtros.'}
                  />
                  <RankingCard
                    title="Cursos mais relevantes"
                    description="Cursos com maior volume de alunos na base importada."
                    items={dashboard.topCourses}
                    tooltip="Top cursos pelo número de alunos matriculados na base importada, dentro do recorte de filtros."
                  />
                </div>
              </TabsContent>

              <TabsContent value="executivo" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Leitura executiva</CardTitle>
                    <CardDescription>
                      Um resumo rapido para discutir carteira, acesso e distribuicao da operacao.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg bg-muted/40 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <CalendarRange className="h-4 w-4 text-primary" />
                        Recorte temporal
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {filters.startDate || filters.endDate
                          ? `Analise entre ${filters.startDate || 'o inicio da base'} e ${filters.endDate || 'hoje'}.`
                          : 'Analise considerando todo o historico importado.'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <Users className="h-4 w-4 text-primary" />
                        Comportamento da carteira
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatInteger(dashboard.overview.suspendedStudents)} alunos estao suspensos e{' '}
                        {formatInteger(dashboard.overview.neverAccessedStudents)} seguem sem acesso registrado.
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <School className="h-4 w-4 text-primary" />
                        Estrutura monitorada
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatInteger(dashboard.overview.schools)} escolas,{' '}
                        {formatInteger(dashboard.overview.courses)} cursos e{' '}
                        {formatInteger(dashboard.overview.units)} UCs compoem o recorte atual.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {sessionTab === 'carga' && <WorkloadKPIs hasData={hasData} filters={filters} excludeSuspended={excludeSuspended} />}

          {sessionTab === 'fuga' && <DropoutKPIs hasData={hasData} filters={filters} excludeSuspended={excludeSuspended} />}
        </>
      )}
    </div>
  );
}
