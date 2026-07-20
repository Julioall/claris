function isEnabled(value: string | undefined, defaultValue = true) {
  if (value === undefined || value === '') return defaultValue;

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export const featureFlags = {
  evolution: isEnabled(import.meta.env.VITE_EVOLUTION_ENABLED),
} as const;
