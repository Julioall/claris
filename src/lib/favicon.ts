const FAVICON_LINK_ID = 'dynamic-favicon';

export function syncFaviconWithPrimaryColor() {
  if (typeof document === 'undefined') return;

  const rootStyle = getComputedStyle(document.documentElement);
  const primary = rootStyle.getPropertyValue('--primary').trim();
  if (!primary) return;

  const color = `hsl(${primary})`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="20 20 40 40" fill="none"><circle cx="40" cy="40" r="18" stroke="${color}" stroke-width="4"/><circle cx="40" cy="40" r="6" fill="${color}"/></svg>`;
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
