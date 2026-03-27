import { useEffect, useRef, useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MoodleIcon } from '@/components/ui/MoodleIcon';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchAdminSettings,
  saveAiGradingSettings,
  saveClarisConnectionSettings,
  saveMoodleConnectionSettings,
  saveRiskThresholdSettings,
  testClarisLLM,
} from '../api/settings';
import { toast } from '@/hooks/use-toast';
import {
  DEFAULT_AI_GRADING_SETTINGS,
  parseAiGradingSettings,
  type AiGradingSettings,
} from '@/lib/ai-grading-settings';
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
  normalizeRiskThresholdDays,
} from '@/lib/global-app-settings';

type RiskLevelThreshold = 'atencao' | 'risco' | 'critico';
type ClarisField = 'provider' | 'model' | 'baseUrl' | 'apiKey';
type AiGradingField =
  | 'timeoutMs'
  | 'maxFileBytes'
  | 'associationMinScore'
  | 'minVisualTextChars'
  | 'minSubmissionTextChars'
  | 'maxStoredTextLength';
type AiGradingWeightField = keyof AiGradingSettings['associationWeights'];

interface RiskThresholdDays {
  atencao: number;
  risco: number;
  critico: number;
}

function parseCsvInput(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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
  const [aiGradingSettings, setAiGradingSettings] = useState<AiGradingSettings>(DEFAULT_AI_GRADING_SETTINGS);
  const [isSavingAiGrading, setIsSavingAiGrading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoadingSettings(true);
      try {
        const data = await fetchAdminSettings();
        const normalized = normalizeRiskThresholdDays(data.riskThresholdDays);
        setRiskThresholdDays(normalized);
        setLastSavedRiskThresholdDays(normalized);
        storedClarisApiKeyRef.current = data.clarisSettings.apiKey;
        setHasStoredClarisApiKey(data.clarisSettings.apiKey.trim().length > 0);
        setClarisSettings({ ...data.clarisSettings, apiKey: '' });
        setMoodleConnectionUrl(data.moodleConnectionUrl || DEFAULT_MOODLE_URL);
        setMoodleConnectionService(data.moodleConnectionService || DEFAULT_MOODLE_SERVICE);
        setAiGradingSettings(data.aiGradingSettings);
        localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, String(data.clarisSettings.configured));
      } catch {
        setRiskThresholdDays(DEFAULT_GLOBAL_APP_SETTINGS.riskThresholdDays);
        setLastSavedRiskThresholdDays(DEFAULT_GLOBAL_APP_SETTINGS.riskThresholdDays);
        storedClarisApiKeyRef.current = '';
        setHasStoredClarisApiKey(false);
        setClarisSettings(DEFAULT_CLARIS_LLM_SETTINGS);
        setMoodleConnectionUrl(DEFAULT_GLOBAL_APP_SETTINGS.moodleConnectionUrl);
        setMoodleConnectionService(DEFAULT_GLOBAL_APP_SETTINGS.moodleConnectionService);
        setAiGradingSettings(DEFAULT_GLOBAL_APP_SETTINGS.aiGradingSettings);
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

  const updateAiGradingField = (field: AiGradingField, value: string) => {
    const numeric = Number(value.replace(',', '.'));

    setAiGradingSettings(prev => ({
      ...prev,
      [field]: Number.isFinite(numeric)
        ? numeric
        : DEFAULT_AI_GRADING_SETTINGS[field],
    }));
  };

  const updateAiGradingWeight = (field: AiGradingWeightField, value: string) => {
    const numeric = Number(value.replace(',', '.'));

    setAiGradingSettings(prev => ({
      ...prev,
      associationWeights: {
        ...prev.associationWeights,
        [field]: Number.isFinite(numeric)
          ? numeric
          : DEFAULT_AI_GRADING_SETTINGS.associationWeights[field],
      },
    }));
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
      const { error } = await saveRiskThresholdSettings(normalized);
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
      const { error } = await saveMoodleConnectionSettings(urlToSave, serviceToSave);
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
      const { error } = await saveClarisConnectionSettings(payload);
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

  const saveAiGradingSettingsToAdmin = async () => {
    const normalized = parseAiGradingSettings(aiGradingSettings);

    setIsSavingAiGrading(true);
    try {
      const { error } = await saveAiGradingSettings(normalized);
      if (error) throw error;
      setAiGradingSettings(normalized);
      toast({
        title: 'Correcao com IA salva',
        description: 'As configuracoes operacionais da sugestao de notas foram atualizadas.',
      });
    } catch {
      toast({
        title: 'Erro ao salvar correcao com IA',
        description: 'Nao foi possivel salvar as configuracoes operacionais.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingAiGrading(false);
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
      const { data, error } = await testClarisLLM({
        provider: clarisSettings.provider,
        model: clarisSettings.model,
        baseUrl: clarisSettings.baseUrl,
        apiKey: effectiveApiKey,
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
            <MoodleIcon className="h-5 w-5" />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Correcao com IA
          </CardTitle>
          <CardDescription>
            Ajuste o comportamento da sugestao de notas. A conexao com o modelo reutiliza a configuracao da Claris IA acima.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="space-y-1">
              <Label htmlFor="ai-grading-enabled">Habilitar analise automatica</Label>
              <p className="text-xs text-muted-foreground">
                Quando desabilitado, a tela de notas nao gera sugestoes com IA.
              </p>
            </div>
            <Switch
              id="ai-grading-enabled"
              checked={aiGradingSettings.enabled}
              onCheckedChange={(checked) => setAiGradingSettings((prev) => ({ ...prev, enabled: checked }))}
              disabled={isLoadingSettings || isSavingAiGrading}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ai-grading-timeout">Timeout da IA (ms)</Label>
              <Input
                id="ai-grading-timeout"
                type="number"
                min={1000}
                step={1000}
                value={String(aiGradingSettings.timeoutMs)}
                onChange={(e) => updateAiGradingField('timeoutMs', e.target.value)}
                disabled={isLoadingSettings || isSavingAiGrading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-grading-max-file">Tamanho maximo de arquivo (bytes)</Label>
              <Input
                id="ai-grading-max-file"
                type="number"
                min={1024}
                step={1024}
                value={String(aiGradingSettings.maxFileBytes)}
                onChange={(e) => updateAiGradingField('maxFileBytes', e.target.value)}
                disabled={isLoadingSettings || isSavingAiGrading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-grading-min-score">Score minimo de associacao</Label>
              <Input
                id="ai-grading-min-score"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={String(aiGradingSettings.associationMinScore)}
                onChange={(e) => updateAiGradingField('associationMinScore', e.target.value)}
                disabled={isLoadingSettings || isSavingAiGrading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-grading-max-stored-text">Texto maximo armazenado</Label>
              <Input
                id="ai-grading-max-stored-text"
                type="number"
                min={500}
                step={100}
                value={String(aiGradingSettings.maxStoredTextLength)}
                onChange={(e) => updateAiGradingField('maxStoredTextLength', e.target.value)}
                disabled={isLoadingSettings || isSavingAiGrading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-grading-visual-text">Minimo de texto para caso visual</Label>
              <Input
                id="ai-grading-visual-text"
                type="number"
                min={1}
                step={1}
                value={String(aiGradingSettings.minVisualTextChars)}
                onChange={(e) => updateAiGradingField('minVisualTextChars', e.target.value)}
                disabled={isLoadingSettings || isSavingAiGrading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-grading-submission-text">Minimo de texto da submissao</Label>
              <Input
                id="ai-grading-submission-text"
                type="number"
                min={1}
                step={1}
                value={String(aiGradingSettings.minSubmissionTextChars)}
                onChange={(e) => updateAiGradingField('minSubmissionTextChars', e.target.value)}
                disabled={isLoadingSettings || isSavingAiGrading}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ai-grading-supported-types">Tipos suportados (CSV)</Label>
              <Textarea
                id="ai-grading-supported-types"
                rows={3}
                value={aiGradingSettings.supportedTypes.join(', ')}
                onChange={(e) => setAiGradingSettings((prev) => ({
                  ...prev,
                  supportedTypes: parseCsvInput(e.target.value),
                }))}
                disabled={isLoadingSettings || isSavingAiGrading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-grading-keywords">Palavras-chave de associacao (CSV)</Label>
              <Textarea
                id="ai-grading-keywords"
                rows={3}
                value={aiGradingSettings.associationKeywords.join(', ')}
                onChange={(e) => setAiGradingSettings((prev) => ({
                  ...prev,
                  associationKeywords: parseCsvInput(e.target.value),
                }))}
                disabled={isLoadingSettings || isSavingAiGrading}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Pesos da heuristica</Label>
              <p className="text-xs text-muted-foreground">
                Ajuste quanto cada criterio influencia a associacao entre assign e materiais da secao.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {([
                ['sameSection', 'Mesma secao'],
                ['similarName', 'Nome semelhante'],
                ['keywordMatch', 'Palavra-chave'],
                ['temporalProximity', 'Proximidade temporal'],
                ['explicitLink', 'Vinculo explicito'],
              ] as Array<[AiGradingWeightField, string]>).map(([field, label]) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`ai-grading-weight-${field}`}>{label}</Label>
                  <Input
                    id={`ai-grading-weight-${field}`}
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={String(aiGradingSettings.associationWeights[field])}
                    onChange={(e) => updateAiGradingWeight(field, e.target.value)}
                    disabled={isLoadingSettings || isSavingAiGrading}
                  />
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={saveAiGradingSettingsToAdmin}
            variant="outline"
            className="w-full"
            disabled={isLoadingSettings || isSavingAiGrading}
          >
            {isSavingAiGrading ? 'Salvando...' : 'Salvar correcao com IA'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
