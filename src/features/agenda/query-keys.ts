export const agendaKeys = {
  allEvents: (userId?: string) => ['agenda', 'events', userId ?? 'anonymous'] as const,
  events: (userId?: string, from?: string, to?: string) =>
    ['agenda', 'events', userId ?? 'anonymous', from ?? 'all', to ?? 'all'] as const,
};
