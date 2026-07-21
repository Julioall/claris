import {
  DEFAULT_AI_GRADING_SETTINGS,
  type AiGradingSettings,
} from '@/lib/ai-grading-settings';
import {
  DEFAULT_CLARIS_LLM_SETTINGS,
  type ClarisLlmSettings,
} from '@/lib/claris-settings';

export interface GlobalRiskThresholdDays {
  atencao: number;
  risco: number;
  critico: number;
}

export interface GlobalAppSettings {
  singletonId: string;
  moodleConnectionUrl: string;
  moodleConnectionService: string;
  riskThresholdDays: GlobalRiskThresholdDays;
  clarisSettings: ClarisLlmSettings;
  aiGradingSettings: AiGradingSettings;
}

export const GLOBAL_APP_SETTINGS_ID = 'global';
export const DEFAULT_MOODLE_URL = 'https://ead.fieg.com.br';
export const DEFAULT_MOODLE_SERVICE = 'moodle_mobile_app';

export const DEFAULT_GLOBAL_APP_SETTINGS: GlobalAppSettings = {
  singletonId: GLOBAL_APP_SETTINGS_ID,
  moodleConnectionUrl: DEFAULT_MOODLE_URL,
  moodleConnectionService: DEFAULT_MOODLE_SERVICE,
  riskThresholdDays: {
    atencao: 7,
    risco: 14,
    critico: 30,
  },
  clarisSettings: DEFAULT_CLARIS_LLM_SETTINGS,
  aiGradingSettings: DEFAULT_AI_GRADING_SETTINGS,
};

export const normalizeRiskThresholdDays = (value: GlobalRiskThresholdDays): GlobalRiskThresholdDays => ({
  atencao: Math.max(1, Math.floor(value.atencao)),
  risco: Math.max(1, Math.floor(value.risco)),
  critico: Math.max(1, Math.floor(value.critico)),
});
