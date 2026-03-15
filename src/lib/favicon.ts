const FAVICON_LINK_ID = 'dynamic-favicon';

export function syncFaviconWithPrimaryColor() {
  if (typeof document === 'undefined') return;

  const rootStyle = getComputedStyle(document.documentElement);
  const primary = rootStyle.getPropertyValue('--primary').trim();
  if (!primary) return;

  const color = `hsl(${primary})`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="34 26 52 55" fill="none"><path d="M60 30 L64 48 L82 52 L64 56 L60 74 L56 56 L38 52 L56 48 Z" fill="${color}"/><path d="M76 34 L77.5 39 L82.5 40.5 L77.5 42 L76 47 L74.5 42 L69.5 40.5 L74.5 39 Z" fill="${color}"/><path d="M44 64 L45.5 69 L50.5 70.5 L45.5 72 L44 77 L42.5 72 L37.5 70.5 L42.5 69 Z" fill="${color}"/></svg>`;
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  link.id = FAVICON_LINK_ID;
  link.type = 'image/svg+xml';
  link.href = href;
}
