import { createContext, useContext, type ReactNode } from 'react';

import type { MoodleSession, MoodleSessionMap } from '../domain/session';
import { getPrimaryMoodleSession } from '../domain/session';

const MoodleSessionContext = createContext<MoodleSessionMap | null>(null);

export function MoodleSessionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: MoodleSessionMap | null;
}) {
  return (
    <MoodleSessionContext.Provider value={value}>
      {children}
    </MoodleSessionContext.Provider>
  );
}

/** Returns all Moodle sessions keyed by source. */
// eslint-disable-next-line react-refresh/only-export-components
export function useMoodleSessions(): MoodleSessionMap | null {
  return useContext(MoodleSessionContext);
}

/** Returns the primary Moodle session (goias preferred, nacional as fallback). */
// eslint-disable-next-line react-refresh/only-export-components
export function useMoodleSession(): MoodleSession | null {
  const sessions = useContext(MoodleSessionContext);
  return getPrimaryMoodleSession(sessions);
}
