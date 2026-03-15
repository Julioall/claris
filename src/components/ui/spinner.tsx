import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  onAccent?: boolean;
}

export function Spinner({ className, onAccent = false }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        'inline-block animate-spin [animation-duration:1.1s]',
        onAccent ? 'text-black' : 'text-primary',
        className
      )}
      aria-hidden="true"
    >
      <g>
        <circle
          cx="40"
          cy="40"
          r="20"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.15"
        />

        <path
          d="M40 20 A20 20 0 0 1 60 40"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />

        <circle cx="40" cy="40" r="6" fill="currentColor" opacity="0.9" />
      </g>
    </svg>
  );
}
