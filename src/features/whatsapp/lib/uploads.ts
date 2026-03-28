import type { DraftAttachment, DraftAttachmentKind } from '@/features/whatsapp/types';

const IMAGE_MIME_PREFIX = 'image/';
const VIDEO_MIME_PREFIX = 'video/';
const AUDIO_MIME_PREFIX = 'audio/';

function inferAttachmentKind(file: File): DraftAttachmentKind | null {
  if (file.type.startsWith(IMAGE_MIME_PREFIX)) return 'image';
  if (file.type.startsWith(VIDEO_MIME_PREFIX)) return 'video';
  if (file.type.startsWith(AUDIO_MIME_PREFIX)) return 'audio';
  if (file.type === 'application/pdf' || file.type.startsWith('application/')) return 'document';

  return null;
}

function readFileAsDataUrl(file: File, onProgress?: (progress: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler arquivo'));
    reader.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.max(1, Math.round((event.loaded / event.total) * 35)));
    };
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

export async function createDraftAttachment(file: File, onProgress?: (progress: number) => void): Promise<DraftAttachment> {
  const kind = inferAttachmentKind(file);
  if (!kind) {
    throw new Error('Formato de arquivo nao suportado. Use imagem, video, audio ou PDF.');
  }

  const dataUrl = await readFileAsDataUrl(file, onProgress);
  const base64 = dataUrl.split(',')[1] ?? '';
  if (!base64) {
    throw new Error('Nao foi possivel converter o arquivo para envio.');
  }

  const previewUrl = kind === 'document' ? null : URL.createObjectURL(file);
  const canSendAsSticker = kind === 'image';

  return {
    id: crypto.randomUUID(),
    file_name: file.name || `arquivo-${Date.now()}`,
    mime_type: file.type || 'application/octet-stream',
    size: file.size,
    base64,
    preview_url: previewUrl,
    data_url: dataUrl,
    kind,
    can_send_as_sticker: canSendAsSticker,
    send_as_sticker: file.type === 'image/webp',
  };
}

export function revokeDraftAttachment(attachment: DraftAttachment | null) {
  if (!attachment?.preview_url) return;
  URL.revokeObjectURL(attachment.preview_url);
}
