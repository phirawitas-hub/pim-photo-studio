// Only the deployed Pages shell has a commit SHA in its entry point.
export function startAutoUpdate(canReload, notify) {
  const entry = document.querySelector('script[type="module"][src*="app.mjs"]');
  if (!entry) return;
  const script = new URL(entry.src);
  const running = script.searchParams.get('v');
  const valid = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  const loaded = new URL(import.meta.url).searchParams.get('v');
  if (script.origin !== location.origin || !valid(loaded)) return;

  const endpoint = new URL('./release.json', script);
  let checking = false;
  let pending = '';
  let lastCheck = 0;
  let navigating = false;

  async function check() {
    if (document.hidden || !navigator.onLine || checking || navigating) return;
    if (pending && !canReload()) return;
    if (Date.now() - lastCheck < (pending ? 5000 : 10000)) return;
    checking = true;
    lastCheck = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10000);
    try {
      endpoint.searchParams.set('t', String(lastCheck));
      const response = await fetch(endpoint, {cache:'no-store', signal:abort.signal});
      if (!response.ok) return;
      const {release} = await response.json();
      if (!valid(release)) return;
      if (release === running && release === loaded) { pending = ''; return; }
      const changed = release !== pending;
      pending = release;
      if (!canReload() || document.hidden) {
        if (changed && !document.hidden) notify();
        return;
      }
      const url = new URL(location.href);
      // A CDN edge can briefly serve an older shell after the marker changes.
      // Retry on a later check instead of reloading the same URL in a loop.
      if (url.searchParams.get('v') === release && Date.now() - Number(url.searchParams.get('updated')) < 60000) return;
      url.searchParams.set('v', release);
      url.searchParams.set('updated', String(Date.now()));
      navigating = true;
      location.replace(url.href);
    } catch {
      // A lost connection leaves the current app available until the next check.
    } finally {
      clearTimeout(timer);
      checking = false;
    }
  }
  setInterval(check, 60000);
  setInterval(() => { if (pending) check(); }, 5000);
  for (const event of ['focus','online','pageshow']) window.addEventListener(event, check);
  document.addEventListener('visibilitychange', check);
  check();
}
