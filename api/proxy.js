// Fetches Letterboxd watchlist pages on behalf of the browser (Letterboxd blocks direct
// cross-origin requests). Locked down so it can't be used as a general proxy:
//  - only https://letterboxd.com/<username>/watchlist/page/<n>/ is allowed
//  - the query string is dropped, so every request for a page maps to the same URL
//  - no CORS headers: the site calls it same-origin, so other websites can't read it
// Successful pages are cached briefly at Vercel's edge, so repeat scans of the same
// watchlist don't hit Letterboxd again (fewer requests = less chance of being blocked).
const ALLOWED_HOSTS = new Set(['letterboxd.com', 'www.letterboxd.com']);
const WATCHLIST_PAGE_PATH = /^\/[a-z0-9_]{1,40}\/watchlist\/page\/\d{1,3}\/?$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url param');
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).send('Invalid url');
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) || !WATCHLIST_PAGE_PATH.test(parsed.pathname)) {
    return res.status(403).send('Only Letterboxd watchlist pages are allowed');
  }
  const upstreamUrl = `https://letterboxd.com${parsed.pathname.toLowerCase()}`;

  try {
    const r = await fetch(upstreamUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,sv;q=0.8',
        'Referer': 'https://letterboxd.com/'
      }
    });
    if (!ALLOWED_HOSTS.has(new URL(r.url).hostname)) {
      return res.status(403).send('Redirected away from letterboxd.com');
    }
    const text = await r.text();
    // A successful first page = one watchlist scanned. Counted here, server-side, so ad
    // blockers can't hide it (they do hide Web Analytics).
    if (r.status === 200 && /\/page\/1\/?$/.test(parsed.pathname)) {
      await countScan(parsed.pathname.split('/')[1].toLowerCase());
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache real pages and real 404s at the edge; never cache blocks or errors.
    if (r.status === 200) {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=120');
    } else if (r.status === 404) {
      res.setHeader('Cache-Control', 'public, s-maxage=120');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    return res.status(r.status).send(text);
  } catch (e) {
    console.error('[Vercel Serverless Proxy Error]', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send('Upstream fetch failed');
  }
}

// Anonymous usage counter in Upstash Redis (Vercel Storage). Stores only numbers: a scan
// count per day, and HyperLogLog sketches for unique watchlists. A HyperLogLog keeps an
// estimate of how many different values it has seen, not the values themselves, and the
// username is hashed before it gets there, so no username or IP is ever stored.
// Does nothing if the store isn't connected, and never holds up or breaks a scan.
async function countScan(username) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    const { createHash } = await import('node:crypto');
    const id = createHash('sha256').update(`unwatchd:${username}`).digest('hex').slice(0, 16);
    const day = new Date().toISOString().slice(0, 10);
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', 'scans:total'],
        ['INCR', `scans:${day}`],
        ['PFADD', 'watchlists:all', id],
        ['PFADD', `watchlists:${day}`, id]
      ]),
      signal: AbortSignal.timeout(1500)
    });
  } catch (e) {
    console.warn('[usage counter] skipped', e?.name || e);
  }
}
