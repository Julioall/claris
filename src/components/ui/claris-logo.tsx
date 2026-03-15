/**
 * Claris brand components.
 * Both use `currentColor` so they adopt the text color of their container.
 * Use Tailwind text utilities (e.g. `text-primary`, `text-sidebar-foreground`)
 * on the parent or directly on the component to set the color.
 */

interface LogoProps {
  className?: string;
}

/** Full wordmark — symbol + "Claris" text. Use on login and wide areas. */
export function ClarisLogo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 280 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Claris"
      role="img"
    >
      <circle cx="36" cy="40" r="18" stroke="currentColor" strokeWidth="4" />
      <circle cx="36" cy="40" r="6" fill="currentColor" />
      <text
        x="70"
        y="50"
        fontFamily="Inter, Arial, sans-serif"
        fontSize="32"
        fontWeight="600"
        fill="currentColor"
        letterSpacing="0.5"
      >
        Claris
      </text>
    </svg>
  );
}

/** Icon only — circle symbol. Use on tabs, collapsed sidebar, favicon contexts. */
export function ClarisIcon({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="40" cy="40" r="18" stroke="currentColor" strokeWidth="4" />
      <circle cx="40" cy="40" r="6" fill="currentColor" />
    </svg>
  );
}
