import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/features/whatsapp/lib/chat';

interface WhatsAppAvatarProps {
  name: string;
  imageUrl?: string | null;
  className?: string;
}

export function WhatsAppAvatar({ name, imageUrl, className }: WhatsAppAvatarProps) {
  return (
    <Avatar className={className}>
      <AvatarImage src={imageUrl ?? undefined} alt={name} />
      <AvatarFallback className="bg-primary/10 text-primary">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
