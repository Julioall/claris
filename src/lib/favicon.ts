const FAVICON_LINK_ID = 'dynamic-favicon';

export function syncFaviconWithPrimaryColor() {
  if (typeof document === 'undefined') return;

  const rootStyle = getComputedStyle(document.documentElement);
  const primary = rootStyle.getPropertyValue('--primary').trim();
  if (!primary) return;

  const color = `hsl(${primary})`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 3v4" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 5h-4" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18H3" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
