import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CheckCheck,
  ContactRound,
  Download,
  FileText,
  MapPin,
  Music4,
  Video,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { callWhatsAppMessaging } from '@/features/whatsapp/api/messaging';
import {
  formatFileSize,
  formatMessageTime,
  getMessageTypeLabel,
  getRenderableMessageText,
} from '@/features/whatsapp/lib/chat';
import type {
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WhatsAppResolvedMedia,
} from '@/features/whatsapp/types';
import { cn } from '@/lib/utils';

function isClientGeneratedMessageId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function MessageStatusIcon({
  status,
  className,
}: {
  status?: WhatsAppMessageStatus;
  className?: string;
}) {
  if (status === 'read' || status === 'delivered') {
    return <CheckCheck className={cn('h-3.5 w-3.5', className)} />;
  }

  if (status === 'pending' || status === 'sent') {
    return <Check className={cn('h-3.5 w-3.5', className)} />;
  }

  return null;
}

function getMediaFileMeta(fileName: string, mimeType: string | null) {
  const normalizedName = fileName.trim();
  const extensionFromName = normalizedName.includes('.')
    ? normalizedName.split('.').pop()?.trim().toUpperCase() ?? null
    : null;
  const extensionFromMime = mimeType?.split('/').pop()?.trim().toUpperCase() ?? null;

  return extensionFromName || extensionFromMime || 'ARQ';
}

function MediaFileIcon({
  type,
  mimeType,
}: {
  type: WhatsAppMessage['type'];
  mimeType: string | null;
}) {
  if (type === 'audio') {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Music4 className="h-5 w-5" />
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Video className="h-5 w-5" />
      </div>
    );
  }

  const fileMeta = getMediaFileMeta('arquivo', mimeType);
  const isPdf = mimeType === 'application/pdf' || fileMeta === 'PDF';

  return (
    <div
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg text-[11px] font-semibold',
        isPdf ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
      )}
    >
      {isPdf ? 'PDF' : <FileText className="h-5 w-5" />}
    </div>
  );
}

function MediaFileCard({
  type,
  fileName,
  mimeType,
  fileSize,
  mediaSource,
  isLoading,
}: {
  type: WhatsAppMessage['type'];
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  mediaSource: string | null;
  isLoading: boolean;
}) {
  const fileMeta = getMediaFileMeta(fileName, mimeType);
  const canDownload = !!mediaSource;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-background/95 p-3 shadow-sm',
        canDownload && 'transition-colors hover:bg-muted/40',
      )}
    >
      <MediaFileIcon type={type} mimeType={mimeType} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{fileName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fileMeta}
          {fileSize ? ` - ${formatFileSize(fileSize)}` : ''}
          {!fileSize && isLoading ? ' - preparando...' : ''}
        </p>
      </div>

      {canDownload ? (
        <Button type="button" variant="outline" size="icon" asChild>
          <a href={mediaSource} download={fileName} aria-label={`Baixar ${fileName}`}>
            <Download className="h-4 w-4" />
          </a>
        </Button>
      ) : (
        <Button type="button" variant="outline" size="icon" disabled aria-label={`Baixar ${fileName}`}>
          <Download className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function useResolvedMedia(instanceId: string | null, message: WhatsAppMessage) {
  const needsResolve = !!instanceId
    && !!message.id
    && !!message.remote_jid
    && !!message.media
    && !isClientGeneratedMessageId(message.id)
    && (message.media.requires_resolve || (!message.media.url && !message.media.preview_data_url));

  return useQuery({
    queryKey: ['whatsapp-media', instanceId, message.id],
    queryFn: async () => {
      const data = await callWhatsAppMessaging('resolve_media', {
        instance_id: instanceId,
        remote_jid: message.remote_jid,
        message_id: message.id,
        mime_type: message.media?.mime_type,
        file_name: message.media?.file_name,
        convert_to_mp4: message.type === 'video',
      });

      return (data.media ?? null) as WhatsAppResolvedMedia | null;
    },
    enabled: needsResolve,
    staleTime: Infinity,
    retry: false,
  });
}

function MessageMedia({ instanceId, message }: { instanceId: string | null; message: WhatsAppMessage }) {
  const resolvedMedia = useResolvedMedia(instanceId, message);
  const shouldPreferResolvedMedia = !!message.media?.requires_resolve;
  const mediaSource = shouldPreferResolvedMedia
    ? resolvedMedia.data?.data_url ?? message.media?.preview_data_url ?? null
    : message.media?.url ?? resolvedMedia.data?.data_url ?? message.media?.preview_data_url ?? null;
  const fileName = message.media?.file_name ?? resolvedMedia.data?.file_name ?? getMessageTypeLabel(message.type);
  const mimeType = message.media?.mime_type ?? resolvedMedia.data?.mime_type ?? null;
  const fileSize = message.media?.file_size_bytes ?? null;

  if (!message.media) return null;

  if (!mediaSource && resolvedMedia.isLoading && (message.type === 'image' || message.type === 'sticker')) {
    return <Skeleton className="h-40 w-64 rounded-2xl" />;
  }

  if (!mediaSource && resolvedMedia.isError) {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>Nao foi possivel carregar a midia.</span>
        </div>
      </div>
    );
  }

  if (!mediaSource && shouldPreferResolvedMedia && !resolvedMedia.isLoading) {
    return (
      <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Midia indisponivel no momento.
      </div>
    );
  }

  if (message.type === 'image' && mediaSource) {
    return (
      <a
        href={mediaSource}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-xl border border-border/70"
      >
        <img src={mediaSource} alt={fileName} className="max-h-80 w-full object-cover" />
      </a>
    );
  }

  if (message.type === 'sticker' && mediaSource) {
    return (
      <div className="inline-flex bg-transparent p-1">
        <img src={mediaSource} alt="Figurinha" className="h-40 w-40 object-contain" />
      </div>
    );
  }

  if (message.type === 'video' || message.type === 'audio' || message.type === 'document') {
    return (
      <MediaFileCard
        type={message.type}
        fileName={fileName}
        mimeType={mimeType}
        fileSize={fileSize}
        mediaSource={mediaSource}
        isLoading={resolvedMedia.isLoading}
      />
    );
  }

  return null;
}

function MessageContactCard({ message }: { message: WhatsAppMessage }) {
  if (!message.contact) return null;

  return (
    <div className="rounded-2xl border bg-background/95 p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ContactRound className="h-4 w-4" />
        <span>{message.contact.display_name ?? 'Contato compartilhado'}</span>
      </div>
      {message.contact.organization && (
        <p className="mt-2 text-xs text-muted-foreground">{message.contact.organization}</p>
      )}
      {message.contact.phone_numbers.map((phone) => (
        <p key={phone} className="mt-2 text-xs text-muted-foreground">
          {phone}
        </p>
      ))}
    </div>
  );
}

function MessageLocationCard({ message }: { message: WhatsAppMessage }) {
  if (!message.location) return null;

  return (
    <a
      href={message.location.url ?? '#'}
      target="_blank"
      rel="noreferrer"
      className="block rounded-2xl border bg-background/95 p-3 shadow-sm transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <MapPin className="h-4 w-4" />
        <span>{message.location.name ?? 'Localizacao compartilhada'}</span>
      </div>
      {message.location.address && (
        <p className="mt-2 text-xs text-muted-foreground">{message.location.address}</p>
      )}
      {message.location.latitude !== null && message.location.longitude !== null && (
        <Badge variant="secondary" className="mt-3">
          {message.location.latitude.toFixed(4)}, {message.location.longitude.toFixed(4)}
        </Badge>
      )}
    </a>
  );
}

export function WhatsAppMessageBubble({
  instanceId,
  message,
}: {
  instanceId: string | null;
  message: WhatsAppMessage;
}) {
  const isOutgoing = message.direction === 'outgoing';
  const renderableText = getRenderableMessageText(message);
  const isSticker = message.type === 'sticker';

  return (
    <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] min-w-0 border px-4 py-3 text-sm shadow-sm',
          isOutgoing
            ? 'rounded-3xl rounded-br-md border-primary/20 bg-primary text-primary-foreground'
            : 'rounded-3xl rounded-bl-md border-border/70 bg-background text-foreground',
          isSticker && 'border-0 bg-transparent p-0 shadow-none',
        )}
      >
        {(message.type === 'image'
          || message.type === 'video'
          || message.type === 'audio'
          || message.type === 'document'
          || message.type === 'sticker') && (
          <MessageMedia instanceId={instanceId} message={message} />
        )}

        {message.type === 'contact' && <MessageContactCard message={message} />}
        {message.type === 'location' && <MessageLocationCard message={message} />}

        {renderableText && (
          <p
            className={cn(
              'whitespace-pre-wrap break-words',
              (message.media || message.contact || message.location) && 'mt-3',
            )}
          >
            {renderableText}
          </p>
        )}

        <div
          className={cn(
            'mt-1.5 flex items-center justify-end gap-1 text-[10px]',
            isOutgoing ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          <span>{formatMessageTime(message.sent_at)}</span>
          {isOutgoing && <MessageStatusIcon status={message.status} className="text-current" />}
        </div>
      </div>
    </div>
  );
}
