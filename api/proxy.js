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
