import { useEffect, useState } from 'react';
import { User, RefreshCw, LogOut, Clock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataCleanupCard } from '@/components/settings/DataCleanupCard';
import { GradeDebugCard } from '@/components/settings/GradeDebugCard';
import { ActionTypesCard } from '@/components/settings/ActionTypesCard';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

type SyncEntity = 'courses' | 'students' | 'activities' | 'grades';

interface SyncSettings {
  syncIntervalHours: Record<SyncEntity, number>;
  riskThresholdDays: {
    atencao: number;
    risco: number;
    critico: number;
  };
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  syncIntervalHours: {
    courses: 24,
    students: 12,
    activities: 2.4,
    grades: 2.4,
  },
  riskThresholdDays: {
    atencao: 7,
    risco: 14,
    critico: 30,
  },
};

const ENTITY_LABELS: Record<SyncEntity, string> = {
  courses: 'Cursos e escolas',
  students: 'Dados cadastrais de alunos',
  activities: 'Atividades',
  grades: 'Notas',
};

export default function Settings() {
  const { user, logout, lastSync } = useAuth();
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(DEFAULT_SYNC_SETTINGS);
  const [isLoadingSyncSettings, setIsLoadingSyncSettings] = useState(false);
  const [isSavingSyncSettings, setIsSavingSyncSettings] = useState(false);

  useEffect(() => {
    if (!user) return;

    const loadSyncSettings = async () => {
      setIsLoadingSyncSettings(true);
      try {
        const { data, error } = await supabase
          .from('user_sync_preferences')
          .select('sync_interval_hours, sync_interval_days, risk_threshold_days')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading sync settings:', error);
          return;
        }

        if (data) {
          const syncIntervalHoursRaw = asObject(data.sync_interval_hours);
          const syncIntervalDaysRaw = asObject(data.sync_interval_days);
          const riskThresholdDaysRaw = asObject(data.risk_threshold_days);

          setSyncSettings({
            syncIntervalHours: {
              courses: Number(syncIntervalHoursRaw.courses ?? (Number(syncIntervalDaysRaw.courses ?? 1) * 24)),
              students: Number(syncIntervalHoursRaw.students ?? (Number(syncIntervalDaysRaw.students ?? 0.5) * 24)),
              activities: Number(syncIntervalHoursRaw.activities ?? (Number(syncIntervalDaysRaw.activities ?? 0.1) * 24)),
              grades: Number(syncIntervalHoursRaw.grades ?? (Number(syncIntervalDaysRaw.grades ?? 0.1) * 24)),
            },
            riskThresholdDays: {
              atencao: Number(riskThresholdDaysRaw.atencao ?? DEFAULT_SYNC_SETTINGS.riskThresholdDays.atencao),
              risco: Number(riskThresholdDaysRaw.risco ?? DEFAULT_SYNC_SETTINGS.riskThresholdDays.risco),
              critico: Number(riskThresholdDaysRaw.critico ?? DEFAULT_SYNC_SETTINGS.riskThresholdDays.critico),
            },
          });
        }
      } finally {
        setIsLoadingSyncSettings(false);
      }
    };

    loadSyncSettings();
  }, [user]);

  const formatDate = (date: string | null) => {
    if (!date) return 'Nunca';
    return format(new Date(date), "dd 'de' MMMM 'de' yyyy 'as' HH:mm", { locale: ptBR });
  };

  const updateSyncIntervalHours = (entity: SyncEntity, value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setSyncSettings(prev => ({
      ...prev,
      syncIntervalHours: {
        ...prev.syncIntervalHours,
        [entity]: safeValue,
      },
    }));
  };

  const saveSyncSettings = async () => {
    if (!user) return;

    const atencaoDays = Math.max(1, Math.floor(syncSettings.riskThresholdDays.atencao));
    const riscoDays = Math.max(1, Math.floor(syncSettings.riskThresholdDays.risco));
    const criticoDays = Math.max(1, Math.floor(syncSettings.riskThresholdDays.critico));

    if (!(atencaoDays < riscoDays && riscoDays < criticoDays)) {
      toast({
        title: 'Valores de risco invalidos',
        description: 'Defina dias crescentes: atencao < risco < critico.',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingSyncSettings(true);
    try {
      const { error } = await supabase
        .from('user_sync_preferences')
        .upsert({
          user_id: user.id,
          sync_interval_hours: syncSettings.syncIntervalHours,
          risk_threshold_days: {
            atencao: atencaoDays,
            risco: riscoDays,
            critico: criticoDays,
          },
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: 'Configuracoes salvas',
        description: 'Intervalos de sincronizacao atualizados com sucesso.',
      });
    } catch (err) {
      console.error('Error saving sync settings:', err);
      toast({
        title: 'Erro ao salvar configuracoes',
        description: 'Nao foi possivel salvar os intervalos de sincronizacao.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingSyncSettings(false);
    }
  };

  const updateRiskThresholdDays = (level: 'atencao' | 'risco' | 'critico', value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

    setSyncSettings(prev => ({
      ...prev,
      riskThresholdDays: {
        ...prev.riskThresholdDays,
        [level]: safeValue,
      },
    }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracoes</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferencias</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Perfil
            </CardTitle>
            <CardDescription>Informacoes da sua conta Moodle</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                {user?.full_name.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-lg">{user?.full_name}</p>
                <p className="text-muted-foreground">{user?.moodle_username}</p>
                {user?.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Sincronizacao
            </CardTitle>
            <CardDescription>Status atual e regras do botao de sincronizacao da barra superior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Ultima sincronizacao:</span>
                <span className="font-medium">{formatDate(lastSync)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">URL do Moodle:</span>
                <span className="font-medium">https://ead.fieg.com.br</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="text-sm font-medium">Intervalo minimo entre sincronizacoes (horas)</div>
              <div className="grid gap-3 md:grid-cols-2">
                {(['courses', 'students', 'activities', 'grades'] as SyncEntity[]).map(entity => (
                  <div key={`interval-${entity}`} className="flex items-center justify-between rounded-md border p-3 gap-3">
                    <Label className="text-sm">{ENTITY_LABELS[entity]}</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={String(syncSettings.syncIntervalHours[entity])}
                      onChange={(e) => updateSyncIntervalHours(entity, e.target.value)}
                      disabled={isLoadingSyncSettings}
                      className="w-[140px]"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="text-sm font-medium">Dias sem acesso para classificar risco</div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                  <Label className="text-sm">Atencao</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={String(syncSettings.riskThresholdDays.atencao)}
                    onChange={(e) => updateRiskThresholdDays('atencao', e.target.value)}
                    disabled={isLoadingSyncSettings}
                    className="w-[120px]"
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                  <Label className="text-sm">Risco</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={String(syncSettings.riskThresholdDays.risco)}
                    onChange={(e) => updateRiskThresholdDays('risco', e.target.value)}
                    disabled={isLoadingSyncSettings}
                    className="w-[120px]"
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                  <Label className="text-sm">Critico</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={String(syncSettings.riskThresholdDays.critico)}
                    onChange={(e) => updateRiskThresholdDays('critico', e.target.value)}
                    disabled={isLoadingSyncSettings}
                    className="w-[120px]"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Use valores crescentes: atencao menor que risco, e risco menor que critico.
              </p>
            </div>

            <Button onClick={saveSyncSettings} variant="outline" className="w-full" disabled={isLoadingSyncSettings || isSavingSyncSettings}>
              Salvar configuracoes
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <DataCleanupCard />
        <ActionTypesCard />
      </div>
      <GradeDebugCard />

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <LogOut className="h-5 w-5" />
            Sair
          </CardTitle>
          <CardDescription>Encerrar sessao atual</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={logout} variant="destructive" className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            Sair da conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
