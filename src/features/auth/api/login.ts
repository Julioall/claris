import { DEFAULT_MOODLE_SERVICE, DEFAULT_MOODLE_URL } from '@/lib/global-app-settings';

export interface LoginDefaults {
  moodleUrl: string;
  moodleService: string;
}

export async function fetchLoginDefaults(): Promise<LoginDefaults> {
  return {
    moodleUrl: DEFAULT_MOODLE_URL,
    moodleService: DEFAULT_MOODLE_SERVICE,
  };
}
