export interface MessagePreferences {
  sendOnEnter: boolean;
}

export const DEFAULT_MESSAGE_PREFERENCES: MessagePreferences = {
  sendOnEnter: false,
};

export const MESSAGE_PREFERENCES_STORAGE_KEY = 'claris_message_preferences';
const MESSAGE_PREFERENCES_UPDATED_EVENT = 'claris:message-preferences-updated';

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getStoredMessagePreferences(): MessagePreferences {
  if (!isBrowser()) return DEFAULT_MESSAGE_PREFERENCES;

  try {
    const storedValue = window.localStorage.getItem(MESSAGE_PREFERENCES_STORAGE_KEY);
    if (!storedValue) return DEFAULT_MESSAGE_PREFERENCES;

    const parsed = JSON.parse(storedValue) as Partial<MessagePreferences> | null;
    return {
      sendOnEnter: parsed?.sendOnEnter === true,
    };
  } catch {
    return DEFAULT_MESSAGE_PREFERENCES;
  }
}

export function saveMessagePreferences(preferences: MessagePreferences) {
  if (!isBrowser()) return;

  const normalizedPreferences: MessagePreferences = {
    sendOnEnter: preferences.sendOnEnter === true,
  };

  try {
    window.localStorage.setItem(MESSAGE_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizedPreferences));
  } catch {
    return;
  }

  window.dispatchEvent(new CustomEvent(MESSAGE_PREFERENCES_UPDATED_EVENT));
}

export function subscribeToMessagePreferences(callback: (preferences: MessagePreferences) => void) {
  if (!isBrowser()) {
    return () => undefined;
  }

  const syncPreferences = () => callback(getStoredMessagePreferences());
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== MESSAGE_PREFERENCES_STORAGE_KEY) return;
    syncPreferences();
  };
  const handlePreferencesUpdate = () => syncPreferences();

  window.addEventListener('storage', handleStorage);
  window.addEventListener(MESSAGE_PREFERENCES_UPDATED_EVENT, handlePreferencesUpdate);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(MESSAGE_PREFERENCES_UPDATED_EVENT, handlePreferencesUpdate);
  };
}
