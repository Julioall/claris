import { createContext, useContext, type ReactNode } from 'react';

import type { MoodleSession } from '../domain/session';

const MoodleSessionContext = createContext<MoodleSession | null>(null);

export function MoodleSessionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: MoodleSession | null;
}) {
  return (
    <MoodleSessionContext.Provider value={value}>
      {children}
    </MoodleSessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMoodleSession() {
  return useContext(MoodleSessionContext);
}
