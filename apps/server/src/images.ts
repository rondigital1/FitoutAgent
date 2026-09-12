import { Router } from 'express';

/** Retailer CDN hosts whose product images the panel is allowed to render.
 * The panel requests /img?u=… so no request ever leaves the browser toward a retailer. */
const ALLOWED_HOSTS = new Set([
  'i5.walmartimages.com',
  'i5.walmartimages.ca',
  'pisces.bbystatic.com',
  'cdn.shopify.com',
]);

const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 5_000;

function allowedUrl(raw: string): URL | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  return url;
}

export const imageProxy = Router();

imageProxy.get('/img', async (req, res) => {
  const raw = typeof req.query.u === 'string' ? req.query.u : '';
  const url = allowedUrl(raw);
  if (!url) { res.status(400).json({ error: 'Image host not allowed' }); return; }

  const abort = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { signal: abort, redirect: 'follow' });
    const type = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || !type.startsWith('image/')) {
      res.status(502).json({ error: 'Upstream returned no image' });
      return;
    }
    const length = Number(upstream.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) { res.status(413).json({ error: 'Image too large' }); return; }

    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.byteLength > MAX_BYTES) { res.status(413).json({ error: 'Image too large' }); return; }

    res.set({
      'Content-Type': type,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=86400, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Image fetch failed' });
  }
});
