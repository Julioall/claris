import { useRef, type KeyboardEvent } from 'react';
import { FileText, Image as ImageIcon, LoaderCircle, Music4, Paperclip, Send, Video, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { formatFileSize } from '@/features/whatsapp/lib/chat';
import type { DraftAttachment } from '@/features/whatsapp/types';

interface WhatsAppComposerProps {
  value: string;
  attachment: DraftAttachment | null;
  error: string | null;
  isSending: boolean;
  isGroup: boolean;
  uploadProgress: number;
  uploadStage: 'idle' | 'preparing' | 'uploading';
  isCaptionDisabled: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onSelectFiles: (files: FileList | null) => void;
  onRemoveAttachment: () => void;
  onToggleSticker: (nextValue: boolean) => void;
}

function AttachmentIcon({ attachment }: { attachment: DraftAttachment }) {
  if (attachment.send_as_sticker || attachment.kind === 'image') {
    return <ImageIcon className="h-4 w-4" />;
  }

  if (attachment.kind === 'video') {
    return <Video className="h-4 w-4" />;
  }

  if (attachment.kind === 'audio') {
    return <Music4 className="h-4 w-4" />;
  }

  return <FileText className="h-4 w-4" />;
}

function AttachmentPreview({
  attachment,
  uploadProgress,
  uploadStage,
  onRemove,
  onToggleSticker,
}: {
  attachment: DraftAttachment;
  uploadProgress: number;
  uploadStage: 'idle' | 'preparing' | 'uploading';
  onRemove: () => void;
  onToggleSticker: (nextValue: boolean) => void;
}) {
  const preview = attachment.preview_url ?? attachment.data_url;

  return (
    <div className="rounded-2xl border bg-background p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AttachmentIcon attachment={attachment} />
            <span className="truncate">{attachment.file_name}</span>
            {attachment.send_as_sticker && (
              <Badge variant="secondary">
                Figurinha
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatFileSize(attachment.size)} {'\u2022'} {attachment.mime_type}
          </p>
        </div>

        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remover anexo">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {preview && attachment.kind === 'image' && (
        <div className="mt-3 overflow-hidden rounded-xl border bg-muted/20 p-2">
          <img
            src={preview}
            alt={attachment.file_name}
            className="max-h-52 w-full rounded-md object-cover"
          />
        </div>
      )}

      {preview && attachment.kind === 'video' && (
        <div className="mt-3 overflow-hidden rounded-xl border bg-muted/20 p-2">
          <video src={preview} controls className="max-h-52 w-full rounded-md" />
        </div>
      )}

      {preview && attachment.kind === 'audio' && (
        <div className="mt-3 rounded-xl border bg-muted/20 p-3">
          <audio src={preview} controls className="w-full" />
        </div>
      )}

      {attachment.can_send_as_sticker && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={attachment.send_as_sticker ? 'default' : 'outline'}
            onClick={() => onToggleSticker(!attachment.send_as_sticker)}
          >
            {attachment.send_as_sticker ? 'Enviando como figurinha' : 'Enviar como figurinha'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Imagens podem ser enviadas pelo endpoint de sticker da Evolution.
          </span>
        </div>
      )}

      {uploadStage !== 'idle' && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{uploadStage === 'preparing' ? 'Preparando arquivo...' : 'Enviando arquivo...'}</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}
    </div>
  );
}

export function WhatsAppComposer({
  value,
  attachment,
  error,
  isSending,
  isGroup,
  uploadProgress,
  uploadStage,
  isCaptionDisabled,
  onChange,
  onSend,
  onSelectFiles,
  onRemoveAttachment,
  onToggleSticker,
}: WhatsAppComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div className="shrink-0 border-t bg-background p-3">
      {error && (
        <div className="mb-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {isGroup && (
        <div className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          O envio para grupos ainda nao esta disponivel nesta primeira integracao.
        </div>
      )}

      {attachment && (
        <div className="mb-3">
          <AttachmentPreview
            attachment={attachment}
            uploadProgress={uploadProgress}
            uploadStage={uploadStage}
            onRemove={onRemoveAttachment}
            onToggleSticker={onToggleSticker}
          />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,audio/*,application/pdf,.webp"
        className="hidden"
        onChange={(event) => {
          onSelectFiles(event.target.files);
          event.currentTarget.value = '';
        }}
      />

      <div className="flex items-end gap-3">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-11 w-11 shrink-0"
          disabled={isSending || isGroup}
          onClick={() => inputRef.current?.click()}
          aria-label="Adicionar anexo"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isSending || isGroup || isCaptionDisabled}
          placeholder={
            isGroup
              ? 'Envio para grupos em breve'
              : isCaptionDisabled
                ? 'Este envio nao aceita legenda'
                : attachment
                  ? 'Adicione uma legenda (opcional)'
                  : 'Digite uma mensagem no WhatsApp...'
          }
          className="min-h-[44px] max-h-[140px] flex-1 resize-none border-border/70 bg-background"
        />

        <Button
          type="button"
          size="icon"
          className="h-11 w-11 shrink-0"
          disabled={isSending || isGroup || (!attachment && !value.trim())}
          onClick={onSend}
          aria-label="Enviar mensagem"
        >
          {isSending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
