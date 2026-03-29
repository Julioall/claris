export interface CampaignRoutineDraftRecipientPreview {
  id: string;
  name: string;
  email?: string | null;
  riskLevel?: string | null;
}

export interface CampaignRoutineDraft {
  channel: "moodle";
  createdAt: string;
  messageContent: string;
  previewMessage?: string;
  recipientCount: number;
  recipientsPreview: CampaignRoutineDraftRecipientPreview[];
  filters: {
    school?: string;
    course?: string;
    className?: string;
    uc?: string;
    riskStatus?: string;
    enrollmentStatus?: string;
    emailStatus?: string;
  };
}

const CAMPAIGN_ROUTINE_DRAFT_STORAGE_KEY = "campaign:routine-draft";

export function readCampaignRoutineDraft(): CampaignRoutineDraft | null {
  if (typeof window === "undefined") return null;

  const storedValue = window.sessionStorage.getItem(
    CAMPAIGN_ROUTINE_DRAFT_STORAGE_KEY,
  );
  if (!storedValue) return null;

  try {
    return JSON.parse(storedValue) as CampaignRoutineDraft;
  } catch {
    window.sessionStorage.removeItem(CAMPAIGN_ROUTINE_DRAFT_STORAGE_KEY);
    return null;
  }
}

export function writeCampaignRoutineDraft(draft: CampaignRoutineDraft) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    CAMPAIGN_ROUTINE_DRAFT_STORAGE_KEY,
    JSON.stringify(draft),
  );
}

export function clearCampaignRoutineDraft() {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(CAMPAIGN_ROUTINE_DRAFT_STORAGE_KEY);
}
