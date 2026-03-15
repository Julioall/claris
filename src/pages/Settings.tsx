import { useEffect, useRef, useState } from 'react';
import { User, RefreshCw, LogOut, Clock, Globe, Bot, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataCleanupCard } from '@/components/settings/DataCleanupCard';
import { GradeDebugCard } from '@/components/settings/GradeDebugCard';
import { ThemeCard } from '@/components/settings/ThemeCard';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  CLARIS_CONFIGURED_STORAGE_KEY,
  DEFAULT_CLARIS_LLM_SETTINGS,
  isClarisSettingsConfigured,
  normalizeBaseUrl,
  parseClarisLlmSettings,
  type ClarisLlmSettings,
} from '@/lib/claris-settings';

type RiskLevelThreshold = 'atencao' | 'risco' | 'critico';

interface RiskThresholdDays {
  atencao: number;
  risco: number;
  critico: number;
}

interface SyncSettings {
  riskThresholdDays: RiskThresholdDays;
}

type ClarisField = 'provider' | 'model' | 'baseUrl' | 'apiKey';

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  riskThresholdDays: {
    atencao: 7,
    risco: 14,
    critico: 30,
  },
};

const normalizeRiskThresholdDays = (value: RiskThresholdDays): RiskThresholdDays => ({
  atencao: Math.max(1, Math.floor(value.atencao)),
  risco: Math.max(1, Math.floor(value.risco)),
  critico: Math.max(1, Math.floor(value.critico)),
});

export default function Settings() {
  const { user, logout, lastSync, syncData, isSyncing, isOfflineMode, courses } = useAuth();
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(DEFAULT_SYNC_SETTINGS);
  const [lastSavedRiskThresholdDays, setLastSavedRiskThresholdDays] = useState<RiskThresholdDays>(DEFAULT_SYNC_SETTINGS.riskThresholdDays);
  const [isLoadingSyncSettings, setIsLoadingSyncSettings] = useState(false);
  const [isSavingSyncSettings, setIsSavingSyncSettings] = useState(false);
  const [clarisSettings, setClarisSettings] = useState<ClarisLlmSettings>(DEFAULT_CLARIS_LLM_SETTINGS);
  const [hasStoredClarisApiKey, setHasStoredClarisApiKey] = useState(false);
  const [isSavingClarisSettings, setIsSavingClarisSettings] = useState(false);
  const [isTestingClarisConnection, setIsTestingClarisConnection] = useState(false);
  const storedClarisApiKeyRef = useRef('');

  const recalculateAllStudentsRisk = async () => {
    const isMissingRpcError = (error: { code?: string | null; message?: string } | null) =>
      Boolean(error) && (
        error?.code === 'PGRST202' ||
        error?.message?.toLowerCase().includes('could not find the function') === true
      );

    const runCourseUpdate = async () => {
      const { data: courseRows, error: coursesError } = await supabase
        .from('student_courses')
        .select('course_id');

      if (coursesError) {
        return { failedCount: 1, updatedCount: 0, missingRpc: false };
      }

      const uniqueCourseIds = Array.from(new Set((courseRows || []).map(row => row.course_id)));
      if (uniqueCourseIds.length === 0) {
        return { failedCount: 0, updatedCount: 0, missingRpc: false };
      }

      const firstCourse = await supabase.rpc('update_course_students_risk', {
        p_course_id: uniqueCourseIds[0],
      });

      if (isMissingRpcError(firstCourse.error)) {
        return { failedCount: 0, updatedCount: 0, missingRpc: true };
      }

      if (firstCourse.error) {
        return { failedCount: 1, updatedCount: 0, missingRpc: false };
      }

      if (uniqueCourseIds.length === 1) {
        return {
          failedCount: 0,
          updatedCount: firstCourse.data ?? 0,
          missingRpc: false,
        };
      }

      const results = await Promise.all(
        uniqueCourseIds.slice(1).map(courseId =>
          supabase.rpc('update_course_students_risk', { p_course_id: courseId }),
        ),
      );

      const errors = results
        .map(result => result.error)
        .filter((error): error is NonNullable<typeof error> => Boolean(error));

      return {
        failedCount: errors.length,
        updatedCount: (firstCourse.data ?? 0) + results.reduce((acc, result) => acc + (result.data ?? 0), 0),
        missingRpc: errors.some(isMissingRpcError),
      };
    };

    const runStudentFallback = async () => {
      const { data: studentsRows, error: studentsError } = await supabase
        .from('students')
        .select('id');

      if (studentsError) {
        return { failedCount: 1, updatedCount: 0, missingRpc: false };
      }

      const studentIds = (studentsRows || []).map(row => row.id);
      if (studentIds.length === 0) {
        return { failedCount: 0, updatedCount: 0, missingRpc: false };
      }

      const firstStudent = await supabase.rpc('update_student_risk', {
        p_student_id: studentIds[0],
      });

      if (isMissingRpcError(firstStudent.error)) {
        return { failedCount: 0, updatedCount: 0, missingRpc: true };
      }

      if (firstStudent.error) {
        return { failedCount: 1, updatedCount: 0, missingRpc: false };
      }

      if (studentIds.length === 1) {
        return { failedCount: 0, updatedCount: 1, missingRpc: false };
      }

      const results = await Promise.all(
        studentIds.slice(1).map(studentId =>
          supabase.rpc('update_student_risk', { p_student_id: studentId }),
        ),
      );

      const errors = results
        .map(result => result.error)
        .filter((error): error is NonNullable<typeof error> => Boolean(error));

      return {
        failedCount: errors.length,
        updatedCount: studentIds.length - errors.length,
        missingRpc: errors.some(isMissingRpcError),
      };
    };

    let result = await runCourseUpdate();
    let usedFallback = false;

    if (result.missingRpc) {
      usedFallback = true;
      result = await runStudentFallback();
    }

    return {
      ...result,
      usedFallback,
    };
  };

  useEffect(() => {
    if (!user) return;

    const loadSyncSettings = async () => {
      setIsLoadingSyncSettings(true);
      try {
        const { data, error } = await supabase
          .from('user_sync_preferences')
          .select('selected_keys, include_empty_courses, include_finished, sync_interval_hours, risk_threshold_days, claris_llm_settings')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading sync settings:', error);
          return;
        }

        if (data) {
          const rawRiskThreshold = asObject(data.risk_threshold_days);

          const loadedSettings: SyncSettings = {
            riskThresholdDays: normalizeRiskThresholdDays({
              atencao: Number(rawRiskThreshold.atencao ?? DEFAULT_SYNC_SETTINGS.riskThresholdDays.atencao),
              risco: Number(rawRiskThreshold.risco ?? DEFAULT_SYNC_SETTINGS.riskThresholdDays.risco),
              critico: Number(rawRiskThreshold.critico ?? DEFAULT_SYNC_SETTINGS.riskThresholdDays.critico),
            }),
          };

          setSyncSettings(loadedSettings);
          setLastSavedRiskThresholdDays(loadedSettings.riskThresholdDays);

          const loadedClarisSettings = parseClarisLlmSettings(data.claris_llm_settings);
          storedClarisApiKeyRef.current = loadedClarisSettings.apiKey;
          setHasStoredClarisApiKey(loadedClarisSettings.apiKey.trim().length > 0);
          setClarisSettings({ ...loadedClarisSettings, apiKey: '' });
          localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, String(loadedClarisSettings.configured));
        } else {
          setSyncSettings(DEFAULT_SYNC_SETTINGS);
          setLastSavedRiskThresholdDays(DEFAULT_SYNC_SETTINGS.riskThresholdDays);
          storedClarisApiKeyRef.current = '';
          setHasStoredClarisApiKey(false);
          setClarisSettings(DEFAULT_CLARIS_LLM_SETTINGS);
          localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, 'false');
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

  const saveSyncSettings = async () => {
    if (!user) return;

    const normalizedRiskThresholdDays = normalizeRiskThresholdDays(syncSettings.riskThresholdDays);
    const atencaoDays = normalizedRiskThresholdDays.atencao;
    const riscoDays = normalizedRiskThresholdDays.risco;
    const criticoDays = normalizedRiskThresholdDays.critico;

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
      const hasRiskThresholdChanged =
        lastSavedRiskThresholdDays.atencao !== atencaoDays ||
        lastSavedRiskThresholdDays.risco !== riscoDays ||
        lastSavedRiskThresholdDays.critico !== criticoDays;

      const syncPreferencesPayload = {
        user_id: user.id,
        risk_threshold_days: { ...normalizedRiskThresholdDays },
      };

      const { error } = await supabase
        .from('user_sync_preferences')
        .upsert(syncPreferencesPayload, { onConflict: 'user_id' });

      if (error) throw error;

      setLastSavedRiskThresholdDays(normalizedRiskThresholdDays);
      setSyncSettings(prev => ({ ...prev, riskThresholdDays: normalizedRiskThresholdDays }));

      let recalculationSummary = '';
      if (hasRiskThresholdChanged) {
        const riskResult = await recalculateAllStudentsRisk();
        if (riskResult.missingRpc) {
          toast({
            title: 'Funcao de risco indisponivel',
            description: 'As funcoes de atualizacao de risco nao existem no banco local. Crie/aplique as migracoes.',
            variant: 'destructive',
          });
        } else if (riskResult.failedCount > 0) {
          toast({
            title: 'Atualizacao parcial de risco',
            description: riskResult.usedFallback
              ? `${riskResult.updatedCount} alunos recalculados via fallback e ${riskResult.failedCount} com erro.`
              : `${riskResult.updatedCount} alunos recalculados e ${riskResult.failedCount} com erro.`,
            variant: 'destructive',
          });
        } else {
          recalculationSummary = ` Risco recalculado automaticamente para ${riskResult.updatedCount} alunos.`;
        }
      }

      toast({
        title: 'Configuracoes salvas',
        description: `Parametros de risco atualizados com sucesso.${recalculationSummary}`,
      });
    } catch (err) {
      console.error('Error saving sync settings:', err);
      toast({
        title: 'Erro ao salvar configuracoes',
        description: 'Nao foi possivel salvar os parametros de risco.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingSyncSettings(false);
    }
  };

  const updateRiskThresholdDays = (level: RiskLevelThreshold, value: string) => {
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

  const updateClarisField = (field: ClarisField, value: string) => {
    setClarisSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveClarisSettings = async () => {
    if (!user) return;

    const effectiveApiKey = clarisSettings.apiKey.trim().length > 0
      ? clarisSettings.apiKey.trim()
      : storedClarisApiKeyRef.current;

    const payload = {
      provider: clarisSettings.provider.trim() || DEFAULT_CLARIS_LLM_SETTINGS.provider,
      model: clarisSettings.model.trim(),
      baseUrl: normalizeBaseUrl(clarisSettings.baseUrl),
      apiKey: effectiveApiKey,
      configured: isClarisSettingsConfigured({
        provider: clarisSettings.provider,
        model: clarisSettings.model,
        baseUrl: clarisSettings.baseUrl,
        apiKey: effectiveApiKey,
      }),
      updatedAt: new Date().toISOString(),
    };

    setIsSavingClarisSettings(true);
    try {
      const { error } = await supabase
        .from('user_sync_preferences')
        .upsert({
          user_id: user.id,
          claris_llm_settings: payload,
        }, { onConflict: 'user_id' });

      if (error) throw error;

      storedClarisApiKeyRef.current = effectiveApiKey;
      setHasStoredClarisApiKey(effectiveApiKey.length > 0);
      setClarisSettings(prev => ({ ...prev, apiKey: '', configured: payload.configured }));
      localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, String(payload.configured));

      toast({
        title: 'Configuracao da Claris IA salva',
        description: payload.configured
          ? 'Conexao registrada. A integracao completa com LLM sera habilitada na proxima fase.'
          : 'Dados salvos. Complete os campos para ativar a Claris IA.',
      });
    } catch (err) {
      console.error('Error saving Claris settings:', err);
      toast({
        title: 'Erro ao salvar Claris IA',
        description: 'Nao foi possivel salvar a configuracao da Claris IA.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingClarisSettings(false);
    }
  };

  const testClarisConnection = async () => {
    const effectiveApiKey = clarisSettings.apiKey.trim().length > 0
      ? clarisSettings.apiKey.trim()
      : storedClarisApiKeyRef.current;

    const isReadyToTest = isClarisSettingsConfigured({
      provider: clarisSettings.provider,
      model: clarisSettings.model,
      baseUrl: clarisSettings.baseUrl,
      apiKey: effectiveApiKey,
    });

    if (!isReadyToTest) {
      toast({
        title: 'Dados incompletos para teste',
        description: 'Preencha provider, modelo, base URL e chave API para testar a conexao.',
        variant: 'destructive',
      });
      return;
    }

    setIsTestingClarisConnection(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        await supabase.auth.signOut();
        toast({
          title: 'Sessao expirada',
          description: 'Sua autenticacao expirou. Entre novamente e tente testar a conexao da Claris IA.',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('claris-llm-test', {
        body: {
          provider: clarisSettings.provider,
          model: clarisSettings.model,
          baseUrl: clarisSettings.baseUrl,
          apiKey: clarisSettings.apiKey.trim() || undefined,
        },
      });

      if (error) throw error;

      const latencyLabel = typeof data?.latencyMs === 'number' ? ` (${Math.round(data.latencyMs)} ms)` : '';

      toast({
        title: 'Conexao validada',
        description: `Conexao com o provedor LLM validada com sucesso${latencyLabel}.`,
      });
    } catch (err) {
      console.error('Error testing Claris connection:', err);
      const message = err instanceof Error ? err.message : 'Nao foi possivel testar a conexao com o provedor LLM.';
      const normalized = message.toLowerCase();

      if (normalized.includes('invalid jwt')) {
        await supabase.auth.signOut();
        toast({
          title: 'JWT invalido',
          description: 'Sua sessao atual ficou invalida. Faça login novamente para testar a conexao da Claris IA.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Falha no teste de conexao',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsTestingClarisConnection(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracoes</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferencias</p>
      </div>

      <div className="space-y-6">
        <ThemeCard />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Claris IA
            </CardTitle>
            <CardDescription>Configure a conexao da Claris com seu provedor LLM</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="claris-provider">Provider</Label>
                <Input
                  id="claris-provider"
                  value={clarisSettings.provider}
                  onChange={(e) => updateClarisField('provider', e.target.value)}
                  placeholder="openai"
                  disabled={isSavingClarisSettings}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claris-model">Modelo</Label>
                <Input
                  id="claris-model"
                  value={clarisSettings.model}
                  onChange={(e) => updateClarisField('model', e.target.value)}
                  placeholder="gpt-4o-mini"
                  disabled={isSavingClarisSettings}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="claris-base-url">Endpoint/Base URL</Label>
              <Input
                id="claris-base-url"
                value={clarisSettings.baseUrl}
                onChange={(e) => updateClarisField('baseUrl', e.target.value)}
                placeholder="https://api.openai.com/v1"
                disabled={isSavingClarisSettings}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="claris-api-key">Chave API</Label>
              <Input
                id="claris-api-key"
                type="password"
                value={clarisSettings.apiKey}
                onChange={(e) => updateClarisField('apiKey', e.target.value)}
                placeholder={hasStoredClarisApiKey ? '•••••••••••• (chave ja salva)' : 'sk-...'}
                disabled={isSavingClarisSettings}
              />
              <p className="text-xs text-muted-foreground">
                Por seguranca, a chave salva nao e exibida. Preencha apenas se quiser substituir a atual.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={testClarisConnection}
                disabled={isTestingClarisConnection || isSavingClarisSettings}
                className="sm:flex-1"
              >
                <PlugZap className="mr-2 h-4 w-4" />
                {isTestingClarisConnection ? 'Testando...' : 'Testar conexao'}
              </Button>
              <Button
                onClick={saveClarisSettings}
                disabled={isSavingClarisSettings}
                className="sm:flex-1"
              >
                {isSavingClarisSettings ? 'Salvando...' : 'Salvar Claris IA'}
              </Button>
            </div>
          </CardContent>
        </Card>

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
            <CardDescription>Sincronizacao geral para carga inicial da plataforma (quando ainda nao houver dados)</CardDescription>
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

            <div className="rounded-md border p-3 bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Use este botao apenas no inicio, quando ainda nao houver dados sincronizados. Para uso diario, prefira os botoes incrementais nas telas de Alunos e Unidades Curriculares.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={syncData}
              disabled={isOfflineMode || isSyncing || courses.length > 0}
              className="w-full"
            >
              {isSyncing ? 'Sincronizando...' : 'Sincronizacao geral inicial'}
            </Button>

            {courses.length > 0 && (
              <p className="text-xs text-muted-foreground">
                A sincronizacao geral inicial fica disponivel apenas quando ainda nao houver dados na plataforma.
              </p>
            )}

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
