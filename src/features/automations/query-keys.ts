export const automationsKeys = {
  bulkJobs: (statusFilter = 'all') => ['automations', 'bulk-jobs', statusFilter] as const,
  bulkJobDetail: (jobId?: string | null) => ['automations', 'bulk-job-detail', jobId ?? 'none'] as const,
  bulkJobRecipients: (jobId?: string | null) =>
    ['automations', 'bulk-job-recipients', jobId ?? 'none'] as const,
  scheduledMessages: (userId?: string) => ['automations', 'scheduled-messages', userId ?? 'anonymous'] as const,
  accessibleWhatsappInstances: (userId?: string) =>
    ['automations', 'whatsapp-instances', userId ?? 'anonymous'] as const,
};
