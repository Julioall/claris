import { useEffect, useRef, useState } from 'react';
import { Bot, HelpCircle, RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MoodleIcon } from '@/components/ui/MoodleIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DataCleanupCard } from '@/features/settings/components/DataCleanupCard';
import { useMoodleSession } from '@/features/auth/context/MoodleSessionContext';
import {
  fetchAdminSettings,
  saveAiGradingSettings,
  saveClarisConnectionSettings,
  saveRiskThresholdSettings,
  syncProjectCatalog,
  testClarisLLM,
  type CatalogSyncResult,
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
  CLARIS_LLM_PROVIDER_OPTIONS,
  CLARIS_LLM_MODEL_PRESETS,
  findClarisModelPresetBySettings,
  isClarisSettingsConfigured,
  normalizeBaseUrl,
  type ClarisLlmSettings,
} from '@/lib/claris-settings';
import {
  DEFAULT_GLOBAL_APP_SETTINGS,
  normalizeRiskThresholdDays,
} from '@/lib/global-app-settings';

type RiskLevelThreshold = 'atencao' | 'risco' | 'critico';
type ClarisField = 'model' | 'baseUrl' | 'apiKey' | 'customInstructions';
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

const AI_GRADING_WEIGHT_FIELDS: Array<{
  field: AiGradingWeightField;
  label: string;
  description: string;
}> = [
  {
    field: 'sameSection',
    label: 'Mesma secao',
    description: 'Aumenta a relevancia de materiais que estao no mesmo topico ou secao do Moodle que a atividade.',
  },
  {
    field: 'similarName',
    label: 'Nome semelhante',
    description: 'Da mais peso quando o nome do arquivo, pagina ou recurso se parece com o nome da atividade.',
  },
  {
    field: 'keywordMatch',
    label: 'Palavra-chave',
    description: 'Considera a presenca de termos em comum entre a atividade e os materiais associados.',
  },
  {
    field: 'temporalProximity',
    label: 'Proximidade temporal',
    description: 'Favorece materiais publicados ou atualizados perto da data em que a atividade foi disponibilizada.',
  },
  {
    field: 'explicitLink',
    label: 'Vinculo explicito',
    description: 'Valoriza sinais diretos de que o material pertence a atividade, como mencoes claras no texto ou na descricao.',
  },
];

const CUSTOM_MODEL_PRESET_ID = '__custom__';

function parseCsvInput(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export default function AdminConfiguracoes() {
  const moodleSession = useMoodleSession();
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [lastCatalogSyncResult, setLastCatalogSyncResult] = useState<CatalogSyncResult | null>(null);
  const [catalogCategoryIdInput, setCatalogCategoryIdInput] = useState('');
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
  const [selectedClarisModelPreset, setSelectedClarisModelPreset] = useState<string>(CUSTOM_MODEL_PRESET_ID);
  const storedClarisApiKeyRef = useRef('');
  const [aiGradingSettings, setAiGradingSettings] = useState<AiGradingSettings>(DEFAULT_AI_GRADING_SETTINGS);
  const [isSavingAiGrading, setIsSavingAiGrading] = useState(false);
  const clarisModelPresetsForProvider = CLARIS_LLM_MODEL_PRESETS.filter((preset) => (
    preset.provider.toLowerCase() === clarisSettings.provider.trim().toLowerCase()
  ));
  const selectedClarisPreset = CLARIS_LLM_MODEL_PRESETS.find((preset) => preset.id === selectedClarisModelPreset);

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
        const matchedPreset = findClarisModelPresetBySettings(data.clarisSettings);
        setSelectedClarisModelPreset(matchedPreset?.id ?? CUSTOM_MODEL_PRESET_ID);
        setAiGradingSettings(data.aiGradingSettings);
        localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, String(data.clarisSettings.configured));
      } catch {
        setRiskThresholdDays(DEFAULT_GLOBAL_APP_SETTINGS.riskThresholdDays);
        setLastSavedRiskThresholdDays(DEFAULT_GLOBAL_APP_SETTINGS.riskThresholdDays);
        storedClarisApiKeyRef.current = '';
        setHasStoredClarisApiKey(false);
        setClarisSettings(DEFAULT_CLARIS_LLM_SETTINGS);
        setSelectedClarisModelPreset(CUSTOM_MODEL_PRESET_ID);
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

  const updateClarisProvider = (provider: string) => {
    const normalizedProvider = provider.trim().toLowerCase();
    const presetsForProvider = CLARIS_LLM_MODEL_PRESETS.filter((preset) => (
      preset.provider.toLowerCase() === normalizedProvider
    ));

    if (presetsForProvider.length === 0) {
      setSelectedClarisModelPreset(CUSTOM_MODEL_PRESET_ID);
      setClarisSettings((prev) => ({ ...prev, provider }));
      return;
    }

    const matchedPreset = presetsForProvider.find((preset) => (
      preset.model.toLowerCase() === clarisSettings.model.trim().toLowerCase()
      && normalizeBaseUrl(preset.baseUrl).toLowerCase() === normalizeBaseUrl(clarisSettings.baseUrl).toLowerCase()
    ));
    const targetPreset = matchedPreset ?? presetsForProvider[0];

    setSelectedClarisModelPreset(targetPreset.id);
    setClarisSettings((prev) => ({
      ...prev,
      provider,
      model: targetPreset.model,
      baseUrl: targetPreset.baseUrl,
    }));
  };

  const updateClarisModelPreset = (presetId: string) => {
    setSelectedClarisModelPreset(presetId);
    if (presetId === CUSTOM_MODEL_PRESET_ID) {
      return;
    }

    const selectedPreset = CLARIS_LLM_MODEL_PRESETS.find((preset) => preset.id === presetId);
    if (!selectedPreset) {
      return;
    }

    setClarisSettings((prev) => ({
      ...prev,
      provider: selectedPreset.provider,
      model: selectedPreset.model,
      baseUrl: selectedPreset.baseUrl,
    }));
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

  const saveClarisSettings = async () => {
    const effectiveApiKey = clarisSettings.apiKey.trim().length > 0
      ? clarisSettings.apiKey.trim()
      : storedClarisApiKeyRef.current;

    const payload = {
      provider: clarisSettings.provider.trim() || DEFAULT_CLARIS_LLM_SETTINGS.provider,
      model: clarisSettings.model.trim(),
      baseUrl: normalizeBaseUrl(clarisSettings.baseUrl),
      apiKey: effectiveApiKey,
      customInstructions: clarisSettings.customInstructions.trim(),
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
      setClarisSettings(prev => ({
        ...prev,
        apiKey: '',
        customInstructions: payload.customInstructions,
        configured: payload.configured,
      }));
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
          <p className="text-sm text-muted-foreground">
            A conexao com o Moodle esta fixa para o dominio institucional. Edicao via painel foi desabilitada.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <Label className="text-xs text-muted-foreground">URL do Moodle</Label>
              <p className="font-mono text-sm break-words">{DEFAULT_GLOBAL_APP_SETTINGS.moodleConnectionUrl}</p>
            </div>
            <div className="rounded-md border p-3">
              <Label className="text-xs text-muted-foreground">Nome do Servico Web</Label>
              <p className="font-mono text-sm">{DEFAULT_GLOBAL_APP_SETTINGS.moodleConnectionService}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Para alterar este valor, atualize a configuracao fixa da aplicacao.
          </p>
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
              <Select
                value={clarisSettings.provider}
                onValueChange={updateClarisProvider}
                disabled={isSavingClaris}
              >
                <SelectTrigger id="claris-provider" aria-label="Provider">
                  <SelectValue placeholder="Selecione um provider" />
                </SelectTrigger>
                <SelectContent>
                  {CLARIS_LLM_PROVIDER_OPTIONS.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="claris-model">Modelo</Label>
              <Select
                value={selectedClarisModelPreset}
                onValueChange={updateClarisModelPreset}
                disabled={isSavingClaris}
              >
                <SelectTrigger id="claris-model" aria-label="Modelo">
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {clarisModelPresetsForProvider.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_MODEL_PRESET_ID}>Customizado</SelectItem>
                </SelectContent>
              </Select>
              {selectedClarisModelPreset === CUSTOM_MODEL_PRESET_ID && (
                <Input
                  value={clarisSettings.model}
                  onChange={(e) => updateClarisField('model', e.target.value)}
                  placeholder="gpt-5-mini"
                  disabled={isSavingClaris}
                />
              )}
              {selectedClarisModelPreset !== CUSTOM_MODEL_PRESET_ID && (
                <div className="space-y-1">
                  {selectedClarisPreset?.recommended && <Badge variant="secondary">Recomendado</Badge>}
                  <p className="text-xs text-muted-foreground">
                    {selectedClarisPreset?.notes}
                  </p>
                </div>
              )}
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
          <div className="space-y-2">
            <Label htmlFor="claris-custom-instructions">Prompt de instrucoes personalizadas</Label>
            <Textarea
              id="claris-custom-instructions"
              rows={6}
              value={clarisSettings.customInstructions}
              onChange={(e) => updateClarisField('customInstructions', e.target.value)}
              placeholder="Ex.: responda com tom mais consultivo, destaque proximos passos primeiro e mantenha respostas curtas."
              disabled={isSavingClaris}
            />
            <p className="text-xs text-muted-foreground">
              Apenas estas instrucoes ficam editaveis no admin. A base operacional e o formato interno da Claris continuam fixos.
            </p>
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
            Claris IA - Correcao de atividade
          </CardTitle>
          <CardDescription>
            Personalize o prompt e a assinatura aplicada ao final de cada feedback. A conexao com o modelo reutiliza a configuracao da Claris IA acima.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="space-y-1">
              <Label htmlFor="ai-grading-enabled">Habilitar analise automatica</Label>
              <p className="text-xs text-muted-foreground">
                Quando desabilitado, a aba de atividades da UC nao gera sugestoes com IA.
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

          <div className="space-y-2">
            <Label htmlFor="ai-grading-custom-instructions">Prompt de instrucoes personalizadas do feedback</Label>
            <Textarea
              id="ai-grading-custom-instructions"
              rows={6}
              value={aiGradingSettings.customInstructions}
              onChange={(e) => setAiGradingSettings((prev) => ({
                ...prev,
                customInstructions: e.target.value,
              }))}
              placeholder="Ex.: destaque pontos fortes primeiro, traga orientacoes mais objetivas e use linguagem mais acolhedora."
              disabled={isLoadingSettings || isSavingAiGrading}
            />
            <p className="text-xs text-muted-foreground">
              O JSON de resposta da correcao permanece fixo internamente. Use este campo apenas para orientar estilo, tom e nivel de detalhamento do feedback.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-grading-feedback-signature">Assinatura ao final do feedback (opcional)</Label>
            <Textarea
              id="ai-grading-feedback-signature"
              rows={3}
              value={aiGradingSettings.feedbackSignature}
              onChange={(e) => setAiGradingSettings((prev) => ({
                ...prev,
                feedbackSignature: e.target.value,
              }))}
              placeholder="Ex.:\nTutor Julio"
              disabled={isLoadingSettings || isSavingAiGrading}
            />
            <p className="text-xs text-muted-foreground">
              Se preenchida, esta assinatura sera adicionada automaticamente ao final de cada feedback. Por padrao, permanece vazia.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Pesos da heuristica</Label>
              <p className="text-xs text-muted-foreground">
                Ajuste quanto cada criterio influencia a associacao entre assign e materiais da secao.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {AI_GRADING_WEIGHT_FIELDS.map(({ field, label, description }) => (
                <div key={field} className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor={`ai-grading-weight-${field}`}>{label}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Explicar ${label}`}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-64">
                        {description}
                      </TooltipContent>
                    </Tooltip>
                  </div>
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

      {/* Sincronizacao Global do Catalogo Moodle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sincronizacao Global do Catalogo Moodle
          </CardTitle>
          <CardDescription>
            Importa todos os cursos e participantes do Moodle e cria usuarios tutores/monitores automaticamente.
            Esta operacao pode levar alguns minutos dependendo do tamanho do catalogo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!moodleSession ? (
            <p className="text-sm text-muted-foreground">
              Necessario estar autenticado com credenciais Moodle para executar esta sincronizacao.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="catalog-category-id">ID da categoria Moodle (opcional)</Label>
                <Input
                  id="catalog-category-id"
                  type="number"
                  min={1}
                  step={1}
                  value={catalogCategoryIdInput}
                  onChange={(e) => setCatalogCategoryIdInput(e.target.value)}
                  placeholder="Ex.: 34"
                  disabled={isSyncingCatalog}
                />
                <p className="text-xs text-muted-foreground">
                  Preencha para sincronizar apenas uma categoria e diminuir a carga. Em branco, sincroniza o catalogo inteiro.
                </p>
              </div>

              {lastCatalogSyncResult && (
                <div className="grid gap-2 md:grid-cols-4">
                  {([
                    { label: 'Cursos', value: lastCatalogSyncResult.courses },
                    { label: 'Usuarios', value: lastCatalogSyncResult.participantUsers },
                    { label: 'Vinculos', value: lastCatalogSyncResult.userCourseLinks },
                    { label: 'Grupos', value: lastCatalogSyncResult.groupAssignments },
                  ] as const).map(({ label, value }) => (
                    <div key={label} className="rounded-md border p-3 text-center">
                      <p className="text-2xl font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              <Button
                onClick={async () => {
                  const parsedCategoryId = Number(catalogCategoryIdInput);
                  const categoryId = Number.isFinite(parsedCategoryId) && parsedCategoryId > 0
                    ? Math.trunc(parsedCategoryId)
                    : undefined;

                  setIsSyncingCatalog(true);
                  setLastCatalogSyncResult(null);
                  try {
                    const result = await syncProjectCatalog(moodleSession.moodleUrl, moodleSession.moodleToken, categoryId);
                    setLastCatalogSyncResult(result);
                    toast({
                      title: 'Sincronizacao concluida',
                      description: `${result.courses} cursos, ${result.participantUsers} usuarios, ${result.userCourseLinks} vinculos, ${result.groupAssignments} atribuicoes de grupo.${categoryId ? ` Categoria: ${categoryId}.` : ''}`,
                    });
                  } catch (err) {
                    toast({
                      title: 'Erro na sincronizacao',
                      description: err instanceof Error ? err.message : 'Erro desconhecido',
                      variant: 'destructive',
                    });
                  } finally {
                    setIsSyncingCatalog(false);
                  }
                }}
                variant="outline"
                className="w-full"
                disabled={isSyncingCatalog}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingCatalog ? 'animate-spin' : ''}`} />
                {isSyncingCatalog ? 'Sincronizando...' : 'Sincronizar catalogo completo'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <DataCleanupCard />
    </div>
  );
}
