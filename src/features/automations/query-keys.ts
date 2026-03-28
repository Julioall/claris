export const automationsKeys = {
  bulkJobs: (filters?: { status?: string; search?: string; page?: number }) =>
    ['automations', 'bulk-jobs', filters?.status ?? 'all', filters?.search ?? '', filters?.page ?? 1] as const,
  bulkJobDetail: (jobId?: string | null) => ['automations', 'bulk-job-detail', jobId ?? 'none'] as const,
  bulkJobRecipients: (jobId?: string | null) =>
    ['automations', 'bulk-job-recipients', jobId ?? 'none'] as const,
  scheduledMessages: (filters?: { userId?: string; status?: string; search?: string; page?: number }) =>
    [
      'automations',
      'scheduled-messages',
      filters?.userId ?? 'anonymous',
      filters?.status ?? 'all',
      filters?.search ?? '',
      filters?.page ?? 1,
    ] as const,
  accessibleWhatsappInstances: (userId?: string) =>
    ['automations', 'whatsapp-instances', userId ?? 'anonymous'] as const,
};
