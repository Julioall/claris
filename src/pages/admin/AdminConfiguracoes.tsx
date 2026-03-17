import { useEffect, useRef, useState } from 'react';
import { Globe, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  CLARIS_CONFIGURED_STORAGE_KEY,
  DEFAULT_CLARIS_LLM_SETTINGS,
  isClarisSettingsConfigured,
  normalizeBaseUrl,
  type ClarisLlmSettings,
} from '@/lib/claris-settings';
import {
  DEFAULT_GLOBAL_APP_SETTINGS,
  DEFAULT_MOODLE_SERVICE,
  DEFAULT_MOODLE_URL,
  GLOBAL_APP_SETTINGS_ID,
  fetchGlobalAppSettings,
  normalizeRiskThresholdDays,
} from '@/lib/global-app-settings';

type RiskLevelThreshold = 'atencao' | 'risco' | 'critico';
type ClarisField = 'provider' | 'model' | 'baseUrl' | 'apiKey';

interface RiskThresholdDays {
  atencao: number;
  risco: number;
  critico: number;
}

export default function AdminConfiguracoes() {
  const [riskThresholdDays, setRiskThresholdDays] = useState<RiskThresholdDays>({
    atencao: 7,
    risco: 14,
    critico: 30,
  });
  const [lastSavedRiskThresholdDays, setLastSavedRiskThresholdDays] = useState<RiskThresholdDays>({
    atencao: 7,
    risco: 14,
    critico: 30,
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingRisk, setIsSavingRisk] = useState(false);
  const [clarisSettings, setClarisSettings] = useState<ClarisLlmSettings>(DEFAULT_CLARIS_LLM_SETTINGS);
  const [hasStoredClarisApiKey, setHasStoredClarisApiKey] = useState(false);
  const [isSavingClaris, setIsSavingClaris] = useState(false);
  const [isTestingClaris, setIsTestingClaris] = useState(false);
  const storedClarisApiKeyRef = useRef('');
  const [moodleConnectionUrl, setMoodleConnectionUrl] = useState(DEFAULT_MOODLE_URL);
  const [moodleConnectionService, setMoodleConnectionService] = useState(DEFAULT_MOODLE_SERVICE);
  const [isSavingMoodle, setIsSavingMoodle] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoadingSettings(true);
      try {
        const data = await fetchGlobalAppSettings(supabase);
        const normalized = normalizeRiskThresholdDays(data.riskThresholdDays);
        setRiskThresholdDays(normalized);
        setLastSavedRiskThresholdDays(normalized);
        storedClarisApiKeyRef.current = data.clarisSettings.apiKey;
        setHasStoredClarisApiKey(data.clarisSettings.apiKey.trim().length > 0);
        setClarisSettings({ ...data.clarisSettings, apiKey: '' });
        setMoodleConnectionUrl(data.moodleConnectionUrl || DEFAULT_MOODLE_URL);
        setMoodleConnectionService(data.moodleConnectionService || DEFAULT_MOODLE_SERVICE);
        localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, String(data.clarisSettings.configured));
      } catch {
        setRiskThresholdDays(DEFAULT_GLOBAL_APP_SETTINGS.riskThresholdDays);
        setLastSavedRiskThresholdDays(DEFAULT_GLOBAL_APP_SETTINGS.riskThresholdDays);
        storedClarisApiKeyRef.current = '';
        setHasStoredClarisApiKey(false);
        setClarisSettings(DEFAULT_CLARIS_LLM_SETTINGS);
        setMoodleConnectionUrl(DEFAULT_GLOBAL_APP_SETTINGS.moodleConnectionUrl);
        setMoodleConnectionService(DEFAULT_GLOBAL_APP_SETTINGS.moodleConnectionService);
        localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, 'false');
      } finally {
        setIsLoadingSettings(false);
      }
    };
    load();
  }, []);

  const updateRiskThresholdDays = (level: RiskLevelThreshold, value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    setRiskThresholdDays(prev => ({ ...prev, [level]: safeValue }));
  };

  const updateClarisField = (field: ClarisField, value: string) => {
    setClarisSettings(prev => ({ ...prev, [field]: value }));
  };

  const saveRiskSettings = async () => {
    const normalized = normalizeRiskThresholdDays(riskThresholdDays);
    if (!(normalized.atencao < normalized.risco && normalized.risco < normalized.critico)) {
      toast({
        title: 'Valores de risco invalidos',
        description: 'Defina dias crescentes: atencao < risco < critico.',
        variant: 'destructive',
      });
      return;
    }
    setIsSavingRisk(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ singleton_id: GLOBAL_APP_SETTINGS_ID, risk_threshold_days: normalized } as never, { onConflict: 'singleton_id' });
      if (error) throw error;
      setLastSavedRiskThresholdDays(normalized);
      setRiskThresholdDays(normalized);
      toast({ title: 'Configuracoes de risco salvas', description: 'Parametros de risco atualizados com sucesso.' });
    } catch {
      toast({ title: 'Erro ao salvar', description: 'Nao foi possivel salvar os parametros de risco.', variant: 'destructive' });
    } finally {
      setIsSavingRisk(false);
    }
  };

  const saveMoodleSettings = async () => {
    const urlToSave = moodleConnectionUrl.trim() || DEFAULT_MOODLE_URL;
    const serviceToSave = moodleConnectionService.trim() || DEFAULT_MOODLE_SERVICE;
    setIsSavingMoodle(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          { singleton_id: GLOBAL_APP_SETTINGS_ID, moodle_connection_url: urlToSave, moodle_connection_service: serviceToSave },
          { onConflict: 'singleton_id' },
        );
      if (error) throw error;
      setMoodleConnectionUrl(urlToSave);
      setMoodleConnectionService(serviceToSave);
      toast({ title: 'Conexao Moodle salva', description: 'URL e servico atualizados com sucesso.' });
    } catch {
      toast({ title: 'Erro ao salvar Moodle', description: 'Nao foi possivel salvar a conexao do Moodle.', variant: 'destructive' });
    } finally {
      setIsSavingMoodle(false);
    }
  };

  const saveClarisSettings = async () => {
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

    setIsSavingClaris(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ singleton_id: GLOBAL_APP_SETTINGS_ID, claris_llm_settings: payload }, { onConflict: 'singleton_id' });
      if (error) throw error;
      storedClarisApiKeyRef.current = effectiveApiKey;
      setHasStoredClarisApiKey(effectiveApiKey.length > 0);
      setClarisSettings(prev => ({ ...prev, apiKey: '', configured: payload.configured }));
      localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, String(payload.configured));
      toast({
        title: 'Configuracao da Claris IA salva',
        description: payload.configured
          ? 'Conexao global registrada para todos os usuarios.'
          : 'Dados globais salvos. Complete os campos para ativar a Claris IA.',
      });
    } catch {
      toast({ title: 'Erro ao salvar Claris IA', description: 'Nao foi possivel salvar a configuracao.', variant: 'destructive' });
    } finally {
      setIsSavingClaris(false);
    }
  };

  const testClarisConnection = async () => {
    const effectiveApiKey = clarisSettings.apiKey.trim().length > 0
      ? clarisSettings.apiKey.trim()
      : storedClarisApiKeyRef.current;

    if (!isClarisSettingsConfigured({ provider: clarisSettings.provider, model: clarisSettings.model, baseUrl: clarisSettings.baseUrl, apiKey: effectiveApiKey })) {
      toast({ title: 'Dados incompletos para teste', description: 'Preencha provider, modelo, base URL e chave API para testar.', variant: 'destructive' });
      return;
    }

    setIsTestingClaris(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        await supabase.auth.signOut();
        toast({ title: 'Sessao expirada', description: 'Entre novamente e tente testar novamente.', variant: 'destructive' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('claris-llm-test', {
        body: { provider: clarisSettings.provider, model: clarisSettings.model, baseUrl: clarisSettings.baseUrl, apiKey: clarisSettings.apiKey.trim() || undefined },
      });
      if (error) throw error;
      const latencyLabel = typeof data?.latencyMs === 'number' ? ` (${Math.round(data.latencyMs)} ms)` : '';
      toast({ title: 'Conexao validada', description: `Conexao com o provedor LLM validada com sucesso${latencyLabel}.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nao foi possivel testar a conexao com o provedor LLM.';
      toast({ title: 'Falha no teste', description: message, variant: 'destructive' });
    } finally {
      setIsTestingClaris(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracoes Globais</h1>
        <p className="text-muted-foreground">Gerencie as configuracoes da plataforma Claris</p>
      </div>

      {/* Moodle Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Conexao Moodle
          </CardTitle>
          <CardDescription>URL e servico do Moodle para autenticacao de todos os usuarios</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="moodle-url">URL do Moodle</Label>
            <Input
              id="moodle-url"
              type="url"
              value={moodleConnectionUrl}
              onChange={(e) => setMoodleConnectionUrl(e.target.value)}
              placeholder="https://moodle.exemplo.com"
              disabled={isLoadingSettings}
            />
            <p className="text-xs text-muted-foreground">A URL precisa estar acessivel pelo Supabase.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="moodle-service">Nome do Servico Web</Label>
            <Input
              id="moodle-service"
              type="text"
              value={moodleConnectionService}
              onChange={(e) => setMoodleConnectionService(e.target.value)}
              placeholder="moodle_mobile_app"
              disabled={isLoadingSettings}
            />
          </div>
          <Button onClick={saveMoodleSettings} variant="outline" className="w-full" disabled={isLoadingSettings || isSavingMoodle}>
            {isSavingMoodle ? 'Salvando...' : 'Salvar conexao Moodle'}
          </Button>
        </CardContent>
      </Card>

      {/* Risk Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Limiares de Risco</CardTitle>
          <CardDescription>Dias sem acesso para classificar nivel de risco dos alunos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {(['atencao', 'risco', 'critico'] as RiskLevelThreshold[]).map((level) => (
              <div key={level} className="flex items-center justify-between rounded-md border p-3 gap-3">
                <Label className="text-sm capitalize">{level}</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={String(riskThresholdDays[level])}
                  onChange={(e) => updateRiskThresholdDays(level, e.target.value)}
                  disabled={isLoadingSettings}
                  className="w-[120px]"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Use valores crescentes: atencao &lt; risco &lt; critico.{' '}
            {JSON.stringify(lastSavedRiskThresholdDays) !== JSON.stringify(riskThresholdDays) && (
              <span className="text-amber-600">Alteracoes nao salvas.</span>
            )}
          </p>
          <Button onClick={saveRiskSettings} variant="outline" className="w-full" disabled={isLoadingSettings || isSavingRisk}>
            {isSavingRisk ? 'Salvando...' : 'Salvar limiares de risco'}
          </Button>
        </CardContent>
      </Card>

      {/* Claris IA */}
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
                disabled={isSavingClaris}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claris-model">Modelo</Label>
              <Input
                id="claris-model"
                value={clarisSettings.model}
                onChange={(e) => updateClarisField('model', e.target.value)}
                placeholder="gpt-4o-mini"
                disabled={isSavingClaris}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="claris-base-url">Base URL</Label>
            <Input
              id="claris-base-url"
              value={clarisSettings.baseUrl}
              onChange={(e) => updateClarisField('baseUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={isSavingClaris}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="claris-api-key">
              Chave API{hasStoredClarisApiKey && <span className="text-xs text-muted-foreground ml-1">(chave salva — deixe em branco para manter)</span>}
            </Label>
            <Input
              id="claris-api-key"
              type="password"
              value={clarisSettings.apiKey}
              onChange={(e) => updateClarisField('apiKey', e.target.value)}
              placeholder={hasStoredClarisApiKey ? '••••••••' : 'sk-...'}
              disabled={isSavingClaris}
            />
          </div>
          <Separator />
          <div className="flex gap-3">
            <Button onClick={testClarisConnection} variant="outline" disabled={isSavingClaris || isTestingClaris} className="flex-1">
              {isTestingClaris ? 'Testando...' : 'Testar conexao'}
            </Button>
            <Button onClick={saveClarisSettings} disabled={isSavingClaris || isTestingClaris} className="flex-1">
              {isSavingClaris ? 'Salvando...' : 'Salvar Claris IA'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
